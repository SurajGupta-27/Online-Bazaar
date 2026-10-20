// Why an AI provider couldn't answer. The shopping assistant then falls back to
// rule-based smart search, so these are never shown to shoppers as errors.
//   off      AI_PROVIDER is none, unknown, or its API key is missing
//   limit    the provider's free limit was hit (HTTP 429), or our own daily budget
//   timeout  no answer within AI_TIMEOUT_MS
//   failed   any other error: network, 5xx, blocked or unreadable response
export class AiError extends Error {
  constructor(reason, message, { retryAfterSeconds } = {}) {
    super(message || reason);
    this.reason = reason;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

// Seconds from a Retry-After header (seconds or an HTTP date), if any.
export const retryAfter = (res) => {
  const value = res.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, (at - Date.now()) / 1000);
};

// Turns a provider's HTTP error into an AiError, without its body (which can
// echo the request) ever reaching a response.
export const httpError = (provider, res) =>
  res.status === 429
    ? new AiError("limit", `${provider}: rate limited`, { retryAfterSeconds: retryAfter(res) })
    : new AiError("failed", `${provider}: HTTP ${res.status}`);

// Parses the model's JSON answer (some models wrap it in a ```json fence).
export const parseJson = (provider, text) => {
  if (typeof text !== "string" || !text.trim()) {
    throw new AiError("failed", `${provider}: empty response`);
  }
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    throw new AiError("failed", `${provider}: response is not JSON`);
  }
};
