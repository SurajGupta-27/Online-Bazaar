// A stand-in for the Gemini and Groq APIs, so tests never call a real AI. It
// records every request and answers with whatever the test sets in
// `mock.respond`: a function (request) -> { status, json, delayMs, headers }.
// By default it picks the first two candidates from the prompt, like a model
// following the rules. Point the server at it with aiEnv(mock, "gemini").
import http from "node:http";

export const GEMINI_KEY = "test-gemini-key";
export const GROQ_KEY = "test-groq-key";

// The candidates and shopper request the server put in the prompt.
export const promptParts = (prompt) => ({
  candidates: JSON.parse(prompt.match(/<candidates>\n(.*)\n<\/candidates>/s)[1]),
  request: JSON.parse(prompt.match(/<shopper_request>\n(.*)\n<\/shopper_request>/s)[1]),
  history: JSON.parse(prompt.match(/<conversation>\n(.*)\n<\/conversation>/s)[1]),
});

// The answer in each API's format.
export const geminiJson = (answer) => ({
  candidates: [{ content: { role: "model", parts: [{ text: JSON.stringify(answer) }] }, finishReason: "STOP" }],
});
export const groqJson = (answer) => ({
  choices: [{ message: { role: "assistant", content: JSON.stringify(answer) }, finish_reason: "stop" }],
});

export async function startMockAi({ port = 9412 } = {}) {
  const requests = [];
  const mock = {
    requests,
    respond: null,
    url: `http://127.0.0.1:${port}`,
  };
  const defaultAnswer = ({ candidates }) => ({
    reply: "Here are my picks.",
    picks: candidates.slice(0, 2).map((c) => ({ id: c.id, reason: `Good choice: ${c.name}.` })),
  });

  const server = http.createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const body = JSON.parse(raw || "{}");
    const provider = req.url.startsWith("/gemini/") ? "gemini" : "groq";
    const prompt =
      provider === "gemini"
        ? body.contents?.[0]?.parts?.[0]?.text
        : body.messages?.find((m) => m.role === "user")?.content;
    const request = {
      provider,
      url: req.url,
      headers: req.headers,
      body,
      raw,
      prompt,
      parts: prompt ? promptParts(prompt) : null,
    };
    requests.push(request);
    const reply = mock.respond?.(request) || {
      json: (provider === "gemini" ? geminiJson : groqJson)(defaultAnswer(request.parts)),
    };
    if (reply.delayMs) await new Promise((r) => setTimeout(r, reply.delayMs));
    res.writeHead(reply.status || 200, { "Content-Type": "application/json", ...reply.headers });
    res.end(JSON.stringify(reply.json ?? {}));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  mock.close = () => new Promise((resolve) => {
    server.closeAllConnections();
    server.close(resolve);
  });
  return mock;
}

export const aiEnv = (mock, provider = "gemini") => ({
  AI_PROVIDER: provider,
  GEMINI_API_KEY: GEMINI_KEY,
  GEMINI_API_URL: `${mock.url}/gemini/v1beta`,
  GROQ_API_KEY: GROQ_KEY,
  GROQ_API_URL: `${mock.url}/groq/openai/v1`,
});
