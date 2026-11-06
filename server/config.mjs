import fs from 'node:fs';
import path from 'node:path';

export function loadConfig(env = process.env) {
    const file = env.STIMAGEGEN_CONFIG || path.resolve('config/stimagegen.json');
    const config = JSON.parse(fs.readFileSync(file, 'utf8'));
    const service = config.imageService;
    const url = new URL(service?.url);
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== service.url || url.username || url.password
        || typeof service.token !== 'string' || !/^[\x21-\x7e]{48,512}$/.test(service.token)) throw new Error('Invalid imageService URL or service credential');
    if (!Array.isArray(config.allowedOrigins) || !config.allowedOrigins.length || config.allowedOrigins.some(origin => {
        try { const u = new URL(origin); return u.origin !== origin || !['https:', 'http:'].includes(u.protocol); } catch { return true; }
    })) throw new Error('Set exact allowedOrigins for the SillyTavern site');
    if (service.defaultWorkflow !== undefined && typeof service.defaultWorkflow !== 'string') throw new Error('Invalid defaultWorkflow');
    const promptMode = config.promptMode ?? 'natural';
    if (!['natural', 'tags'].includes(promptMode)) throw new Error('Invalid promptMode');
    return { imageService: { url: service.url, token: service.token, defaultWorkflow: service.defaultWorkflow ?? '' }, allowedOrigins: config.allowedOrigins, promptMode };
}
