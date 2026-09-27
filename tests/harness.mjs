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
    const api = async (method, path, body, { token, headers = {} } = {}) => {
      const isForm = body instanceof FormData;
      const res = await fetch(base + path, {
        method,
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
    await fn({ api, db, base, logs: () => logs });
  } finally {
    server.kill();
    await client.close();
    await mongo.stop();
  }
  console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
  if (failures) process.exitCode = 1;
}
