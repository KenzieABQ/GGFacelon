// URL helpers (static export: data lives in the browser, so scan pages use query parameters)
export const scanUrl = (id, tab = 'overview', sub) => `/scan/?id=${encodeURIComponent(id)}&tab=${tab}${sub ? `&sub=${sub}` : ''}`;
// Files under public/ (prefix the base path when the app is served from a sub-path)
export const asset = (p) => (process.env.NEXT_PUBLIC_BASE_PATH || '') + p;
