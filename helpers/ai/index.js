// The AI provider behind the shopping assistant, chosen by AI_PROVIDER in .env:
// gemini, groq or none (the default; anything unknown counts as none).
//
// A provider is an object { name, label, configured(), generateJson(options) }:
//   configured()   true when its API key is set
//   generateJson({ system, prompt, schema, signal })
//                  resolves to the model's parsed JSON answer, or throws an
//                  AiError (./aiError.js); it must honour `signal` (timeouts).
// To add one, write helpers/ai/<name>.js and list it in PROVIDERS.
//
// askAi() adds what every provider needs: a timeout (AI_TIMEOUT_MS, default
// 10s), a pause after the provider says its free limit is reached (its
// Retry-After, or AI_COOLDOWN_SECONDS, default 60), and our own daily budget
// of AI requests (AI_DAILY_LIMIT, default 900, kept under the free tier's
// daily quota), so the assistant switches to smart search instead of piling
// up failed requests. API keys never leave the server.
import { AiError } from "./aiError.js";
import gemini from "./gemini.js";
import groq from "./groq.js";

export { AiError };

const PROVIDERS = { gemini, groq };

const DAY_MS = 24 * 60 * 60 * 1000;
const numberSetting = (name, fallback) => {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value >= 0 ? value : fallback;
};

// The configured provider, or null when AI is switched off.
export const aiProvider = () => {
  const name = String(process.env.AI_PROVIDER || "none").trim().toLowerCase();
  const provider = Object.hasOwn(PROVIDERS, name) ? PROVIDERS[name] : null;
  return provider?.configured() ? provider : null;
};

// Per process: when the provider may be asked again, and requests made in the
// current 24-hour window.
let pausedUntil = 0;
let usage = { since: 0, count: 0 };

export const askAi = async ({ system, prompt, schema }) => {
  const provider = aiProvider();
  if (!provider) throw new AiError("off", "AI is not configured");
  const now = Date.now();
  if (now < pausedUntil) throw new AiError("limit", `${provider.name}: paused after hitting its limit`);
  if (now - usage.since >= DAY_MS) usage = { since: now, count: 0 };
  if (usage.count >= numberSetting("AI_DAILY_LIMIT", 900)) {
    throw new AiError("limit", "daily AI budget used up");
  }
  usage.count++;

  const timeoutMs = numberSetting("AI_TIMEOUT_MS", 10000);
  try {
    const data = await provider.generateJson({
      system,
      prompt,
      schema,
      signal: AbortSignal.timeout(timeoutMs),
    });
    return { data, provider };
  } catch (error) {
    if (error instanceof AiError) {
      if (error.reason === "limit") {
        const seconds = error.retryAfterSeconds ?? numberSetting("AI_COOLDOWN_SECONDS", 60);
        pausedUntil = Date.now() + seconds * 1000;
      }
      throw error;
    }
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      throw new AiError("timeout", `${provider.name}: no answer within ${timeoutMs}ms`);
    }
    throw new AiError("failed", `${provider.name}: ${error?.message || "request failed"}`);
  }
};
