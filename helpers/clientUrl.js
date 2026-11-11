// The store's public address(es). CLIENT_URL is a comma-separated list; the
// first entry is used for links in emails. On Render, RENDER_EXTERNAL_URL
// (set by Render, e.g. https://online-bazaar.onrender.com) is the fallback.
export const clientOrigins = () =>
  (process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);

// This API's own public address, for links that must reach the API rather
// than the store (mail apps' one-click unsubscribe). API_URL when the store
// and API are hosted apart and Render's RENDER_EXTERNAL_URL isn't right; on
// Render it is set automatically. With one origin for both, the store's URL.
export const apiOrigin = () =>
  (process.env.API_URL || process.env.RENDER_EXTERNAL_URL || clientOrigins()[0]).trim().replace(/\/$/, "");
