import fs from 'node:fs';
import path from 'node:path';
import { failure } from './errors.mjs';

const ID = /^[a-zA-Z0-9_-]{1,100}$/;
export class ImageService {
    constructor(config, options = {}) {
        this.config = config;
        this.fetch = options.fetch ?? fetch;
        this.store = options.store === undefined ? path.resolve('config/stimagegen-jobs.json') : options.store;
        this.jobs = new Map();
        if (this.store && fs.existsSync(this.store)) {
            for (const [id, owner] of Object.entries(JSON.parse(fs.readFileSync(this.store, 'utf8')))) if (ID.test(id) && typeof owner === 'string') this.jobs.set(id, owner);
        }
    }
    remember(id, user) {
        if (!ID.test(id)) throw failure(502, 'IMAGE_SERVICE_INVALID_RESPONSE', 'The image service returned an invalid task ID.');
        this.jobs.set(id, user);
        if (this.store) {
            fs.mkdirSync(path.dirname(this.store), { recursive: true, mode: 0o700 });
            const temporary = this.store + '.next';
            fs.writeFileSync(temporary, JSON.stringify(Object.fromEntries(this.jobs)), { mode: 0o600 });
            fs.renameSync(temporary, this.store);
        }
    }
    async request(route, body, image = false, timeoutMs = 90000) {
        const settings = this.config.imageService;
        if (!settings?.url || !settings?.token) throw failure(503, 'IMAGE_SERVICE_NOT_CONFIGURED', 'The drawing service connection is not configured.');
        let response;
        try {
            response = await this.fetch(settings.url + route, {
                method: body === undefined ? 'GET' : 'POST', redirect: 'error',
                headers: { Authorization: `Bearer ${settings.token}`, 'Content-Type': 'application/json', 'User-Agent': 'STImageGen/1.0' },
                body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(timeoutMs),
            });
        } catch { throw failure(502, 'IMAGE_SERVICE_UNREACHABLE', 'The local image service is unreachable.'); }
        if (!response.ok) throw failure(502, 'IMAGE_SERVICE_REQUEST_FAILED', `The image service returned HTTP ${response.status}.`);
        const limit = image ? 32 * 1024 * 1024 : 4 * 1024 * 1024;
        const reader = response.body.getReader(), chunks = []; let bytes = 0;
        try {
            for (;;) {
                const { value, done } = await reader.read(); if (done) break;
                bytes += value.length;
                if (bytes > limit) throw failure(502, 'IMAGE_SERVICE_RESPONSE_TOO_LARGE', 'The image service response is too large.');
                chunks.push(Buffer.from(value));
            }
        } finally { await reader.cancel().catch(() => {}); }
        const data = Buffer.concat(chunks);
        if (image) {
            const mime = (response.headers.get('Content-Type') ?? '').split(';')[0];
            if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) throw failure(502, 'INVALID_IMAGE', 'The drawing service did not return a supported image.');
            return { base64: data.toString('base64'), mime };
        }
        try { return JSON.parse(data.toString('utf8')); }
        catch { throw failure(502, 'IMAGE_SERVICE_INVALID_RESPONSE', 'The drawing service returned invalid JSON.'); }
    }
    async call(user, operation, params = {}) {
        if (operation === 'modelRoute') {
            if (!params || Object.keys(params).some(key=>key!=='requirement') || typeof params.requirement!=='string' || !params.requirement.trim() || params.requirement.length>16000) throw failure(400,'INVALID_MODEL_ROUTE','模型判断资料无效或过长。');
            const data=await this.request('/api/prompts/generate',{requirement:params.requirement,route_only:true},false,140000);
            if (!['anima','krea'].includes(data?.family) || typeof data.reason!=='string') throw failure(502,'INVALID_MODEL_ROUTE','接口未返回有效的模型分类，未提交绘图。');
            return {family:data.family,reason:data.reason.slice(0,200)};
        }
        if (operation === 'decide') {
            if(!params||Object.keys(params).some(key=>!['messages','previousSummary'].includes(key))||!Array.isArray(params.messages)||!params.messages.length||params.messages.length>20
                || params.messages.some(m=>!m||!['user','assistant'].includes(m.role)||typeof m.content!=='string')
                || (params.previousSummary!==undefined&&typeof params.previousSummary!=='string')
                || JSON.stringify(params.messages).length>12000 || (params.previousSummary?.length??0)>500) throw failure(400,'INVALID_DECISION_REQUEST','自动生图参考消息无效或过长。');
            const data=await this.request('/api/prompts/generate',{requirement:JSON.stringify(params.messages),decision_only:true,previous_summary:params.previousSummary??''},false,140000);
            if(typeof data?.should_generate!=='boolean'||typeof data.reason!=='string')throw failure(502,'INVALID_DECISION_RESPONSE','接口未返回有效的生图判断。');
            return {should_generate:data.should_generate,reason:data.reason.slice(0,200)};
        }
        if (operation === 'prompt') {
            if (!params || Object.keys(params).some(key => !['requirement','workflow_key','main_model'].includes(key)) || typeof params.requirement !== 'string'
                || !params.requirement.trim() || params.requirement.length > 16000) throw failure(400, 'INVALID_PROMPT', '请填写画面要求，最多16000字符。');
            for (const key of ['workflow_key','main_model']) if(params[key]!==undefined && (typeof params[key]!=='string' || params[key].length>1000)) throw failure(400,'INVALID_PROMPT','模型上下文无效。');
            const body={requirement:params.requirement,mode:this.config.promptMode??'natural'};
            if(params.workflow_key){body.workflow_key=params.workflow_key;body.values=params.main_model?{main_model:params.main_model}:{};}
            const data = await this.request('/api/prompts/generate', body, false, 140000);
            if (!data || typeof data.positive !== 'string' || !data.positive.trim() || typeof data.negative !== 'string'
                || (data.summary_zh !== undefined && typeof data.summary_zh !== 'string')) throw failure(502, 'INVALID_PROMPT_RESPONSE', '提示词接口返回格式无效。');
            return { positive: data.positive, negative: data.negative, summary_zh: data.summary_zh ?? '', ...(typeof data.reply === 'string' ? { reply: data.reply } : {}) };
        }
        if (operation === 'workflowDetail') {
            if (!params || Object.keys(params).some(key => key !== 'key') || typeof params.key !== 'string' || !params.key || params.key.length > 1000) throw failure(400, 'INVALID_WORKFLOW', '工作流参数无效。');
            const data = await this.request('/api/workflows/detail?key=' + encodeURIComponent(params.key));
            const model = data?.main_model;
            if (!model?.supported) return { main_model: { supported: false } };
            if (!Array.isArray(model.models) || model.models.some(name => typeof name !== 'string') || typeof model.name !== 'string') throw failure(502, 'INVALID_MODEL_RESPONSE', '生图服务返回的模型列表无效。');
            return { main_model: { supported: true, models: model.models, name: model.name } };
        }
        if (operation === 'workflows') {
            const data = await this.request('/api/workflows');
            return { items: (data.items ?? []).map(item => ({ key: item.key, title: item.title || item.name, valid: item.valid !== false })), comfy_error: data.comfy_error, defaultWorkflow: this.config.imageService?.defaultWorkflow ?? '' };
        }
        if (operation === 'create') {
            if (typeof params.workflow_key !== 'string' || !params.workflow_key || typeof params.positive !== 'string' || !params.positive.trim() || (params.negative !== undefined && typeof params.negative !== 'string')) throw failure(400, 'INVALID_IMAGE_JOB', 'Choose a workflow and provide positive/negative text.');
            const body = { workflow_key: params.workflow_key, positive: params.positive, negative: params.negative ?? '', requirement: String(params.requirement ?? '').slice(0, 16000), params: params.params ?? {} };
            if (Buffer.byteLength(JSON.stringify(body)) > 200000) throw failure(413, 'INVALID_IMAGE_JOB', 'The drawing request is too large.');
            const data = await this.request('/api/jobs', body);
            this.remember(data.id, user);
            return this.jobView(data);
        }
        if (!['job', 'image'].includes(operation) || !ID.test(params.id ?? '') || this.jobs.get(params.id) !== user) throw failure(403, 'IMAGE_JOB_NOT_OWNED', 'This drawing task does not belong to the current user.');
        if (operation === 'job') return this.jobView(await this.request(`/api/jobs/${params.id}`));
        if (!Number.isInteger(params.index) || params.index < 0 || params.index > 255) throw failure(400, 'INVALID_IMAGE_INDEX', 'Invalid output image index.');
        return this.request(`/api/images/${params.id}/${params.index}`, undefined, true);
    }
    jobView(data) {
        return { id: data.id, status: data.status, progress: data.progress, error: data.error, warnings: data.warnings ?? [], images: (data.images ?? []).map((image, index) => ({ index, filename: image.filename, width: image.width, height: image.height })) };
    }
}
