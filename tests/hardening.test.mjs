import fs from "node:fs";
import os from "node:os";
import { withServer, check } from "./harness.mjs";
import { adminSetup, PNG, productForm } from "./fixtures.mjs";
const uploads = () => new Set(fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("upload_")));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
await withServer(async ({ api, db, base }) => {
  const { token, categoryId } = await adminSetup(api, db);
  const before = uploads();
  const leftovers = async () => { await sleep(300); return [...uploads()].filter((f) => !before.has(f)); };

  const ok = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { photo: PNG }), { token });
  check("create product with small photo", ok.status === 201, ok.text.slice(0, 200));
  check("temp file deleted after successful upload", (await leftovers()).length === 0, String(await leftovers()));

  const big = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Big", photo: Buffer.alloc(2_000_000, 1) }), { token }).catch((e) => ({ status: "network error: " + e.cause?.code }));
  check("2MB photo rejected with 413 + message", big.status === 413 && big.json?.message === "Photo must be less than 1MB", `${big.status} ${big.text}`);
  check("no temp file left after rejected upload", (await leftovers()).length === 0, String(await leftovers()));
  check("oversized product was not saved", (await db.collection("products").countDocuments({ name: "Big" })) === 0);

  const invalid = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "", photo: PNG }), { token });
  check("validation failure still cleans temp file", invalid.status !== 201 && (await leftovers()).length === 0, `${invalid.status}`);

  const pid = ok.json.products._id;
  const upd = await api("PUT", `/api/v1/product/update-product/${pid}`, productForm(categoryId, { name: "Book 2", photo: PNG }), { token });
  check("update product with photo works + cleans temp", upd.status === 201 && (await leftovers()).length === 0, upd.text.slice(0, 200));

  const h = await api("GET", "/api/v1/category/get-category");
  check("helmet headers present", h.headers.get("x-content-type-options") === "nosniff" && !!h.headers.get("content-security-policy"));
  check("X-Powered-By removed", !h.headers.get("x-powered-by"));

  const good = await api("GET", "/api/v1/category/get-category", null, { headers: { Origin: "http://localhost:3000" } });
  const evil = await api("GET", "/api/v1/category/get-category", null, { headers: { Origin: "http://evil.example" } });
  check("CORS allows the frontend origin", good.headers.get("access-control-allow-origin") === "http://localhost:3000");
  check("CORS gives other origins no access", !evil.headers.get("access-control-allow-origin"), evil.headers.get("access-control-allow-origin"));

  const photo = await api("GET", `/api/v1/product/product-photo/${pid}`);
  check("photo served with cross-origin resource policy", photo.status === 200 && photo.headers.get("cross-origin-resource-policy") === "cross-origin");

  const cast = await api("GET", "/api/v1/product/product-photo/not-an-id");
  check("server error response has no error details", cast.status === 500 && !("error" in (cast.json || {})), cast.text);
  const badJson = await fetch(`${base}/api/v1/auth/register`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{bad" });
  const badText = await badJson.text();
  check("malformed JSON -> 400 generic message, no stack", badJson.status === 400 && !/at |SyntaxError/.test(badText), `${badJson.status} ${badText}`);
  const del = await api("DELETE", "/api/v1/category/delete-category/nope", null, { token });
  check("category error hides details", del.status === 500 && !("error" in del.json), del.text);
});
