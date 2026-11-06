export const failure = (status, code, message) => Object.assign(new Error(message), { status, code });
