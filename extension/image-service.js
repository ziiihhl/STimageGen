/** Calls only the existing service through the authenticated ST transport. */
export class ImageServiceClient {
    constructor({ api }) { this.api = api; }
    async call(operation, params = {}) {
        const data = await this.api({ operation, params }, { signal: AbortSignal.timeout(['prompt','modelRoute','decide'].includes(operation) ? 150000 : 100000) });
        const result = data.result;
        if (operation !== 'image') return result;
        const binary = atob(result.base64), bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return { buffer: bytes.buffer, mime: result.mime };
    }
}
