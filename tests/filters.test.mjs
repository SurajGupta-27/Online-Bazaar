import { withServer, check, ObjectId } from "./harness.mjs";

// #16: price ranges have no gaps, the top range is open-ended, input is validated
await withServer(async ({ api, db }) => {
  const books = new ObjectId(), toys = new ObjectId();
  const prices = [0, 19.5, 19.99, 20, 39.99, 99.99, 100, 15000];
  await db.collection("products").insertMany(prices.map((price, i) => ({
    name: `P${price}`, slug: `p${i}`, description: "d", price, quantity: 1,
    category: price < 50 ? books : toys,
  })));
  const filter = (body) => api("POST", "/api/v1/product/product-filters", body);
  const names = (r) => r.json.products.map((p) => p.price).sort((a, b) => a - b);

  const under20 = await filter({ radio: [0, 20] });
  check("Under $20 includes 19.5 and 19.99 (no gap)", JSON.stringify(names(under20)) === "[0,19.5,19.99]", JSON.stringify(names(under20)));
  const twenties = await filter({ radio: [20, 40] });
  check("$20 to $39.99 includes 20 but not 40+", JSON.stringify(names(twenties)) === "[20,39.99]", JSON.stringify(names(twenties)));
  const top = await filter({ radio: [100, null] });
  check("$100 or more has no upper limit", JSON.stringify(names(top)) === "[100,15000]", JSON.stringify(names(top)));
  const both = await filter({ checked: [String(toys)], radio: [80, 100] });
  check("category + price combine", JSON.stringify(names(both)) === "[99.99]", JSON.stringify(names(both)));
  const all = await filter({});
  check("no filters returns everything", all.json.products.length === prices.length);

  for (const [label, body] of [
    ["bad category id", { checked: ["nope"] }],
    ["category operator injection", { checked: { $ne: null } }],
    ["non-numeric price", { radio: ["0", "20"] }],
    ["price operator injection", { radio: [{ $gt: 0 }, null] }],
  ]) {
    const r = await filter(body);
    check(`${label} -> 400`, r.status === 400, `${r.status} ${r.text}`);
  }
});

// Category pages are paged 6 at a time with a total
await withServer(async ({ api, db }) => {
  const books = new ObjectId(), toys = new ObjectId();
  await db.collection("categories").insertMany([
    { _id: books, name: "Books", slug: "books" },
    { _id: toys, name: "Toys", slug: "toys" },
  ]);
  await db.collection("products").insertMany(Array.from({ length: 14 }, (_, i) => ({
    name: `B${i}`, slug: `b${i}`, description: "d", price: 1, quantity: 1,
    category: i < 13 ? books : toys, createdAt: new Date(2026, 0, 1, 0, i),
  })));
  const get = (q) => api("GET", `/api/v1/product/product-category/books${q}`);
  const names = (r) => r.json.products.map((p) => p.name).join();
  const p1 = await get(""), p2 = await get("?page=2"), p3 = await get("?page=3");
  check("page 1: 6 newest of this category + total", p1.json.total === 13 && names(p1) === "B12,B11,B10,B9,B8,B7", names(p1));
  check("page 2 continues", names(p2) === "B6,B5,B4,B3,B2,B1", names(p2));
  check("page 3 has the remainder", names(p3) === "B0", names(p3));
  const missing = await api("GET", "/api/v1/product/product-category/nope");
  check("unknown category -> 404", missing.status === 404);
});
