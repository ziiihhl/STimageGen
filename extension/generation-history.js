import {conversation,chatKey} from './automation.js?v=1.1.0';
const KEY='stimagegen_generation_history';
export const generationMessageCount=ctx=>conversation(ctx??{}).length;
function read(store){try{const data=JSON.parse(store.getItem(KEY)||'{}');return data&&typeof data==='object'&&!Array.isArray(data)?data:{};}catch{return {};}}
function save(store,data){store.setItem(KEY,JSON.stringify(Object.fromEntries(Object.entries(data).slice(-50))));}
function fromChat(ctx){
 const messages=ctx?.chat??[];
 for(let i=messages.length-1;i>=0;i--){
  const message=messages[i],saved=message?.extra?.stimagegen?.message_count;
  const ours=message?.is_system&&(Number.isInteger(saved)||(message.extra?.media??[]).some(media=>typeof media.url==='string'&&/stimagegen_[a-zA-Z0-9_-]+_\d+\.(png|jpe?g|webp|gif)(?:$|[?#])/i.test(media.url)));
  if(ours)return {count:Number.isInteger(saved)&&saved>=0?saved:generationMessageCount({chat:messages.slice(0,i)})};
 }
 return null;
}
export function generationGap(store,ctx){
 const key=chatKey(ctx??{}),total=generationMessageCount(ctx),history=read(store),entry=history[key]??fromChat(ctx);
 const known=key&&Number.isInteger(entry?.count)&&entry.count>=0;
 if(known&&total<entry.count){history[key]={...entry,count:total};try{save(store,history);}catch{};}
 return {total,newCount:key?Math.max(0,total-(known?Math.min(entry.count,total):0)):0,hasHistory:Boolean(known)};
}
export function recordGeneration(store,source,count){
 const key=chatKey(source??{});if(!key)return;
 if(!Number.isInteger(count)||count<0)throw Error('Invalid generation message count');
 const history=read(store);delete history[key];history[key]={count,generatedAt:Date.now()};save(store,history);
}
