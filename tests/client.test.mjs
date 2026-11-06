import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { ImageServiceClient } from '../extension/image-service.js';

test('service client sends existing operation payload and decodes image content without a bridge session', async () => {
    const calls=[];
    const client=new ImageServiceClient({api:async(body,options)=>{
        calls.push(body);assert.ok(options.signal instanceof AbortSignal);
        return {result:body.operation==='image'?{base64:'iVBORw==',mime:'image/png'}:{positive:'cup',negative:'',summary_zh:'杯子'}};
    }});
    assert.equal((await client.call('prompt',{requirement:'cup'})).positive,'cup');
    const image=await client.call('image',{id:'one',index:0});
    assert.deepEqual([...new Uint8Array(image.buffer)],[137,80,78,71]);
    assert.deepEqual(calls,[{operation:'prompt',params:{requirement:'cup'}},{operation:'image',params:{id:'one',index:0}}]);
});

test('front-end starts once and uses native CSRF headers through its same-origin transport', async () => {
    const prior=Object.fromEntries(['SillyTavern','fetch','__stImagePanel'].map(key=>[key,globalThis[key]]));
    let ready;
    const context={getRequestHeaders:()=>({'X-CSRF-Token':'fixture','Content-Type':'application/json'}),eventTypes:{APP_READY:'ready'},eventSource:{on(event,fn){assert.equal(event,'ready');ready=fn;}}};
    globalThis.SillyTavern={getContext:()=>context};
    let requests=0;
    globalThis.fetch=async(url,options)=>{
        requests++;assert.equal(url,'/api/plugins/stimagegen/service');
        assert.equal(options.credentials,'same-origin');
        assert.equal(options.headers['X-CSRF-Token'],'fixture');
        assert.equal(options.headers.Authorization,undefined);
        assert.deepEqual(JSON.parse(options.body),{operation:'workflows',params:{}});
        return Response.json({success:true,result:{items:[]}});
    };
    try {
        let source=await fs.readFile(new URL('../extension/index.js',import.meta.url),'utf8');
        source=source.replace("'./automation.js?v=1.1.0'",JSON.stringify(new URL('../extension/automation.js',import.meta.url).href));
        const moduleUrl=code=>'data:text/javascript,'+encodeURIComponent(code);
        source=source.replace("'./image-panel.js?v=1.2.1'",JSON.stringify(moduleUrl('export function mountImagePanel(options){globalThis.__stImagePanel=options;}')));
        source=source.replace("'../../../../../script.js'",JSON.stringify(moduleUrl('export const isGenerating=()=>false;')));
        await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
        ready();const mounted=globalThis.__stImagePanel;ready();
        assert.equal(globalThis.__stImagePanel,mounted);
        assert.equal(mounted.isBusy(),false);
        assert.deepEqual(await mounted.api({operation:'workflows',params:{}}),{success:true,result:{items:[]}});
        assert.equal(requests,1);
    } finally {
        for (const [key,value] of Object.entries(prior)) {if(value===undefined)delete globalThis[key];else globalThis[key]=value;}
    }
});
