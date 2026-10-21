// Production settings: emails through Brevo's API (a local mock), TRUST_PROXY,
// the health check, and serving the React build from the API server.
import http from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { withServer, check, ObjectId } from "./harness.mjs";

// --- A stand-in for https://api.brevo.com/v3/smtp/email --------------------
const brevo = { requests: [], status: 201 };
const brevoServer = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    brevo.requests.push({ method: req.method, url: req.url, apiKey: req.headers["api-key"], body: JSON.parse(body || "{}") });
    res.writeHead(brevo.status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(brevo.status === 201 ? { messageId: "<mock@brevo>" } : { code: "unauthorized", message: "Key not found" }));
  });
});
await new Promise((r) => brevoServer.listen(0, "127.0.0.1", r));
const brevoEnv = {
  BREVO_API_KEY: "xkeysib-test",
  EMAIL_FROM: "shop@test.example",
  BREVO_API_URL: `http://127.0.0.1:${brevoServer.address().port}/v3`,
};
const waitFor = async (count) => {
  for (let i = 0; brevo.requests.length < count && i < 100; i++) await new Promise((r) => setTimeout(r, 50));
  return brevo.requests;
};

// A fake React build.
const build = mkdtempSync(join(tmpdir(), "ob-build-"));
mkdirSync(join(build, "static", "js"), { recursive: true });
writeFileSync(join(build, "index.html"), "<!doctype html><title>Online Bazaar</title><div id=root></div>");
writeFileSync(join(build, "static", "js", "main.abc123.js"), "console.log('store')");
writeFileSync(join(build, "manifest.json"), "{}");

try {
  // --- Brevo ----------------------------------------------------------------
  await withServer(
    async ({ api, db, logs }) => {
      await api("POST", "/api/v1/auth/register", { name: "Asha Rao", email: "asha@x.com", password: "secret1", phone: "98765 43210", address: "12 MG Road, Pune", answer: "a" });
      const token = (await api("POST", "/api/v1/auth/login", { email: "asha@x.com", password: "secret1" })).json.token;
      const phone = new ObjectId();
      await db.collection("products").insertOne({ _id: phone, name: "Phone X", slug: "phone-x", description: "d", price: 19599, category: new ObjectId(), quantity: 20 });
      const place = () =>
        api("POST", "/api/v1/order/create-order", { shippingAddress: "12 MG Road, Pune", paymentMethod: "cod", items: [{ product: String(phone), quantity: 1 }] }, { token });

      const order = await place();
      check("COD order placed", order.status === 201, order.text);
      const [sent] = await waitFor(1);
      check("confirmation sent through Brevo's API", sent?.method === "POST" && sent.url === "/v3/smtp/email", JSON.stringify(sent && { method: sent.method, url: sent.url }));
      check("API key sent in the api-key header", sent?.apiKey === "xkeysib-test");
      check("from Online Bazaar at EMAIL_FROM", sent?.body.sender?.name === "Online Bazaar" && sent.body.sender.email === "shop@test.example", JSON.stringify(sent?.body.sender));
      check("to the customer", sent?.body.to?.[0]?.email === "asha@x.com");
      check("HTML and plain text", /<html/.test(sent?.body.htmlContent || "") && /Thanks for your order, Asha!/.test(sent?.body.textContent || ""));
      const pdf = Buffer.from(sent?.body.attachment?.[0]?.content || "", "base64");
      check("invoice PDF attached as base64", /^INV-\d{4}-000001\.pdf$/.test(sent?.body.attachment?.[0]?.name || "") && pdf.subarray(0, 5).toString() === "%PDF-");
      check("no standard headers sent (Brevo refuses them)", sent && !("headers" in sent.body));

      brevo.status = 401;
      check("order still placed when Brevo refuses", (await place()).status === 201);
      await waitFor(2);
      await new Promise((r) => setTimeout(r, 200));
      check("failure logged with Brevo's code, never the key", /Brevo answered 401 \(unauthorized: Key not found\)/.test(logs()) && !logs().includes("xkeysib-test"));
    },
    { env: brevoEnv }
  );

  // --- TRUST_PROXY, health check and the React build --------------------------
  await withServer(
    async ({ api }) => {
      const health = await api("GET", "/api/health", null, { headers: { "X-Forwarded-For": "6.6.6.6, 1.1.1.1, 2.2.2.2" } });
      check("health check answers 200 with the database state", health.status === 200 && health.json?.database === "connected", health.text);
      check("TRUST_PROXY=2 takes the client IP two hops back, ignoring spoofed entries", health.json?.clientIp === "1.1.1.1", health.json?.clientIp);

      const home = await api("GET", "/");
      check("/ serves the React page", home.status === 200 && /<div id=root>/.test(home.text));
      check("index.html is revalidated", home.headers.get("cache-control") === "no-cache");
      const route = await api("GET", "/dashboard/user/orders/123");
      check("React routes serve the React page", route.status === 200 && /<div id=root>/.test(route.text));
      const js = await api("GET", "/static/js/main.abc123.js");
      check("hashed files are cached for a year", js.status === 200 && /immutable/.test(js.headers.get("cache-control") || ""), js.headers.get("cache-control"));
      check("manifest is revalidated", (await api("GET", "/manifest.json")).headers.get("cache-control") === "no-cache");

      const missing = await api("GET", "/api/v1/nope");
      check("unknown API paths answer JSON 404, not the React page", missing.status === 404 && missing.json?.success === false);
      check("API routes still work", (await api("GET", "/api/v1/category/get-category")).status === 200);

      const csp = home.headers.get("content-security-policy") || "";
      for (const source of ["https://cdn.jsdelivr.net", "https://accounts.google.com/gsi/client", "https://checkout.razorpay.com"]) {
        check(`CSP allows scripts from ${source}`, /script-src [^;]*/.exec(csp)?.[0].includes(source));
      }
      check("CSP upgrades insecure requests in production", csp.includes("upgrade-insecure-requests"));
      check("COOP lets Google's sign-in popup work", home.headers.get("cross-origin-opener-policy") === "same-origin-allow-popups");
    },
    { env: { TRUST_PROXY: "2", SERVE_CLIENT: "", CLIENT_BUILD_DIR: build, NODE_ENV: "production" } }
  );

  // --- Defaults: no build, so / is the API's page ---------------------------
  await withServer(async ({ api }) => {
    check("without a build, / is the API's page", /Online Bazaar API/.test((await api("GET", "/")).text));
    const csp = (await api("GET", "/")).headers.get("content-security-policy") || "";
    check("no upgrade-insecure-requests outside production", !csp.includes("upgrade-insecure-requests"));
  });
} finally {
  brevoServer.close();
}
