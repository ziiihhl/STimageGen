import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

test('standalone window edits prompts, polls progress and inserts only into its source chat', async () => {
    for (const mode of ['normal', 'switched', 'editing', 'context', 'context-panel', 'route-anima', 'route-krea']) {
        const switchDuringUpload = mode === 'switched';
        const contextMode = mode.startsWith('context');
        const routeMode=mode.startsWith('route-');
        const workflowKey = mode==='route-krea'?'comfyui:04_Lustify_Krea2.json':mode==='route-anima'?'comfyui:02_Anima_Turbo.json':'comfyui:author.json';
        const routedModel=mode==='route-krea'?'lustifyKrea2.safetensors':'anima_turboV11.safetensors';
        const elements = [], calls = [], uploads = [];
        class Element {
            constructor(tag) { this.tag = tag; this.children = []; this.events = new Map(); this.style = {}; this.dataset = {}; this.value = ''; this.disabled = false; elements.push(this); }
            append(child) { this.children.push(child); }
            replaceChildren(...children) { this.children = children; }
            addEventListener(name, fn) { this.events.set(name, fn); }
            removeAttribute() {} scrollIntoView() {}
            setAttribute(name, value) { this[name] = value; }
            get offsetWidth() { return Number.parseFloat(this.style.width) || 410; }
            get offsetHeight() { return this.className === 'stb-heading' ? 80 : 520; }
            getBoundingClientRect() { return { left: Number.parseFloat(this.style.left) || 0, top: Number.parseFloat(this.style.top) || 0, width: this.offsetWidth, height: this.offsetHeight }; }
            get options() { return this.children; }
        }
        const container = new Element('div'), toolbar = new Element('div');
        const prior = Object.fromEntries(['document', 'window', '__stimagegenPanelFixture'].map(name => [name, globalThis[name]]));
        const storage = new Map([['stimagegen_routing',routeMode?'auto':'manual']]);
        const ctx = { chatId: 'story', characterId: 0, groupId: null, chat: [{ name: 'Maya', mes: 'PRIVATE_CHAT_TEXT' }], name2: 'Maya', name1: 'User',
            accountStorage: { getItem: key => storage.get(key) || '', setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) }, getCharacterCardFields: () => { throw Error('Do not read character context'); },
            addOneMessage(message) { calls.push(['render', message]); }, async saveChat() { calls.push(['save']); } };
        const fixture = {
            async saveImage(...args) { uploads.push(args); if (switchDuringUpload) ctx.chatId = 'another-chat'; return '/user/images/result.png'; },
            async service(method, params) {
                calls.push([method, params]);
                if (method === 'workflows') return { items: [{ key: workflowKey, title: 'Author workflow', valid: true }], defaultWorkflow: workflowKey };
                if (method === 'workflowDetail') return { main_model: { supported: true, name: routeMode?routedModel:'anima.safetensors', models: ['anima.safetensors', 'custom.safetensors',routedModel] } };
                if (method === 'modelRoute') return {family:mode==='route-krea'?'krea':'anima',reason:'测试画风'};
                if (method === 'prompt') return {positive:'A red umbrella.',negative:'blur',summary_zh:'雨伞'};
                if (method === 'create') return { id: 'job-1', status: 'queued', progress:0.1 };
                if (method === 'job') return { id: 'job-1', status: 'success', images: [{ index: 0 }] };
                if (method === 'image') return { buffer: new Uint8Array([137, 80, 78, 71]).buffer, mime: 'image/png' };
                throw new Error('Unexpected method');
            },
        };
        globalThis.__stimagegenPanelFixture = fixture;
        globalThis.document = { body: container, createElement: tag => new Element(tag), querySelector: selector => selector === '#extensions_settings' ? container : toolbar };
        const windowEvents = new Map();
        globalThis.window = { innerWidth: 1200, innerHeight: 900, addEventListener: (name, fn) => windowEvents.set(name, fn) };
        try {
            let source = await fs.readFile(new URL('../extension/image-panel.js', import.meta.url), 'utf8');
        source=source.replace("'./generation-history.js?v=1.2.1'",JSON.stringify(new URL('../extension/generation-history.js',import.meta.url).href));
        source=source.replace("'./model-routing.js?v=1.2.0'",JSON.stringify(new URL('../extension/model-routing.js',import.meta.url).href));
        source=source.replace("'./automation.js?v=1.1.0'",JSON.stringify(new URL('../extension/automation.js',import.meta.url).href));
            const moduleUrl = code => `data:text/javascript,${encodeURIComponent(code)}`;
            source = source.replace("'./image-service.js?v=1.2.0'", JSON.stringify(moduleUrl('export class ImageServiceClient {call(m,p){return globalThis.__stimagegenPanelFixture.service(m,p);} }')));
            source = source.replace("'../../../../../scripts/utils.js'", JSON.stringify(moduleUrl('export const saveBase64AsFile=(...a)=>globalThis.__stimagegenPanelFixture.saveImage(...a);')));
            source = source.replace("'../../../../../scripts/RossAscends-mods.js'", JSON.stringify(moduleUrl('export const getMessageTimeStamp=()=>"fixture-time";')));
            source = source.replace("'../../../../../scripts/constants.js'", JSON.stringify(moduleUrl('export const MEDIA_TYPE={IMAGE:"image"},MEDIA_SOURCE={GENERATED:"generated"},MEDIA_DISPLAY={GALLERY:"gallery"};')));
            const { mountImagePanel } = await import(`data:text/javascript;base64,${Buffer.from(source + `\n// fixture ${mode}`).toString('base64')}`);
            mountImagePanel({ getContext: () => ctx, isBusy: () => false, api: async () => { throw Error('Mock service expected'); } });
            const click = async text => {
                const button = elements.find(element => element.tag === 'button' && element.textContent === text);
                button.events.get('click')();
                const limit = Date.now() + 4000;
                while ((button.disabled || elements.some(element => element['aria-busy'] === 'true')) && Date.now() < limit) await new Promise(resolve => setTimeout(resolve, 5));
                assert.equal(button.disabled, false);
            };
            // Empty chats must fail locally rather than submit a meaningless prompt.
            ctx.chat = [];
            await click('生图');
            assert.equal(calls.length,0);
            if (contextMode) {
                ctx.chat = [
                    {is_user:true,mes:'OLD_MESSAGE_DO_NOT_SEND'},
                    {is_user:false,mes:'Scene A'},
                    {is_system:true,mes:'SYSTEM_DO_NOT_SEND'},
                    {is_user:true,mes:'Scene B'},
                    {is_user:false,mes:'Scene C'},
                    {is_user:true,mes:'Scene D'},
                    {is_user:false,mes:'Scene E'},
                    {is_system:true,mes:'IMAGE_DO_NOT_SEND'},
                    {mes:'   '},
                ];
                // The manual default stays at four even if automatic context is configured differently.
                storage.set('stimagegen_auto_settings',JSON.stringify({mode:'off',contextCount:1,every:5}));
            } else {
                ctx.chat = [{ name:'Maya', mes:'PRIVATE_CHAT_TEXT' }];
                elements.find(element => element.placeholder?.startsWith('可选：')).value='A red umbrella.';
            }
            const originalChatLength = ctx.chat.length;
            if (mode === 'editing') {
                await click('只生成提示词');
                elements.find(element => element.placeholder === '生成后可在这里微调画面。').value='A blue umbrella.';
                await click('刷新工作流');
                const model = elements.find(element => element['aria-label'] === '主模型文件');
                model.value = 'custom.safetensors'; model.events.get('change')();
                await click('用当前提示词绘图');
            } else await click(mode === 'context' ? '生图' : '生成图片');
            if(switchDuringUpload) assert.ok(elements.some(element => String(element.textContent).includes('未插入其他对话')));
            const panel = elements.find(element => element.className?.includes('stb-window'));
            const heading = elements.find(element => element.className === 'stb-heading');
            assert.equal(panel.hidden, false);
            const event = { preventDefault() {}, stopPropagation() {}, pointerId: 1, button: 0, clientX: 800, clientY: 320 };
            heading.events.get('pointerdown')(event);
            heading.events.get('pointermove')({ ...event, clientX: -900, clientY: 5000 });
            heading.events.get('pointerup')(event);
            assert.equal(panel.style.left, '0px');
            assert.equal(panel.style.top, '820px'); // Title bar remains reachable.
            assert.equal(JSON.parse(storage.get('stimagegen_window_rect')).top, 820);
            const minimize = elements.find(element => element['aria-label'] === '最小化生图窗口');
            minimize.events.get('click')(event);
            assert.equal(panel.dataset.collapsed, 'true');
            minimize.events.get('click')(event);
            assert.equal(panel.dataset.collapsed, 'false');
            elements.find(element => element['aria-label'] === '关闭生图窗口').events.get('click')(event);
            assert.equal(panel.hidden, true);
            ctx.chatId='story';
            await elements.find(element => element.textContent === '打开生图窗口').events.get('click')();
            assert.equal(panel.hidden, false);
            assert.equal(panel.style.top, '820px');
            globalThis.window.innerHeight = 500;
            windowEvents.get('resize')();
            assert.equal(panel.style.top, '420px');
            elements.find(element => element.textContent === '重置窗口位置').events.get('click')();
            assert.equal(storage.has('stimagegen_window_rect'), false);
            const promptRequest = calls.find(([name]) => name === 'prompt')[1];
            if (contextMode) {
                const messages = JSON.parse(promptRequest.requirement.split('\n').slice(1).join('\n'));
                assert.deepEqual(messages,[{role:'user',content:'Scene B'},{role:'assistant',content:'Scene C'},{role:'user',content:'Scene D'},{role:'assistant',content:'Scene E'}]);
                assert.equal(JSON.stringify(calls).includes('OLD_MESSAGE_DO_NOT_SEND'),false);
                assert.equal(JSON.stringify(calls).includes('SYSTEM_DO_NOT_SEND'),false);
            } else assert.deepEqual(promptRequest,{requirement:'A red umbrella.',workflow_key:workflowKey,...(routeMode?{main_model:routedModel}:{})});
            assert.equal(JSON.stringify(calls).includes('PRIVATE_CHAT_TEXT'),false);
            if(routeMode) {
                assert.equal(calls.filter(([name])=>name==='modelRoute').length,1);
                const selector=elements.find(element=>element['aria-label']==='模型选择方式');
                const model=elements.find(element=>element['aria-label']==='主模型文件');
                model.events.get('change')();assert.equal(selector.value,'manual');
                assert.equal(storage.get('stimagegen_routing'),'manual');
            }
            const drawing = calls.find(([name]) => name === 'create')[1];
            assert.equal(drawing.workflow_key,workflowKey);
            if (contextMode) assert.equal(drawing.requirement,promptRequest.requirement);
            assert.equal(calls.filter(([name]) => name === 'job').length,1);
            assert.deepEqual(drawing.params, mode === 'editing' ? { main_model: 'custom.safetensors' } : routeMode?{main_model:routedModel}:{}); // No unintended resolution/sampler overrides.
            assert.equal(drawing.positive, mode === 'editing' ? 'A blue umbrella.' : 'A red umbrella.');
            assert.equal(uploads.length, 1);
            if (switchDuringUpload) {
                assert.equal(ctx.chat.length, originalChatLength);
                assert.equal(calls.some(([name]) => name === 'save'), false);

            } else {
                assert.equal(ctx.chat.length, originalChatLength + 1);
                assert.equal(ctx.chat.at(-1).extra.media[0].url, '/user/images/result.png');
                assert.equal(calls.filter(([name]) => name === 'save').length, 1);
                const before=calls.filter(([name])=>name==='create').length;
                await click('生图');
                assert.equal(calls.filter(([name])=>name==='create').length,before);
                if(mode==='context') {
                    ctx.chat.push({is_user:true,mes:'New scene after last image'});
                    await click('生图');
                    assert.equal(calls.filter(([name])=>name==='create').length,before+1);
                }
            }
        } finally {
            for (const [name, value] of Object.entries(prior)) {
                if (value === undefined) delete globalThis[name]; else globalThis[name] = value;
            }
        }
    }
});
