// A JWT-shaped token whose payload expires `secondsFromNow` from now. The
// signature is fake; only the client-side expiry check reads it.
const base64url = (obj) =>
  btoa(JSON.stringify(obj)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");

export const fakeToken = (secondsFromNow = 3600) =>
  [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ _id: "u1", exp: Math.floor(Date.now() / 1000) + secondsFromNow }),
    "signature",
  ].join(".");
