import { withServer, check, ObjectId } from "./harness.mjs";
await withServer(async ({ api, db }) => {
  await api("POST", "/api/v1/auth/register", { name: "B", email: "b@x.com", password: "secret1", phone: "1", address: "Addr", answer: "a" });
  const { json } = await api("POST", "/api/v1/auth/login", { email: "b@x.com", password: "secret1" });
  const token = json.token;
  const products = db.collection("products");
  const cat = new ObjectId();
  const last = new ObjectId(), plenty = new ObjectId(), scarce = new ObjectId();
  await products.insertMany([
    { _id: last, name: "Last One", slug: "l", description: "d", price: 10, category: cat, quantity: 1 },
    { _id: plenty, name: "Plenty", slug: "p", description: "d", price: 5, category: cat, quantity: 10 },
    { _id: scarce, name: "Scarce", slug: "s", description: "d", price: 7, category: cat, quantity: 2 },
  ]);
  const order = (items) => api("POST", "/api/v1/order/create-order", { shippingAddress: "Addr", items }, { token });

  const results = await Promise.all(Array.from({ length: 20 }, () => order([{ product: String(last), quantity: 1 }])));
  const ok = results.filter((r) => r.status === 201).length;
  const stock = (await products.findOne({ _id: last })).quantity;
  check("20 concurrent orders for last unit: exactly 1 succeeds", ok === 1, `succeeded=${ok}`);
  check("stock never goes negative", stock === 0, `stock=${stock}`);
  check("rejected orders get a clear 409 message", results.find((r) => r.status === 409)?.json?.message === "Last One does not have enough stock");
  check("only one order document created", (await db.collection("orders").countDocuments()) === 1);

  const partial = await order([{ product: String(plenty), quantity: 3 }, { product: String(scarce), quantity: 5 }]);
  const plentyQty = (await products.findOne({ _id: plenty })).quantity;
  check("failed multi-item order rolls back earlier reservations", partial.status === 409 && plentyQty === 10, `status=${partial.status} plenty=${plentyQty}`);

  const dup = await order([{ product: String(scarce), quantity: 2 }, { product: String(scarce), quantity: 1 }]);
  check("duplicate lines are summed (2+1 > stock 2 -> rejected)", dup.status === 409, String(dup.status));

  const good = await order([{ product: String(plenty), quantity: 2 }, { product: String(scarce), quantity: 2 }]);
  check("valid order succeeds with server-side total", good.status === 201 && good.json.order.total === 24, good.text);
  check("stock reduced correctly", (await products.findOne({ _id: plenty })).quantity === 8 && (await products.findOne({ _id: scarce })).quantity === 0);

  const bad = await order([{ product: "not-an-id", quantity: 1 }]);
  check("invalid product id -> 400", bad.status === 400, bad.text);
  const gone = await order([{ product: String(new ObjectId()), quantity: 1 }]);
  check("missing product -> 400", gone.status === 400, gone.text);
});
