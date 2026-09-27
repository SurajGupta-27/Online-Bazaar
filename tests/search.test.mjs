import { withServer, check, ObjectId } from "./harness.mjs";
await withServer(async ({ api, db }) => {
  const cat = new ObjectId();
  await db.collection("products").insertMany([
    { name: "C++ Primer", slug: "c-primer", description: "Book", price: 30, category: cat, quantity: 5 },
    { name: "Laptop", slug: "laptop", description: "Fast machine", price: 900, category: cat, quantity: 5 },
  ]);
  const s = (k) => api("GET", "/api/v1/product/search/" + encodeURIComponent(k));
  const plus = await s("c++");
  check("'c++' is a literal match (was an invalid regex)", plus.status === 200 && plus.json.length === 1 && plus.json[0].name === "C++ Primer", plus.text);
  const dot = await s("e.");
  check("'e.' matches literally, not as e-plus-any-char", dot.status === 200 && dot.json.length === 0, dot.text);
  const ci = await s("LAPTOP");
  check("normal search still case-insensitive", ci.json.length === 1);
  const t0 = Date.now();
  const redos = await s("(a+)+$" + "a".repeat(30));
  check("catastrophic pattern handled fast", redos.status === 200 && Date.now() - t0 < 1000, `${Date.now() - t0}ms`);
});
