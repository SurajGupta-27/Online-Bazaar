import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup, PNG, productForm } from "./fixtures.mjs";
await withServer(async ({ api, db }) => {
  const { token, categoryId } = await adminSetup(api, db);
  const html = Buffer.from("<script>alert(document.cookie)</script>");
  const h = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Evil", photo: html, type: "text/html", filename: "x.html" }), { token });
  check("text/html upload rejected (400)", h.status === 400 && /JPEG, PNG/.test(h.json?.message), h.text);
  const svg = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Svg", photo: Buffer.from("<svg/>"), type: "image/svg+xml", filename: "x.svg" }), { token });
  check("SVG upload rejected (400)", svg.status === 400, svg.text);
  check("rejected products not saved", (await db.collection("products").countDocuments()) === 0);

  const ok = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { photo: PNG }), { token });
  const pid = ok.json.products._id;
  const upd = await api("PUT", `/api/v1/product/update-product/${pid}`, productForm(categoryId, { name: "Book", photo: html, type: "text/html", filename: "x.html" }), { token });
  const stillPng = await db.collection("products").findOne({ _id: new ObjectId(pid) });
  check("update with text/html rejected, photo unchanged", upd.status === 400 && stillPng.photo.contentType === "image/png", upd.text);
  const img = await api("GET", `/api/v1/product/product-photo/${pid}`);
  check("PNG served as image/png with nosniff", img.status === 200 && img.headers.get("content-type").startsWith("image/png") && img.headers.get("x-content-type-options") === "nosniff");

  // A photo stored before this fix with a dangerous type is not served
  const legacy = new ObjectId();
  await db.collection("products").insertOne({ _id: legacy, name: "Old", slug: "old", description: "d", price: 1, category: new ObjectId(categoryId), quantity: 1, photo: { data: html, contentType: "text/html" } });
  const lh = await api("GET", `/api/v1/product/product-photo/${legacy}`);
  check("legacy text/html photo not served", lh.status === 404 && !lh.text.includes("<script>"), `${lh.status} ${lh.headers.get("content-type")}`);
});
