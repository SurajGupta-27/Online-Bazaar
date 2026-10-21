// The store's public address(es). CLIENT_URL is a comma-separated list; the
// first entry is used for links in emails. On Render, RENDER_EXTERNAL_URL
// (set by Render, e.g. https://online-bazaar.onrender.com) is the fallback.
export const clientOrigins = () =>
  (process.env.CLIENT_URL || process.env.RENDER_EXTERNAL_URL || "http://localhost:3000")
    .split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean);
