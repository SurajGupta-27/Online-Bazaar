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
