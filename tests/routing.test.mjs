import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chooseModelRoute} from '../extension/model-routing.js';
import {ImageService} from '../server/service.mjs';

test('anime routing prefers the Turbo graph and installed Turbo model', async()=>{
 const calls=[];
 const client={async call(op,{key}){calls.push(key);return {main_model:{supported:true,name:'anima_base.safetensors',models:['anima_base.safetensors','Downloads/anima_turboV11.safetensors','anima_turboV11.safetensors']}};}};
 const result=await chooseModelRoute(client,[{key:'comfyui:05_Anima_NonTurbo.json'},{key:'comfyui:02_Anima_Turbo.json'}],'anima');
 assert.equal(result.workflow_key,'comfyui:02_Anima_Turbo.json');assert.equal(result.main_model,'anima_turboV11.safetensors');assert.equal(calls.length,1);
});
test('realism routing excludes Krea Anime and never falls back to an anime file',async()=>{
 const client={async call(){return {main_model:{supported:true,name:'lustifyKrea2.safetensors',models:['krea2Anime.safetensors','lustifyKrea2.safetensors']}};}};
 const result=await chooseModelRoute(client,[{key:'comfyui:03_Krea2_Anime.json'},{key:'comfyui:04_Lustify_Krea2.json'}],'krea');
 assert.equal(result.workflow_key,'comfyui:04_Lustify_Krea2.json');assert.equal(result.main_model,'lustifyKrea2.safetensors');
 await assert.rejects(chooseModelRoute(client,[{key:'comfyui:03_Krea2_Anime.json'}],'krea'),/未找到/);
});
test('routing rejects malformed LLM decisions and forwards actual model context for prompt generation',async()=>{
 const config={imageService:{url:'https://service.test',token:'secret'}};let body;
 const service=new ImageService(config,{store:null,fetch:async(url,options)=>{body=JSON.parse(options.body);return Response.json(body.route_only?{family:'krea',reason:'摄影'}:{positive:'A photograph.',negative:'',summary_zh:'照片'});}});
 assert.deepEqual(await service.call('a','modelRoute',{requirement:'摄影'}),{family:'krea',reason:'摄影'});assert.equal(body.route_only,true);
 await service.call('a','prompt',{requirement:'摄影',workflow_key:'comfyui:Krea2.json',main_model:'krea2.safetensors'});
 assert.deepEqual(body.values,{main_model:'krea2.safetensors'});assert.equal(body.workflow_key,'comfyui:Krea2.json');
 const invalid=new ImageService(config,{store:null,fetch:async()=>Response.json({family:'unknown',reason:'x'})});
 await assert.rejects(invalid.call('a','modelRoute',{requirement:'x'}),{code:'INVALID_MODEL_ROUTE'});
});
