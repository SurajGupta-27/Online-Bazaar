// Order tracking: the customer's order details, admin status steps with
// tracking notes, and the estimated delivery date.
import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup } from "./fixtures.mjs";

const DAY = 24 * 60 * 60 * 1000;
const signUp = async (api, email) => {
  await api("POST", "/api/v1/auth/register", { name: email.split("@")[0], email, password: "secret1", phone: "1", address: "Addr", answer: "a" });
  return (await api("POST", "/api/v1/auth/login", { email, password: "secret1" })).json.token;
};
// Within a minute of the expected time (the test takes a few seconds).
const near = (date, expected) => Math.abs(new Date(date).getTime() - expected) < 60 * 1000;

await withServer(async ({ api, db }) => {
  const { token: admin } = await adminSetup(api, db);
  const shopper = await signUp(api, "shopper@x.com");
  const other = await signUp(api, "other@x.com");
  const orders = db.collection("orders");
  const pen = new ObjectId();
  await db.collection("products").insertOne({
    _id: pen, name: "Pen", slug: "pen", description: "d", price: 2, category: new ObjectId(), quantity: 10,
    images: [{ url: "https://res.cloudinary.com/demo/image/upload/pen.jpg", publicId: "pen" }],
  });
  const stock = async () => (await db.collection("products").findOne({ _id: pen })).quantity;
  const place = async (token = shopper) =>
    (await api("POST", "/api/v1/order/create-order", { shippingAddress: "Addr", items: [{ product: String(pen), quantity: 1 }] }, { token })).json.order;
  const status = (id, s, note) => api("PUT", `/api/v1/order/order-status/${id}`, { status: s, ...(note !== undefined && { note }) }, { token: admin });
  const details = (id, token = shopper) => api("GET", `/api/v1/order/my-orders/${id}`, null, { token });

  // --- Order details: own orders only ---------------------------------------
  const order = await place();
  const mine = await details(order._id);
  check("customer opens own order", mine.status === 200 && mine.json.order._id === order._id, mine.text);
  check("details include product slug and images", mine.json.order.items[0].product?.slug === "pen" && mine.json.order.items[0].product.images?.length === 1);
  check("details don't include the legacy photo", !("photo" in (mine.json.order.items[0].product || {})));
  check("new order: delivery expected 5 days after placing",
    near(mine.json.order.estimatedDelivery, new Date(mine.json.order.statusHistory[0].at).getTime() + 5 * DAY), mine.json.order.estimatedDelivery);
  check("someone else's order -> 404", (await details(order._id, other)).status === 404);
  check("an admin who isn't the buyer -> 404 here", (await details(order._id, admin)).status === 404);
  check("unknown or invalid id -> 404", (await details(String(new ObjectId()))).status === 404 && (await details("nope")).status === 404);
  check("logged out -> 401", (await api("GET", `/api/v1/order/my-orders/${order._id}`)).status === 401);
  const list = await api("GET", "/api/v1/order/my-orders", null, { token: shopper });
  check("my orders include the estimated delivery", Boolean(list.json.orders[0].estimatedDelivery));

  // --- Forward only, one step at a time --------------------------------------
  const skip = await status(order._id, "shipped");
  check("can't skip a step", skip.status === 409 && skip.json.message === "Orders move forward one step at a time: the next step is Packed", skip.text);
  check("legacy status can't be chosen", (await status(order._id, "processing")).status === 400);
  const packed = await status(order._id, "packed", "  Packed at <b>Pune</b> warehouse ");
  check("admin moves to packed with a note", packed.status === 200 && packed.json.order.status === "packed", packed.text);
  const packedEntry = packed.json.order.statusHistory.at(-1);
  check("note stored as plain text on the step", packedEntry.status === "packed" && packedEntry.note === "Packed at Pune warehouse", JSON.stringify(packedEntry));
  check("estimate: 4 days after packing", near(packed.json.order.estimatedDelivery, new Date(packedEntry.at).getTime() + 4 * DAY));
  const back = await status(order._id, "placed");
  check("can't move backwards", back.status === 409 && /next step is Shipped/.test(back.json.message), back.text);

  // Notes: validated, editable on the current step without a new history entry.
  check("note too long -> 400", (await status(order._id, "shipped", "x".repeat(201))).status === 400);
  check("note must be text -> 400", (await status(order._id, "shipped", { $gt: "" })).status === 400);
  check("rejected requests change nothing", (await orders.findOne({ _id: new ObjectId(order._id) })).status === "packed");
  const shipped = await status(order._id, "shipped");
  check("shipped without a note", shipped.status === 200 && !("note" in shipped.json.order.statusHistory.at(-1)), shipped.text);
  check("estimate: 2 days after shipping", near(shipped.json.order.estimatedDelivery, new Date(shipped.json.order.statusHistory.at(-1).at).getTime() + 2 * DAY));
  const noted = await status(order._id, "shipped", "BlueDart AWB 1234567890");
  const history = noted.json.order.statusHistory;
  check("note added to the current step later",
    noted.status === 200 && noted.json.message === "Tracking note updated" && history.length === 3 && history[2].note === "BlueDart AWB 1234567890", noted.text);
  check("earlier notes untouched", history[1].note === "Packed at Pune warehouse");
  const cleared = await status(order._id, "shipped", "");
  check("empty note removes it", cleared.status === 200 && !("note" in cleared.json.order.statusHistory[2]), cleared.text);
  await status(order._id, "shipped", "Delhivery 998877");
  const seen = await details(order._id);
  check("customer sees the tracking note", seen.json.order.statusHistory[2].note === "Delhivery 998877");

  const out = await status(order._id, "out_for_delivery");
  check("out for delivery: expected today", out.status === 200 && near(out.json.order.estimatedDelivery, Date.now()), out.text);
  const delivered = await status(order._id, "delivered");
  check("delivered: no estimate", delivered.status === 200 && delivered.json.order.estimatedDelivery === null, delivered.text);
  const late = await status(order._id, "cancelled");
  check("delivered orders can't be cancelled", late.status === 409 && late.json.message === "Delivered orders can't be cancelled", late.text);
  const past = await status(order._id, "out_for_delivery");
  check("delivered orders can't change status", past.status === 409 && past.json.message === "Delivered orders can't change status", past.text);
  const finalHistory = (await orders.findOne({ _id: new ObjectId(order._id) })).statusHistory.map((h) => h.status).join();
  check("history has every step once", finalHistory === "placed,packed,shipped,out_for_delivery,delivered", finalHistory);

  // --- Cancel from any step before delivery, with a reason -------------------
  const second = await place();
  await status(second._id, "packed");
  const before = await stock();
  const cancelled = await status(second._id, "cancelled", "Out of stock at the warehouse");
  check("cancel from packed with a note",
    cancelled.status === 200 && cancelled.json.order.status === "cancelled" && cancelled.json.order.statusHistory.at(-1).note === "Out of stock at the warehouse", cancelled.text);
  check("cancelling returns stock", (await stock()) === before + 1);
  check("cancelled: no estimate", cancelled.json.order.estimatedDelivery === null);
  check("cancelled orders can't move on", (await status(second._id, "shipped")).status === 409);

  // --- Two admins pressing the same step at once ------------------------------
  const third = await place();
  const [a, b] = await Promise.all([status(third._id, "packed"), status(third._id, "packed")]);
  const thirdHistory = (await orders.findOne({ _id: new ObjectId(third._id) })).statusHistory.map((h) => h.status).join();
  check("same step twice at once: both fine, recorded once", a.status === 200 && b.status === 200 && thirdHistory === "placed,packed", `${a.status} ${b.status} ${thirdHistory}`);

  // --- Older orders ------------------------------------------------------------
  const shopperId = (await db.collection("users").findOne({ email: "shopper@x.com" }))._id;
  const legacy = await orders.insertOne({
    user: shopperId, items: [{ product: pen, name: "Pen", price: 2, quantity: 1 }], total: 2, shippingAddress: "Addr",
    status: "processing", paymentMethod: "cod", paymentStatus: "pending", createdAt: new Date(Date.now() - 10 * DAY),
  });
  const legacyId = String(legacy.insertedId);
  const legacyView = await details(legacyId);
  check("old order without history opens", legacyView.status === 200 && legacyView.json.order.status === "processing", legacyView.text);
  check("late order: expected today, never in the past", near(legacyView.json.order.estimatedDelivery, Date.now()), legacyView.json.order.estimatedDelivery);
  const oldPlaced = await orders.insertOne({
    user: shopperId, items: [{ product: pen, name: "Pen", price: 2, quantity: 1 }], total: 2, shippingAddress: "Addr",
    status: "placed", paymentMethod: "cod", paymentStatus: "pending", createdAt: new Date(),
  });
  check("note on a step with no history entry -> 409", (await status(String(oldPlaced.insertedId), "placed", "x")).status === 409);
  const legacyPacked = await status(legacyId, "packed");
  check("legacy processing order moves on to packed", legacyPacked.status === 200 && legacyPacked.json.order.statusHistory.map((h) => h.status).join() === "packed", legacyPacked.text);

  // --- Admin list carries estimates; customers can't change status -------------
  const all = await api("GET", "/api/v1/order/all-orders", null, { token: admin });
  check("admin list includes estimates", all.json.orders.find((o) => o._id === third._id)?.estimatedDelivery);
  const denied = await api("PUT", `/api/v1/order/order-status/${third._id}`, { status: "shipped", note: "hi" }, { token: shopper });
  check("customers can't change status or notes", denied.status === 403);
});
