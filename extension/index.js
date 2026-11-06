import { AutoImageController, chatKey } from './automation.js?v=1.1.0';
import { mountImagePanel } from './image-panel.js?v=1.2.1';
import { isGenerating } from '../../../../../script.js';

const getContext = () => SillyTavern.getContext();
let mounted = false;
async function api(body, options = {}) {
    const response = await fetch('/api/plugins/stimagegen/service', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { ...getContext().getRequestHeaders(), 'X-STImageGen-Client': '1' },
        body: JSON.stringify(body), signal: options.signal ?? AbortSignal.timeout(100000),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success) throw Object.assign(new Error(data?.error?.message || `HTTP ${response.status}`), { code: data?.error?.code });
    return data;
}
getContext().eventSource.on(getContext().eventTypes.APP_READY, () => {
    if (mounted) return;
    mounted = true;
    const panel=mountImagePanel({ getContext, api, isBusy: () => Boolean(isGenerating()) });
    if(!panel?.automation)return;
    const context=getContext();
    const controller=new AutoImageController({
        getContext,store:context.accountStorage??window.localStorage,
        isBusy:()=>Boolean(isGenerating())||panel.automation.isBusy(),
        judge:async params=>(await api({operation:'decide',params},{signal:AbortSignal.timeout(150000)})).result,
        generate:panel.automation.generate,status:panel.automation.status,
        exclusive:work=>globalThis.navigator?.locks?globalThis.navigator.locks.request('stimagegen:auto:'+chatKey(getContext()),{ifAvailable:true},lock=>lock?work():undefined):work(),
    });
    panel.onAutoSettingsChange=()=>controller.settingsChanged();
    panel.onIdle=()=>{if(controller.dirty)controller.notify();};
    for(const type of [context.eventTypes.MESSAGE_RECEIVED,context.eventTypes.CHARACTER_MESSAGE_RENDERED,context.eventTypes.GENERATION_ENDED].filter(Boolean)) context.eventSource.on(type,()=>{panel.refreshGenerationCount?.();controller.notify();});
    if(context.eventTypes.CHAT_CHANGED)context.eventSource.on(context.eventTypes.CHAT_CHANGED,()=>{panel.refreshGenerationCount?.();controller.chatChanged();});
});
