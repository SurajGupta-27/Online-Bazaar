// Starts an in-memory MongoDB and the real server.js against it, runs a test
// function, then tears everything down. The real database is never touched:
// MONGO_URL and every other setting server.js reads are overridden below
// (dotenv does not overwrite variables that are already set).
import { MongoMemoryServer } from "mongodb-memory-server";
import { MongoClient, ObjectId } from "mongodb";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

export const PROJECT = fileURLToPath(new URL("..", import.meta.url));
export { ObjectId };

let failures = 0;
export const check = (label, cond, extra = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  -- " + extra : ""}`);
};

// Runs a scripts/*.mjs file against the test database and returns its output.
// Like the server, it gets blank Cloudinary settings unless env provides them.
export function runScript(script, args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: PROJECT,
      env: { ...process.env, CLOUDINARY_CLOUD_NAME: "", CLOUDINARY_API_KEY: "", CLOUDINARY_API_SECRET: "", CLOUDINARY_API_URL: "http://127.0.0.1:9/v1_1", ...env },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    child.on("close", (code) => resolve({ code, output }));
  });
}

export async function withServer(fn, { port = 8099, env = {} } = {}) {
  const mongo = await MongoMemoryServer.create();
  const uri = mongo.getUri() + "shop";
  const client = await MongoClient.connect(uri);
  const db = client.db();
  const server = spawn(process.execPath, ["server.js"], {
    cwd: PROJECT,
    env: {
      ...process.env,
      MONGO_URL: uri,
      JWT_SECRET: "test-secret",
      PORT: String(port),
      CLIENT_URL: "http://localhost:3000",
      // Never reach the real Razorpay API: no keys, and a dead API address,
      // unless a test passes its own (mock) values.
      RAZORPAY_KEY_ID: "",
      RAZORPAY_KEY_SECRET: "",
      RAZORPAY_API_URL: "http://127.0.0.1:9/v1",
      // Same for Cloudinary: tests that upload images start the mock in
      // tests/mockCloudinary.mjs and pass cloudinaryEnv(mock).
      CLOUDINARY_CLOUD_NAME: "",
      CLOUDINARY_API_KEY: "",
      CLOUDINARY_API_SECRET: "",
      CLOUDINARY_API_URL: "http://127.0.0.1:9/v1_1",
      // And Google: tests that sign in with Google start tests/mockGoogle.mjs
      // and pass googleEnv(mock).
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CERTS_URL: "http://127.0.0.1:9/oauth2/v1/certs",
      // And email: no Gmail credentials. Tests that check emails pass
      // emailEnv(outbox) from tests/outbox.mjs, which writes them to a file.
      EMAIL_USER: "",
      EMAIL_APP_PASSWORD: "",
      EMAIL_OUTBOX: "",
      EMAIL_PROVIDER: "",
      EMAIL_FROM: "",
      BREVO_API_KEY: "",
      BREVO_API_URL: "http://127.0.0.1:9/v3",
      // Production settings: the default proxy trust and no React build
      // (tests/deployment.test.mjs passes its own).
      TRUST_PROXY: "",
      SERVE_CLIENT: "false",
      CLIENT_BUILD_DIR: "",
      NODE_ENV: "test",
      // And the AI: the shopping assistant uses smart search only. Tests of
      // the AI start tests/mockAi.mjs and pass aiEnv(mock, provider).
      AI_PROVIDER: "",
      GEMINI_API_KEY: "",
      GEMINI_API_URL: "http://127.0.0.1:9/v1beta",
      GROQ_API_KEY: "",
      GROQ_API_URL: "http://127.0.0.1:9/openai/v1",
      ...env,
    },
  });
  let logs = "";
  server.stdout.on("data", (d) => (logs += d));
  server.stderr.on("data", (d) => (logs += d));
  const base = `http://127.0.0.1:${port}`;
  try {
    for (let i = 0; ; i++) {
      try {
        const r = await fetch(`${base}/api/v1/category/get-category`);
        if (r.status === 200) break;
      } catch {}
      if (i > 100) throw new Error("server did not start\n" + logs);
      await new Promise((r) => setTimeout(r, 100));
    }
    const api = async (method, path, body, { token, headers = {}, redirect = "follow" } = {}) => {
      const isForm = body instanceof FormData;
      const res = await fetch(base + path, {
        method,
        redirect,
        headers: {
          ...(body && !isForm ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: token } : {}),
          ...headers,
        },
        body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
      });
      const text = await res.text();
      let json;
      try { json = JSON.parse(text); } catch {}
      return { status: res.status, json, text, headers: res.headers, raw: res };
    };
    await fn({ api, db, base, uri, logs: () => logs });
  } finally {
    server.kill();
    await client.close();
    await mongo.stop();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  if (failures) process.exitCode = 1;
}
