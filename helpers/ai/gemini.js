// Google Gemini through its REST API (generateContent), with fetch rather than
// an SDK. GEMINI_MODEL picks the model (default: a free-tier Flash-Lite model);
// GEMINI_API_URL lets tests point it at a mock.
import { AiError, httpError, parseJson } from "./aiError.js";

const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const DEFAULT_URL = "https://generativelanguage.googleapis.com/v1beta";

export default {
  name: "gemini",
  label: "Gemini",
  configured: () => Boolean(process.env.GEMINI_API_KEY),

  async generateJson({ system, prompt, schema, signal }) {
    const model = process.env.GEMINI_MODEL || DEFAULT_MODEL;
    const base = (process.env.GEMINI_API_URL || DEFAULT_URL).replace(/\/$/, "");
    const generationConfig = {
      responseMimeType: "application/json",
      responseJsonSchema: schema,
      temperature: 0.2,
      maxOutputTokens: 1024,
    };
    if (process.env.GEMINI_THINKING_LEVEL) {
      generationConfig.thinkingConfig = { thinkingLevel: process.env.GEMINI_THINKING_LEVEL };
    }
    const res = await fetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        // In a header, not the URL, so it never shows up in logs.
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        generationConfig,
      }),
    });
    if (!res.ok) throw httpError("gemini", res);
    const body = await res.json().catch(() => null);
    const candidate = body?.candidates?.[0];
    if (!candidate) {
      throw new AiError("failed", `gemini: no answer (${body?.promptFeedback?.blockReason || "empty"})`);
    }
    if (candidate.finishReason && candidate.finishReason !== "STOP") {
      throw new AiError("failed", `gemini: stopped (${candidate.finishReason})`);
    }
    // Skip thought parts; the answer is the rest of the text.
    const text = (candidate.content?.parts || [])
      .filter((part) => !part.thought && typeof part.text === "string")
      .map((part) => part.text)
      .join("");
    return parseJson("gemini", text);
  },
};
