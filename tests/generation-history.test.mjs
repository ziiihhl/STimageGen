import {test} from 'node:test';
import assert from 'node:assert/strict';
import {generationGap,recordGeneration,generationMessageCount} from '../extension/generation-history.js';
test('generation counts persist per chat and ignore image/system messages and edits',()=>{
 const map=new Map(),store={getItem:key=>map.get(key),setItem:(key,value)=>map.set(key,value)};
 const ctx={chatId:'a',characterId:0,chat:[{is_user:true,mes:'one'},{mes:'two'}]};
 assert.equal(generationGap(store,ctx).newCount,2);
 recordGeneration(store,ctx,generationMessageCount(ctx));
 assert.equal(generationGap(store,ctx).newCount,0);
 ctx.chat.push({is_system:true,mes:'generated image'},{mes:'  '},{extra:{media:[]}});
 ctx.chat[1].mes='edited';assert.equal(generationGap(store,ctx).newCount,0);
 ctx.chat.push({is_user:true,mes:'new'});assert.equal(generationGap(store,ctx).newCount,1);
 assert.equal(generationGap(store,{...ctx,chatId:'b'}).newCount,3);
 assert.equal(generationGap(store,ctx).newCount,1);
 const snapshot=generationMessageCount(ctx);ctx.chat.push({mes:'arrived during generation'});
 recordGeneration(store,ctx,snapshot);assert.equal(generationGap(store,ctx).newCount,1);
 ctx.chat=[];assert.equal(generationGap(store,ctx).newCount,0);
 ctx.chat.push({mes:'after deletion'});assert.equal(generationGap(store,ctx).newCount,1);
});

test('existing inserted images seed the count after upgrading or importing a chat',()=>{
 const store={getItem:()=>null,setItem(){}};
 const ctx={chatId:'imported',chat:[{mes:'old'},{is_system:true,extra:{media:[{url:'/user/images/stimagegen_job123_0.png'}]}},{is_user:true,mes:'new'}]};
 assert.equal(generationGap(store,ctx).newCount,1);
 ctx.chat[1].extra={stimagegen:{message_count:0},media:[]};
 assert.equal(generationGap(store,ctx).newCount,2);
});
