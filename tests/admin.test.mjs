import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup } from "./fixtures.mjs";

const signUp = async (api, email) => {
  await api("POST", "/api/v1/auth/register", { name: email.split("@")[0], email, password: "secret1", phone: "1", address: "Addr", answer: "a" });
  return (await api("POST", "/api/v1/auth/login", { email, password: "secret1" })).json.token;
};

// Admin order management
await withServer(async ({ api, db }) => {
  const { token: admin } = await adminSetup(api, db);
  const shopper = await signUp(api, "shopper@x.com");
  const pen = new ObjectId();
  await db.collection("products").insertOne({ _id: pen, name: "Pen", slug: "pen", description: "d", price: 2, category: new ObjectId(), quantity: 10 });
  const stock = async () => (await db.collection("products").findOne({ _id: pen })).quantity;
  const order = async (quantity) =>
    (await api("POST", "/api/v1/order/create-order", { shippingAddress: "Addr", items: [{ product: String(pen), quantity }] }, { token: shopper })).json.order._id;
  const first = await order(3);
  const second = await order(2);
  check("orders reserved stock", (await stock()) === 5);

  const list = await api("GET", "/api/v1/order/all-orders", null, { token: admin });
  check("admin lists all orders, newest first", list.status === 200 && list.json.orders.map((o) => o._id).join() === [second, first].join());
  const buyer = list.json.orders[0].user;
  check("orders include buyer name/email only", buyer.name === "shopper" && buyer.email === "shopper@x.com" && !("password" in buyer) && !("answer" in buyer), JSON.stringify(buyer));
  const denied = await api("GET", "/api/v1/order/all-orders", null, { token: shopper });
  const deniedUpdate = await api("PUT", `/api/v1/order/order-status/${first}`, { status: "shipped" }, { token: shopper });
  check("non-admins can't list or update orders", denied.status === 403 && deniedUpdate.status === 403);

  const status = (id, s) => api("PUT", `/api/v1/order/order-status/${id}`, { status: s }, { token: admin });
  const shipped = await status(first, "shipped");
  check("admin changes status", shipped.status === 200 && shipped.json.order.status === "shipped", shipped.text);
  const mine = await api("GET", "/api/v1/order/my-orders", null, { token: shopper });
  check("shopper sees the new status", mine.json.orders.find((o) => o._id === first).status === "shipped");
  const bogus = await status(first, "teleported");
  check("unknown status -> 400", bogus.status === 400 && bogus.json.message === "Invalid order status");
  check("missing/invalid order -> 404", (await status(String(new ObjectId()), "shipped")).status === 404 && (await status("nope", "shipped")).status === 404);

  // Two cancels at once must restore stock exactly once
  const [c1, c2] = await Promise.all([status(first, "cancelled"), status(first, "cancelled")]);
  check("cancelling returns items to stock exactly once", c1.status === 200 && c2.status === 200 && (await stock()) === 8, `stock=${await stock()}`);
  const reopen = await status(first, "processing");
  check("cancelled orders can't be reopened", reopen.status === 409 && reopen.json.message === "Cancelled orders can't be reopened");
  check("stock unchanged by the refused reopen", (await stock()) === 8);
});

// Admin users list
await withServer(async ({ api, db }) => {
  const { token: admin } = await adminSetup(api, db);
  const shopper = await signUp(api, "shopper@x.com");
  const list = await api("GET", "/api/v1/auth/all-users", null, { token: admin });
  check("admin lists all users, newest first", list.status === 200 && list.json.users.map((u) => u.email).join() === "shopper@x.com,admin@x.com", list.text.slice(0, 200));
  const u = list.json.users[0];
  check("users have public fields, role and join date only",
    JSON.stringify(Object.keys(u).sort()) === JSON.stringify(["_id", "address", "createdAt", "email", "name", "phone", "role"]), Object.keys(u).join());
  check("roles are reported", list.json.users.map((x) => x.role).join() === "0,1");
  const denied = await api("GET", "/api/v1/auth/all-users", null, { token: shopper });
  const anon = await api("GET", "/api/v1/auth/all-users");
  check("non-admins can't list users", denied.status === 403 && anon.status === 401, `${denied.status} ${anon.status}`);
});
