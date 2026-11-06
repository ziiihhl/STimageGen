import { loadConfig } from './config.mjs';
import { ImageService } from './service.mjs';
import { failure } from './errors.mjs';

export const info = { id: 'stimagegen', name: 'ST ImageGen', description: 'Existing image-service client for SillyTavern.' };
export function mountRoutes(router, service, config) {
    router.post('/service', async (req, res) => {
        res.setHeader('Cache-Control', 'no-store');
        try {
            // Native ST authentication and CSRF middleware run before this plugin router.
            const user = req.user?.profile?.handle;
            if (!user || !req.user.profile.enabled) throw failure(401, 'UNAUTHORIZED', '请登录酒馆。');
            if (!config.allowedOrigins.includes(req.headers.origin) || req.headers['x-stimagegen-client'] !== '1'
                || (req.headers['sec-fetch-site'] && req.headers['sec-fetch-site'] !== 'same-origin')) throw failure(403, 'ORIGIN_REJECTED', '请求来源不允许。');
            if (Buffer.byteLength(JSON.stringify(req.body ?? {})) > 250000) throw failure(413, 'REQUEST_TOO_LARGE', '请求过大。');
            const body = req.body;
            if (!body || Object.keys(body).some(key => !['operation', 'params'].includes(key)) || typeof body.operation !== 'string'
                || !body.params || typeof body.params !== 'object' || Array.isArray(body.params)) throw failure(400, 'INVALID_REQUEST', '请求格式不正确。');
            const result = await service.call(user, body.operation, body.params);
            res.status(200).json({ success: true, result });
        } catch (error) {
            res.status(error.status ?? 500).json({ success: false, error: { code: error.code ?? 'INTERNAL_ERROR', message: error.code ? error.message : '服务请求失败。' } });
        }
    });
}
export async function init(router) {
    const config = loadConfig();
    mountRoutes(router, new ImageService(config), config);
}
export async function exit() {}
