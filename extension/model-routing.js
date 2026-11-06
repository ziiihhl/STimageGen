/** Model selection uses only the service's current workflow/model inventory. */
export async function chooseModelRoute(client, items, family) {
    if (!['anima','krea'].includes(family)) throw Error('模型分类无效。');
    const label = item => `${item.key} ${item.title || ''}`;
    const isTurbo = name => /turbo/i.test(name) && !/non.?turbo/i.test(name);
    const matches = name => family === 'anima' ? /anima|miaomiao/i.test(name) : /krea|lustify/i.test(name) && !/anime|anima/i.test(name);
    const candidates = items.filter(item => item.valid !== false && matches(label(item)))
        .sort((a,b) => family === 'anima' ? Number(isTurbo(label(b)))-Number(isTurbo(label(a))) : 0);
    for (const item of candidates) {
        const detail = await client.call('workflowDetail', {key:item.key});
        const info = detail.main_model;
        if (!info?.supported) continue;
        let models = info.models.filter(matches);
        if (family === 'anima' && models.some(isTurbo)) models = models.filter(isTurbo);
        if (!models.length) continue;
        const selected = models.includes(info.name) ? info.name : models.find(name=>!/[\\/]/.test(name)) || models[0];
        return {workflow_key:item.key,main_model:selected,family};
    }
    throw Error(family === 'anima' ? '未找到可用的 Anima 工作流和模型，请刷新或手动选择。' : '未找到可用的 Krea 写实工作流和模型，请刷新或手动选择。');
}
