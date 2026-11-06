import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AutoImageController, saveSettings, readSettings, recentContext } from '../extension/automation.js';
function setup(settings={mode:'interval',every:2,contextCount:3},options={}) {
    const map=new Map(),store={getItem:k=>map.get(k)||'',setItem:(k,v)=>map.set(k,v)};
    saveSettings(store,settings);
    const ctx={chatId:'one',characterId:0,groupId:null,chat:[{is_user:true,mes:'old user text'}]},calls=[],status=[];
    let busy=false;
    const ctl=new AutoImageController({getContext:()=>ctx,store,isBusy:()=>busy,judge:async p=>{calls.push(['judge',p]);return {should_generate:true,reason:'新场景'};},generate:async p=>{calls.push(['generate',p]);return {submitted:true,summary:'桌边场景'};},status:s=>status.push(s),schedule:()=>1,cancel:()=>{},...options});
    const reply=async text=>{ctx.chat.push({is_user:false,mes:text});ctl.notify();await ctl.flush();};
    return {ctx,store,ctl,calls,status,reply,busy:v=>busy=v};
}
test('interval counts only new character replies, ignores inserted images and duplicate events',async()=>{
    const f=setup();await f.reply('first');assert.equal(f.calls.length,0);
    f.ctx.chat.push({is_user:true,mes:'continue'});await f.reply('second');
    assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'generate');
    const input=f.calls[0][1];assert.equal(input.valid(),true);
    const messages=JSON.parse(input.requirement.split('\n').at(-1));assert.deepEqual(messages.map(m=>m.content),['first','continue','second']);
    assert.equal(input.requirement.includes('old user text'),false);
    f.ctl.notify();await f.ctl.flush();
    f.ctx.chat.push({is_system:true,mes:'generated image summary',extra:{media:[{}]}});f.ctl.notify();await f.ctl.flush();
    f.ctx.chat[3].mes='swiped response';f.ctl.notify();await f.ctl.flush();
    assert.equal(f.calls.length,1);
});
test('LLM mode respects an explicit no-image decision and evaluates only the requested recent messages',async()=>{
    let should=false,judged=0,generated=0;
    const f=setup({mode:'llm',every:5,contextCount:2},{judge:async p=>{judged++;assert.equal(p.messages.length,2);return {should_generate:should,reason:'普通闲聊'};},generate:async()=>{generated++;return {submitted:true};}});
    await f.reply('hello');assert.equal(generated,0);should=true;await f.reply('new landscape');
    assert.equal(judged,2);assert.equal(generated,1);
    f.ctl.notify();await f.ctl.flush();assert.equal(judged,2);
});
test('turning on automation establishes a fresh baseline and does not process historical replies',async()=>{
    const f=setup({mode:'off',every:1,contextCount:2});await f.reply('old');assert.equal(f.calls.length,0);
    saveSettings(f.store,{mode:'interval',every:1,contextCount:2});f.ctl.settingsChanged();f.ctl.notify();await f.ctl.flush();assert.equal(f.calls.length,0);
    await f.reply('new');assert.equal(f.calls.length,1);
});
test('chat changes during a pending LLM decision discard its old generation',async()=>{
    let resolve,generated=0;
    const f=setup({mode:'llm',every:1,contextCount:2},{judge:()=>new Promise(r=>resolve=r),generate:async()=>{generated++;}});
    f.ctx.chat.push({mes:'a new scene'});f.ctl.notify();const pending=f.ctl.flush();
    f.ctx.chatId='different';f.ctx.chat=[{mes:'another history'}];f.ctl.chatChanged();resolve({should_generate:true,reason:'yes'});await pending;
    assert.equal(generated,0);
});
test('pending work is not duplicated and a failed decision never submits a drawing',async()=>{
    let resolve,judged=0,generated=0;
    const f=setup({mode:'llm',every:1,contextCount:2},{judge:()=>{judged++;return new Promise(r=>resolve=r);},generate:async()=>{generated++;return {submitted:true};}});
    f.ctx.chat.push({mes:'scene'});f.ctl.notify();const pending=f.ctl.flush();f.ctl.notify();await f.ctl.flush();
    assert.equal(judged,1);resolve({should_generate:true,reason:'yes'});await pending;assert.equal(generated,1);
    const bad=setup({mode:'llm',every:1,contextCount:2},{judge:async()=>{throw Error('timeout');},generate:async()=>{throw Error('must not draw');}});
    await bad.reply('scene');bad.ctl.notify();await bad.ctl.flush();assert.ok(bad.status.at(-1).includes('timeout'));
});
test('busy chats wait, oversized context fails visibly, and settings enforce bounds',async()=>{
    const f=setup({mode:'interval',every:1,contextCount:2});f.busy(true);await f.reply('scene');assert.equal(f.calls.length,0);f.busy(false);await f.ctl.flush();assert.equal(f.calls.length,1);
    assert.throws(()=>recentContext({chat:[{mes:'x'.repeat(12001)}]},2),/12000/);
    saveSettings(f.store,{mode:'invalid',every:0,contextCount:999});assert.deepEqual(readSettings(f.store),{mode:'off',every:5,contextCount:4});
});
