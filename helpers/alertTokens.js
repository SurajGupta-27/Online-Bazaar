// Alert kinds, the user preference each one follows, and the signed tokens in
// unsubscribe links (which work without logging in).
import crypto from "node:crypto";

export const ALERT_KINDS = {
  price_drop: { pref: "priceDrop", label: "price-drop alerts" },
  back_in_stock: { pref: "backInStock", label: "back-in-stock alerts" },
};

export const isAlertKind = (kind) => typeof kind === "string" && Object.hasOwn(ALERT_KINDS, kind);

// Whether a user gets this kind of alert. A missing value (accounts from
// before alerts existed) means on.
export const alertsOn = (user, kind) => user?.alertPrefs?.[ALERT_KINDS[kind].pref] !== false;

// { priceDrop, backInStock } as sent to the browser.
export const alertPreferences = (user) =>
  Object.fromEntries(Object.entries(ALERT_KINDS).map(([kind, { pref }]) => [pref, alertsOn(user, kind)]));

// An HMAC of the user id and kind under a key derived from JWT_SECRET (so no
// extra setting is needed, and the key is never the JWT key itself). Tokens
// don't expire: an unsubscribe link should keep working.
const key = () => {
  if (!process.env.JWT_SECRET) throw new Error("JWT_SECRET is not set");
  return crypto.createHash("sha256").update(`online-bazaar-unsubscribe|${process.env.JWT_SECRET}`).digest();
};

export const unsubscribeToken = (userId, kind) =>
  crypto.createHmac("sha256", key()).update(`unsubscribe|${userId}|${kind}`).digest("base64url");

export const validUnsubscribeToken = (userId, kind, token) => {
  if (typeof userId !== "string" || !isAlertKind(kind) || typeof token !== "string") return false;
  const expected = Buffer.from(unsubscribeToken(userId, kind));
  const given = Buffer.from(token);
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
};
