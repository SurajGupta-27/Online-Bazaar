// Where the API lives. Empty (the default) means the page's own origin: the
// CRA dev proxy locally, or Express serving the build. When the frontend is
// hosted apart from the API (Vercel + Render), REACT_APP_API_URL is the API's
// address, e.g. https://online-bazaar-api.onrender.com. index.js gives it to
// axios as baseURL; URLs used outside axios (<img src>) go through apiUrl().
export const API_BASE = (process.env.REACT_APP_API_URL || "").trim().replace(/\/+$/, "");

export const apiUrl = (path) => `${API_BASE}${path}`;
