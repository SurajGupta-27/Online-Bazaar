// Admin analytics: every number checked against hand-built orders.
import { withServer, check, ObjectId } from "./harness.mjs";

const IST = "Asia/Kolkata";
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const DAY = 24 * 60 * 60 * 1000;

await withServer(async ({ api, db }) => {
  const register = async (email, role = 0) => {
    await api("POST", "/api/v1/auth/register", { name: email, email, password: "secret1", phone: "1", address: "a", answer: "a" });
    if (role) await db.collection("users").updateOne({ email }, { $set: { role } });
    const { json } = await api("POST", "/api/v1/auth/login", { email, password: "secret1" });
    return { token: json.token, id: (await db.collection("users").findOne({ email }))._id };
  };
  const admin = await register("admin@x.com", 1);
  const u1 = await register("u1@x.com");
  const u2 = await register("u2@x.com");
  await register("u3@x.com"); // never orders

  const phones = new ObjectId();
  const books = new ObjectId();
  await db.collection("categories").insertMany([
    { _id: phones, name: "Phones", slug: "phones" },
    { _id: books, name: "Books", slug: "books" },
  ]);
  const [P1, P2, P3, P4, P5, P6] = Array.from({ length: 6 }, () => new ObjectId());
  await db.collection("products").insertMany([
    { _id: P1, name: "Phone", slug: "phone", description: "d", price: 100, category: phones, quantity: 3 },
    { _id: P2, name: "Book", slug: "book", description: "d", price: 50, category: books, quantity: 10 },
    { _id: P3, name: "Pen", slug: "pen", description: "d", price: 10, category: books, quantity: 0 },
    // P4 was deleted: it only exists in old orders.
    { _id: P5, name: "Atlas", slug: "atlas", description: "d", price: 5, category: books, quantity: 5 },
    { _id: P6, name: "Ink", slug: "ink", description: "d", price: 5, category: books, quantity: 6 },
  ]);

  const now = new Date();
  // Just after midnight today in India = still yesterday in UTC.
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const istMidnight = new Date(Date.UTC(y, m - 1, d) - 5.5 * 60 * 60 * 1000);
  const earlyToday = new Date(Math.min(now.getTime(), istMidnight.getTime() + 30 * 60 * 1000));
  const item = (product, name, price, quantity) => ({ product, name, price, quantity });
  const order = (user, items, fields) => ({
    user, items, total: items.reduce((s, i) => s + i.price * i.quantity, 0), shippingAddress: "a", ...fields,
  });
  await db.collection("orders").insertMany([
    // o1: COD, not paid yet, early today (IST)
    order(u1.id, [item(P1, "Phone", 100, 1), item(P2, "Book", 50, 2)], { status: "placed", paymentMethod: "cod", paymentStatus: "pending", createdAt: earlyToday }),
    // o2: COD, cash collected, two days ago
    order(u1.id, [item(P2, "Book", 50, 1)], { status: "delivered", paymentMethod: "cod", paymentStatus: "paid", createdAt: new Date(now - 2 * DAY) }),
    // o3: paid online today
    order(u2.id, [item(P1, "Phone", 100, 2)], { status: "shipped", paymentMethod: "razorpay", paymentStatus: "paid", createdAt: now }),
    // o4: online, still at checkout: not an order yet
    order(u2.id, [item(P1, "Phone", 100, 1)], { status: "placed", paymentMethod: "razorpay", paymentStatus: "pending", createdAt: now }),
    // o5: online payment abandoned
    order(u2.id, [item(P3, "Pen", 10, 5)], { status: "cancelled", paymentMethod: "razorpay", paymentStatus: "failed", createdAt: now }),
    // o6: COD cancelled
    order(u1.id, [item(P2, "Book", 50, 10)], { status: "cancelled", paymentMethod: "cod", paymentStatus: "pending", createdAt: now }),
    // o7: from before payments existed (no method/status fields), 40 days ago, deleted product
    order(u1.id, [item(P4, "Old Gadget", 20, 3)], { createdAt: new Date(now - 40 * DAY) }),
    // o8: paid online, then cancelled (refund due)
    order(u2.id, [item(P1, "Phone", 100, 1)], { status: "cancelled", paymentMethod: "razorpay", paymentStatus: "paid", refundRequired: true, createdAt: now }),
  ]);

  check("logged out -> 401", (await api("GET", "/api/v1/analytics/dashboard")).status === 401);
  check("customer -> 403", (await api("GET", "/api/v1/analytics/dashboard", null, { token: u1.token })).status === 403);

  const r = await api("GET", "/api/v1/analytics/dashboard", null, { token: admin.token });
  check("admin -> 200", r.status === 200, r.text.slice(0, 300));
  const a = r.json || {};
  const s = a.summary || {};
  check("revenue counts paid, non-cancelled orders only", s.revenue === 250 && s.paidOrders === 2, JSON.stringify(s));
  check("unpaid COD shown separately (incl. orders from before payments)", s.unpaidCod === 260 && s.unpaidCodOrders === 2, JSON.stringify(s));
  check("orders = sales (no cancelled, no checkout-in-progress)", s.orders === 4 && s.cancelledOrders === 3, JSON.stringify(s));
  check("customers exclude admins; who has ordered", s.customers === 3 && s.customersWithOrders === 2, JSON.stringify(s));
  check("average order value over all sales", s.averageOrderValue === 127.5, String(s.averageOrderValue));

  const daily = a.daily || [];
  const today = dayKey(now);
  const byDate = new Map(daily.map((x) => [x.date, x]));
  check("30 days, oldest first, ending today (India time)", daily.length === 30 && daily[29]?.date === today &&
    daily.every((x, i) => i === 0 || x.date > daily[i - 1].date), `${daily.length} ${daily[0]?.date}..${daily[29]?.date}`);
  check("today: paid and unpaid COD apart, orders counted (early-morning IST order included)",
    JSON.stringify(byDate.get(today)) === JSON.stringify({ date: today, revenue: 200, unpaidCod: 200, orders: 2 }), JSON.stringify(byDate.get(today)));
  const twoDaysAgo = dayKey(new Date(now - 2 * DAY));
  check("two days ago", byDate.get(twoDaysAgo)?.revenue === 50 && byDate.get(twoDaysAgo)?.orders === 1, JSON.stringify(byDate.get(twoDaysAgo)));
  check("days without sales are zero, older orders left out",
    daily.reduce((n, x) => n + x.orders, 0) === 3 && daily.reduce((n, x) => n + x.revenue + x.unpaidCod, 0) === 450);

  check("top products by units, ties by sales; deleted products keep their name",
    JSON.stringify((a.topProducts || []).map((p) => [p.name, p.units, p.sales, p.slug])) ===
      JSON.stringify([["Phone", 3, 300, "phone"], ["Book", 3, 150, "book"], ["Old Gadget", 3, 60, null]]),
    JSON.stringify(a.topProducts));
  check("sales by category, biggest first",
    JSON.stringify((a.salesByCategory || []).map((c) => [c.name, c.sales, c.units])) ===
      JSON.stringify([["Phones", 300, 3], ["Books", 150, 3], ["Uncategorised", 60, 3]]),
    JSON.stringify(a.salesByCategory));
  check("COD vs online split",
    JSON.stringify(a.paymentSplit) === JSON.stringify([{ method: "cod", orders: 3, value: 310 }, { method: "razorpay", orders: 1, value: 200 }]),
    JSON.stringify(a.paymentSplit));
  check("status breakdown in order, checkout-in-progress left out",
    JSON.stringify(a.statusBreakdown) === JSON.stringify([
      { status: "placed", orders: 2 }, { status: "packed", orders: 0 }, { status: "shipped", orders: 1 },
      { status: "out_for_delivery", orders: 0 }, { status: "delivered", orders: 1 }, { status: "cancelled", orders: 3 },
    ]), JSON.stringify(a.statusBreakdown));
  check("low stock: 5 or fewer, emptiest first",
    a.lowStock?.limit === 5 && a.lowStock.total === 3 &&
      JSON.stringify(a.lowStock.products.map((p) => [p.name, p.quantity, p.category])) ===
        JSON.stringify([["Pen", 0, "Books"], ["Phone", 3, "Phones"], ["Atlas", 5, "Books"]]),
    JSON.stringify(a.lowStock));
  check("no customer details in analytics", !/@x\.com|password|answer/.test(r.text));

  // An empty store answers with zeros, not errors.
  await db.collection("orders").deleteMany({});
  const empty = await api("GET", "/api/v1/analytics/dashboard", null, { token: admin.token });
  check("empty store: zeros", empty.status === 200 && empty.json.summary.revenue === 0 && empty.json.summary.averageOrderValue === 0 &&
    empty.json.daily.length === 30 && empty.json.topProducts.length === 0 && empty.json.paymentSplit.every((p) => p.orders === 0), empty.text.slice(0, 300));
});
