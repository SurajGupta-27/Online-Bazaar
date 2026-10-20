// Groq through its OpenAI-compatible chat completions API, with fetch rather
// than an SDK. GROQ_MODEL picks the model; GROQ_API_URL lets tests use a mock.
// Groq's JSON mode doesn't enforce a schema, so the schema goes in the prompt
// (the assistant validates every answer anyway).
import { AiError, httpError, parseJson } from "./aiError.js";

const DEFAULT_MODEL = "llama-3.3-70b-versatile";
const DEFAULT_URL = "https://api.groq.com/openai/v1";

export default {
  name: "groq",
  label: "Groq",
  configured: () => Boolean(process.env.GROQ_API_KEY),

  async generateJson({ system, prompt, schema, signal }) {
    const base = (process.env.GROQ_API_URL || DEFAULT_URL).replace(/\/$/, "");
    const res = await fetch(`${base}/chat/completions`, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || DEFAULT_MODEL,
        temperature: 0.2,
        max_tokens: 1024,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${system}\n\nAnswer with JSON matching this JSON Schema:\n${JSON.stringify(schema)}` },
          { role: "user", content: prompt },
        ],
      }),
    });
    if (!res.ok) throw httpError("groq", res);
    const body = await res.json().catch(() => null);
    const choice = body?.choices?.[0];
    if (!choice) throw new AiError("failed", "groq: no answer");
    if (choice.finish_reason && choice.finish_reason !== "stop") {
      throw new AiError("failed", `groq: stopped (${choice.finish_reason})`);
    }
    return parseJson("groq", choice.message?.content);
  },
};
