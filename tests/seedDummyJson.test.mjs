import http from "node:http";
import { withServer, check, runScript, ObjectId } from "./harness.mjs";
import { startMockCloudinary, cloudinaryEnv } from "./mockCloudinary.mjs";

const SCRIPT = "scripts/seedDummyJson.mjs";
const img = (id, n) => `https://cdn.dummyjson.com/product-images/x/${id}/${n}.webp`;
const PRODUCTS = [
  { id: 1, title: "Essence Mascara", description: "Lash volume", category: "beauty", price: 9.99, stock: 99, images: [img(1, 1)], thumbnail: img(1, "t") },
  { id: 2, title: "iPhone 9", description: "A phone", category: "smartphones", price: 549, stock: 0, images: [1, 2, 3, 4, 5, 6].map((n) => img(2, n)) },
  { id: 3, title: "Apple", description: "Fruit", category: "groceries", price: 1.99, stock: 50, images: [img(3, 1)] },
  { id: 4, title: "Laptop Pro", description: "Fast", category: "laptops", price: 0.05, stock: 5, images: [], thumbnail: img(4, "t") },
];
const CATEGORIES = [
  { slug: "beauty", name: "Beauty" },
  { slug: "smartphones", name: "Smartphones" },
  { slug: "groceries", name: "Groceries" },
  { slug: "laptops", name: "Laptops" },
];

const dummy = http.createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "application/json" });
  if (req.url === "/products?limit=0") return res.end(JSON.stringify({ products: PRODUCTS, total: PRODUCTS.length }));
  if (req.url === "/products/categories") return res.end(JSON.stringify(CATEGORIES));
  res.writeHead(404).end("{}");
});
await new Promise((r) => dummy.listen(9312, "127.0.0.1", r));
const mock = await startMockCloudinary();

try {
  await withServer(async ({ db, uri, api }) => {
    // An admin already made "smartphones" (different case) and an "iphone-9" slug.
    const phones = new ObjectId();
    await db.collection("categories").insertOne({ _id: phones, name: "SmartPhones", slug: "smartphones" });
    await db.collection("products").insertOne({ name: "iPhone 9", slug: "iphone-9", description: "admin's", price: 1, category: phones, quantity: 1 });
    const env = { MONGO_URL: uri, DUMMYJSON_URL: "http://127.0.0.1:9312", ...cloudinaryEnv(mock) };

    const dry = await runScript(SCRIPT, [], env);
    check("dry run lists 3 products, skipping groceries", dry.code === 0 && /Would import 3, already there 0, failed 0/.test(dry.output), dry.output);
    check("dry run shows the rupee price", /\$9\.99 -> ₹849/.test(dry.output), dry.output);
    check("dry run writes nothing", (await db.collection("products").countDocuments()) === 1 && (await db.collection("categories").countDocuments()) === 1 && mock.state.uploads.length === 0);

    const noCloud = await runScript(SCRIPT, ["--apply"], { ...env, CLOUDINARY_API_SECRET: "" });
    check("apply refuses without Cloudinary settings", noCloud.code !== 0 && /CLOUDINARY_CLOUD_NAME/.test(noCloud.output), noCloud.output);

    const applied = await runScript(SCRIPT, ["--apply"], env);
    check("apply imports 3 products", applied.code === 0 && /Imported 3, already there 0, failed 0/.test(applied.output), applied.output);
    const products = db.collection("products");
    check("groceries skipped", !(await products.findOne({ externalId: "dummyjson:3" })));
    const cats = await db.collection("categories").find().toArray();
    check("matching categories created, existing one reused", cats.map((c) => c.name).sort().join() === "Beauty,Laptops,SmartPhones", cats.map((c) => c.name).join());
    check("new category slugs are lowercase", cats.find((c) => c.name === "Beauty").slug === "beauty");

    const mascara = await products.findOne({ externalId: "dummyjson:1" });
    check("price converted to rupees", mascara.price === 849, String(mascara.price));
    check("stock, description and shipping set", mascara.quantity === 99 && mascara.description === "Lash volume" && mascara.shipping === true);
    check("product placed in its category", String(mascara.category) === String(cats.find((c) => c.name === "Beauty")._id));
    const phone = await products.findOne({ externalId: "dummyjson:2" });
    check("images capped at 4, main image first", phone.images.length === 4 && phone.images[0].publicId === "online-bazaar/products/dummyjson-2-1", JSON.stringify(phone.images.map((i) => i.publicId)));
    check("zero stock kept (out of stock)", phone.quantity === 0);
    check("taken slug gets a suffix", phone.slug === "iphone-9-dj2", phone.slug);
    check("reused category for the phone", String(phone.category) === String(phones));
    const laptop = await products.findOne({ externalId: "dummyjson:4" });
    check("thumbnail used when there are no images; tiny prices floor at ₹9", laptop.images.length === 1 && laptop.price === 9, JSON.stringify(laptop));
    check("Cloudinary fetched the images from DummyJSON's CDN", mock.state.uploads.length === 6 && mock.state.uploads.every((u) => u.source.startsWith("https://cdn.dummyjson.com/")));

    const shown = await api("GET", `/api/v1/product/get-product/${phone.slug}`);
    check("imported product served with its gallery", shown.json?.product?.images?.length === 4);

    const again = await runScript(SCRIPT, ["--apply"], env);
    check("second run imports nothing", again.code === 0 && /Imported 0, already there 3, failed 0/.test(again.output), again.output);
    check("no duplicate products or categories", (await products.countDocuments()) === 4 && (await db.collection("categories").countDocuments()) === 3);
    check("second run uploads nothing", mock.state.uploads.length === 6);

    // A product whose upload failed is retried on the next run.
    await products.deleteOne({ externalId: "dummyjson:1" });
    mock.state.failNextUploads = 1;
    const flaky = await runScript(SCRIPT, ["--apply"], env);
    check("failed upload reported, product not created", flaky.code !== 0 && /failed 1/.test(flaky.output) && !(await products.findOne({ externalId: "dummyjson:1" })), flaky.output);
    const retry = await runScript(SCRIPT, ["--apply"], env);
    check("re-run imports it, reusing the uploaded image", retry.code === 0 && /Imported 1/.test(retry.output) && mock.state.uploads.length === 6, retry.output);

    const limited = await runScript(SCRIPT, ["--limit", "1", "--rate", "90"], env);
    check("--limit and --rate apply", /1 to import/.test(limited.output) && /at ₹90 per US dollar/.test(limited.output), limited.output);
    check("all requests were correctly signed", mock.state.badSignatures === 0);
  });
} finally {
  await mock.close();
  await new Promise((r) => dummy.close(r));
}
