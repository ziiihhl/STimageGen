import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ImageService } from '../server/service.mjs';
import { loadConfig } from '../server/config.mjs';
import { mountRoutes } from '../server/index.mjs';

const config = { imageService: { url: 'https://service.test', token: 't'.repeat(48), defaultWorkflow: 'author' }, allowedOrigins: ['https://st.test'], promptMode: 'natural' };
test('prompt and drawing use existing endpoints without templates, chat context or changed workflow parameters', async () => {
    const calls=[];
    const service=new ImageService(config,{store:null,fetch:async (url,options) => {
        calls.push({url,options,body:options.body && JSON.parse(options.body)});
        assert.equal(options.headers.Authorization,'Bearer '+'t'.repeat(48));
        if (url.endsWith('/api/prompts/generate')) return Response.json({positive:'(A red cup:1.3) on a table.',negative:'',summary_zh:'红杯',model:'private-model'});
        if (url.endsWith('/api/jobs')) return Response.json({id:'one-job',status:'queued',api_prompt:'not for the browser'});
        if (url.endsWith('/api/jobs/one-job')) return Response.json({id:'one-job',status:'success',images:[{filename:'one.png'}]});
        return new Response(new Uint8Array([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
    }});
    const prompt=await service.call('alice','prompt',{requirement:'画一个杯子'});
    assert.deepEqual(calls[0].body,{requirement:'画一个杯子',mode:'natural'});
    assert.deepEqual(Object.keys(prompt).sort(),['negative','positive','summary_zh']);
    const job=await service.call('alice','create',{workflow_key:'author',positive:prompt.positive,negative:'',params:{}});
    assert.equal(job.api_prompt,undefined);
    assert.deepEqual(calls[1].body.params,{});
    assert.equal(calls[1].body.positive,prompt.positive);
    assert.equal((await service.call('alice','job',{id:job.id})).status,'success');
    assert.equal((await service.call('alice','image',{id:job.id,index:0})).base64,'iVBORw==');
    await assert.rejects(service.call('bob','job',{id:job.id}),{code:'IMAGE_JOB_NOT_OWNED'});
    await assert.rejects(service.call('alice','prompt',{requirement:'cup',sourceContext:{messages:[]}}),{code:'INVALID_PROMPT'});
    assert.equal(calls.length,4);
});

test('task ownership survives reload and upstream errors do not retry creations or leak credentials', async () => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stimagegen-test-'));
    try {
        const store=path.join(directory,'jobs.json');
        const service=new ImageService(config,{store,fetch:async()=>Response.json({id:'persisted',status:'queued'})});
        await service.call('alice','create',{workflow_key:'author',positive:'cup'});
        const reloaded=new ImageService(config,{store,fetch:async()=>Response.json({id:'persisted',status:'success'})});
        assert.equal((await reloaded.call('alice','job',{id:'persisted'})).status,'success');
        await assert.rejects(reloaded.call('bob','job',{id:'persisted'}),{code:'IMAGE_JOB_NOT_OWNED'});
        let calls=0;
        const failed=new ImageService(config,{store:null,fetch:async()=>{calls++;return new Response('secret upstream error',{status:502});}});
        await assert.rejects(failed.call('alice','create',{workflow_key:'author',positive:'cup'}),error=>error.code==='IMAGE_SERVICE_REQUEST_FAILED'&&!error.message.includes('secret'));
        assert.equal(calls,1);
        const invalid=new ImageService(config,{store:null,fetch:async()=>Response.json({positive:'',negative:''})});
        await assert.rejects(invalid.call('alice','prompt',{requirement:'cup'}),{code:'INVALID_PROMPT_RESPONSE'});
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('native ST transport requires logged-in account and exact origin; user never chooses credentials', async () => {
    let handler,calls=0;
    mountRoutes({post(route,fn){assert.equal(route,'/service');handler=fn;}},{call:async(user,op,params)=>{calls++;assert.equal(user,'alice');return {op,params};}},config);
    async function request(overrides={}) {
        const req={user:{profile:{handle:'alice',enabled:true}},headers:{origin:'https://st.test','x-stimagegen-client':'1'},body:{operation:'workflows',params:{}},...overrides};
        const res={setHeader(){},status(code){this.code=code;return this;},json(data){this.data=data;}};
        await handler(req,res);return res;
    }
    assert.equal((await request({user:null})).code,401);
    assert.equal((await request({headers:{origin:'https://other.test','x-stimagegen-client':'1'}})).code,403);
    assert.equal((await request({body:{operation:'workflows',params:{},url:'https://evil.test'}})).code,400);
    assert.equal((await request()).code,200);
    assert.equal(calls,1);
});

test('configuration uses a private fixed service and exact allowed site origins', () => {
    const directory=fs.mkdtempSync(path.join(os.tmpdir(),'stimagegen-config-'));
    try {
        const filename=path.join(directory,'config.json');
        fs.writeFileSync(filename,JSON.stringify(config));
        assert.equal(loadConfig({STIMAGEGEN_CONFIG:filename}).imageService.url,'https://service.test');
        fs.writeFileSync(filename,JSON.stringify({...config,allowedOrigins:['*']}));
        assert.throws(()=>loadConfig({STIMAGEGEN_CONFIG:filename}));
    } finally {fs.rmSync(directory,{recursive:true,force:true});}
});

test('decision mode uses the existing endpoint flag and refuses missing or non-boolean decisions',async()=>{
    let body;
    const service=new ImageService(config,{store:null,fetch:async(url,options)=>{assert.ok(url.endsWith('/api/prompts/generate'));body=JSON.parse(options.body);return Response.json({should_generate:false,reason:'闲聊'});}});
    assert.deepEqual(await service.call('alice','decide',{messages:[{role:'assistant',content:'hello'}],previousSummary:'old'}),{should_generate:false,reason:'闲聊'});
    assert.equal(body.decision_only,true);assert.equal(body.previous_summary,'old');assert.equal(body.mode,undefined);
    await assert.rejects(service.call('alice','decide',{messages:[{role:'system',content:'instructions'}]}),{code:'INVALID_DECISION_REQUEST'});
    const invalid=new ImageService(config,{store:null,fetch:async()=>Response.json({positive:'a picture'})});
    await assert.rejects(invalid.call('alice','decide',{messages:[{role:'assistant',content:'hello'}]}),{code:'INVALID_DECISION_RESPONSE'});
});

test('workflow model details reuse the existing service and encode the key without exposing graph data',async()=>{
    let url;
    const service=new ImageService(config,{store:null,fetch:async target=>{url=target;return Response.json({main_model:{supported:true,name:'anima.safetensors',models:['anima.safetensors','custom.safetensors']},nodes:'private graph'});}});
    assert.deepEqual(await service.call('alice','workflowDetail',{key:'comfyui:folder/a b.json'}),{main_model:{supported:true,name:'anima.safetensors',models:['anima.safetensors','custom.safetensors']}});
    assert.equal(url,'https://service.test/api/workflows/detail?key=comfyui%3Afolder%2Fa%20b.json');
    await assert.rejects(service.call('alice','workflowDetail',{key:'a',url:'https://evil.test'}),{code:'INVALID_WORKFLOW'});
    const unsupported=new ImageService(config,{store:null,fetch:async()=>Response.json({kind:'template'})});
    assert.deepEqual(await unsupported.call('alice','workflowDetail',{key:'local:a'}),{main_model:{supported:false}});
});
