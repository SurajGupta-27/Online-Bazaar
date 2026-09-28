// Checkout payments: Cash on Delivery and Razorpay, against a local mock of
// Razorpay's orders API (the real API is never called).
import http from "node:http";
import crypto from "node:crypto";
import { withServer, check, ObjectId } from "./harness.mjs";

const KEY_ID = "rzp_test_mockkey";
const KEY_SECRET = "mock_secret_for_tests";

// --- mock Razorpay ----------------------------------------------------------
const mock = { requests: [], fail: false, next: 1 };
const razorpay = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const expectedAuth = "Basic " + Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
    mock.requests.push({ method: req.method, url: req.url, auth: req.headers.authorization === expectedAuth, body: JSON.parse(body || "{}") });
    res.setHeader("Content-Type", "application/json");
    if (mock.fail) {
      res.statusCode = 500;
      return res.end(JSON.stringify({ error: { description: "mock outage" } }));
    }
    const { amount, currency, receipt } = JSON.parse(body);
    res.end(JSON.stringify({ id: `order_mock${mock.next++}`, amount, currency, receipt, status: "created" }));
  });
});
await new Promise((r) => razorpay.listen(0, "127.0.0.1", r));
const RAZORPAY_API_URL = `http://127.0.0.1:${razorpay.address().port}/v1`;

const sign = (orderId, paymentId, secret = KEY_SECRET) =>
  crypto.createHmac("sha256", secret).update(`${orderId}|${paymentId}`).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  await withServer(
    async ({ api, db }) => {
      const register = async (email, role = 0) => {
        await api("POST", "/api/v1/auth/register", { name: email, email, password: "secret1", phone: "1", address: "Addr", answer: "a" });
        if (role) await db.collection("users").updateOne({ email }, { $set: { role } });
        return (await api("POST", "/api/v1/auth/login", { email, password: "secret1" })).json.token;
      };
      const token = await register("buyer@x.com");
      const other = await register("other@x.com");
      const admin = await register("admin@x.com", 1);

      const products = db.collection("products");
      const orders = db.collection("orders");
      const cat = new ObjectId();
      const phone = new ObjectId(), case_ = new ObjectId(), last = new ObjectId();
      await products.insertMany([
        { _id: phone, name: "Phone", slug: "phone", description: "d", price: 19599, category: cat, quantity: 5 },
        { _id: case_, name: "Case", slug: "case", description: "d", price: 249.5, category: cat, quantity: 10 },
        { _id: last, name: "Last One", slug: "last", description: "d", price: 999, category: cat, quantity: 1 },
      ]);
      const stock = async (id) => (await products.findOne({ _id: id })).quantity;
      const place = (body, t = token) =>
        api("POST", "/api/v1/order/create-order", { shippingAddress: "Addr", ...body }, { token: t });

      // --- Cash on Delivery -------------------------------------------------
      const cod = await place({ paymentMethod: "cod", items: [{ product: String(phone), quantity: 1 }] });
      check("COD order placed", cod.status === 201, cod.text);
      check("COD: method cod, payment pending", cod.json?.order?.paymentMethod === "cod" && cod.json.order.paymentStatus === "pending");
      check("COD reserves stock immediately", (await stock(phone)) === 4);
      check("COD never calls Razorpay", mock.requests.length === 0);
      const legacy = await place({ items: [{ product: String(case_), quantity: 1 }] });
      check("no paymentMethod defaults to COD", legacy.status === 201 && legacy.json.order.paymentMethod === "cod", legacy.text);
      const bogus = await place({ paymentMethod: "bitcoin", items: [{ product: String(case_), quantity: 1 }] });
      check("unknown payment method -> 400", bogus.status === 400, bogus.text);

      // --- Razorpay: amount from DB prices, never the client --------------
      const rp = await place({
        paymentMethod: "razorpay",
        items: [
          { product: String(phone), quantity: 1, price: 1 },
          { product: String(case_), quantity: 2, price: 1 },
        ],
        total: 1,
      });
      check("Razorpay order created", rp.status === 201, rp.text);
      const rpOrder = rp.json?.order;
      const req1 = mock.requests.at(-1);
      check("Razorpay called with server-computed amount in paise (19599 + 2*249.5 = ₹20098)", req1?.body.amount === 2009800 && req1.body.currency === "INR", JSON.stringify(req1?.body));
      check("Razorpay called with key id + secret (Basic auth)", req1?.auth === true);
      check("receipt is our order id", req1?.body.receipt === rpOrder?._id);
      check("response gives the browser only the key id", rp.json?.payment?.keyId === KEY_ID && !rp.text.includes(KEY_SECRET), JSON.stringify(rp.json?.payment));
      check("response has Razorpay order id, amount and checkout timeout",
        rp.json?.payment?.razorpayOrderId === rpOrder?.razorpayOrderId && rp.json.payment.amount === 2009800 && rp.json.payment.timeout >= 60);
      check("online order starts pending with stock held", rpOrder?.paymentMethod === "razorpay" && rpOrder.paymentStatus === "pending" && (await stock(phone)) === 3);

      // --- verification -----------------------------------------------------
      const verify = (body, t = token) => api("POST", "/api/v1/order/verify-payment", body, { token: t });
      const payId = "pay_mock123";
      const forged = await verify({ orderId: rpOrder._id, razorpay_payment_id: payId, razorpay_signature: sign(rpOrder.razorpayOrderId, payId, "wrong_secret") });
      check("forged signature rejected", forged.status === 400, forged.text);
      const wrongOrder = await verify({ orderId: rpOrder._id, razorpay_payment_id: payId, razorpay_signature: sign("order_someoneelse", payId) });
      check("signature for a different Razorpay order rejected", wrongOrder.status === 400);
      const notMine = await verify({ orderId: rpOrder._id, razorpay_payment_id: payId, razorpay_signature: sign(rpOrder.razorpayOrderId, payId) }, other);
      check("another user can't verify my order", notMine.status === 404);
      check("still pending after bad attempts", (await orders.findOne({ _id: new ObjectId(rpOrder._id) })).paymentStatus === "pending");

      const good = await verify({ orderId: rpOrder._id, razorpay_payment_id: payId, razorpay_signature: sign(rpOrder.razorpayOrderId, payId) });
      check("valid signature marks order paid", good.status === 200 && good.json.order.paymentStatus === "paid" && good.json.order.razorpayPaymentId === payId, good.text);
      const again = await verify({ orderId: rpOrder._id, razorpay_payment_id: payId, razorpay_signature: sign(rpOrder.razorpayOrderId, payId) });
      check("verifying twice is harmless", again.status === 200);
      check("paid order keeps its stock", (await stock(phone)) === 3 && (await stock(case_)) === 7);
      const cancelPaid = await api("POST", `/api/v1/order/cancel-payment/${rpOrder._id}`, null, { token });
      check("closing the popup can't cancel a paid order", cancelPaid.status === 200 && cancelPaid.json.order.paymentStatus === "paid" && (await stock(phone)) === 3);

      // --- popup closed: stock comes back once -----------------------------
      const closed = await place({ paymentMethod: "razorpay", items: [{ product: String(last), quantity: 1 }] });
      check("last unit held during checkout", closed.status === 201 && (await stock(last)) === 0, closed.text);
      const rival = await place({ paymentMethod: "cod", items: [{ product: String(last), quantity: 1 }] }, other);
      check("nobody else can buy the held unit meanwhile", rival.status === 409, rival.text);
      const c1 = await api("POST", `/api/v1/order/cancel-payment/${closed.json.order._id}`, null, { token });
      const c2 = await api("POST", `/api/v1/order/cancel-payment/${closed.json.order._id}`, null, { token });
      check("closing checkout cancels: payment failed, order cancelled",
        c1.status === 200 && c1.json.order.paymentStatus === "failed" && c1.json.order.status === "cancelled", c1.text);
      check("stock returned exactly once", c2.status === 200 && (await stock(last)) === 1, `stock=${await stock(last)}`);
      const lateAfterClose = await verify({ orderId: closed.json.order._id, razorpay_payment_id: "pay_late", razorpay_signature: sign(closed.json.order.razorpayOrderId, "pay_late") });
      const lateDoc = await orders.findOne({ _id: new ObjectId(closed.json.order._id) });
      check("payment after cancel: recorded, flagged for refund, order stays cancelled, no stock taken",
        lateAfterClose.status === 409 && lateDoc.paymentStatus === "paid" && lateDoc.refundRequired === true && lateDoc.status === "cancelled" && (await stock(last)) === 1,
        lateAfterClose.text);
      const otherCancel = await api("POST", `/api/v1/order/cancel-payment/${cod.json.order._id}`, null, { token: other });
      check("can't cancel someone else's order", otherCancel.status === 404);
      const codCancel = await api("POST", `/api/v1/order/cancel-payment/${cod.json.order._id}`, null, { token });
      check("cancel-payment doesn't touch COD orders", codCancel.json?.order?.status === "placed" && (await stock(phone)) === 3);

      // --- abandoned checkout: hold expires ---------------------------------
      const abandoned = await place({ paymentMethod: "razorpay", items: [{ product: String(last), quantity: 1 }] });
      check("abandoned checkout holds stock", abandoned.status === 201 && (await stock(last)) === 0);
      await sleep(5000); // hold is 3s, sweep every 1s
      const expiredDoc = await orders.findOne({ _id: new ObjectId(abandoned.json.order._id) });
      check("expired hold released by the sweep", expiredDoc.paymentStatus === "failed" && expiredDoc.status === "cancelled" && (await stock(last)) === 1,
        `${expiredDoc.paymentStatus}/${expiredDoc.status} stock=${await stock(last)}`);

      // --- Razorpay outage: nothing lost -------------------------------------
      mock.fail = true;
      const outage = await place({ paymentMethod: "razorpay", items: [{ product: String(case_), quantity: 3 }] });
      mock.fail = false;
      check("Razorpay error -> 502 with a friendly message", outage.status === 502 && /Cash on Delivery/.test(outage.json?.message), outage.text);
      check("Razorpay error returns the stock", (await stock(case_)) === 7);
      check("no raw error details leaked", !/mock outage/.test(outage.text));

      // --- admin -------------------------------------------------------------
      const adminPut = (path, body) => api("PUT", `/api/v1/order/${path}`, body, { token: admin });
      const unpaid = await place({ paymentMethod: "razorpay", items: [{ product: String(case_), quantity: 1 }] });
      const ship = await adminPut(`order-status/${unpaid.json.order._id}`, { status: "shipped" });
      check("admin can't ship an unpaid online order", ship.status === 409, ship.text);
      const adminCancel = await adminPut(`order-status/${unpaid.json.order._id}`, { status: "cancelled" });
      check("admin cancelling an unpaid online order frees stock, marks payment failed",
        adminCancel.status === 200 && adminCancel.json.order.paymentStatus === "failed" && (await stock(case_)) === 7, adminCancel.text);
      await api("POST", `/api/v1/order/cancel-payment/${unpaid.json.order._id}`, null, { token });
      check("popup close after admin cancel doesn't restock twice", (await stock(case_)) === 7);

      const codId = cod.json.order._id;
      const early = await adminPut(`mark-paid/${codId}`);
      check("COD can't be marked paid before delivery", early.status === 409 && /delivered/.test(early.json.message), early.text);
      await adminPut(`order-status/${codId}`, { status: "delivered" });
      const markPaid = await adminPut(`mark-paid/${codId}`);
      check("admin marks delivered COD order paid", markPaid.status === 200 && markPaid.json.order.paymentStatus === "paid" && markPaid.json.order.user?.email === "buyer@x.com", markPaid.text);
      const twice = await adminPut(`mark-paid/${codId}`);
      check("marking paid twice -> 409", twice.status === 409);
      const onlineMark = await adminPut(`mark-paid/${rpOrder._id}`);
      check("online orders can't be marked paid by hand", onlineMark.status === 409);
      const userMark = await api("PUT", `/api/v1/order/mark-paid/${codId}`, null, { token });
      check("non-admin can't mark paid", userMark.status === 401 || userMark.status === 403, String(userMark.status));

      await adminPut(`order-status/${rpOrder._id}`, { status: "cancelled" });
      check("cancelling a paid online order flags a refund", (await orders.findOne({ _id: new ObjectId(rpOrder._id) })).refundRequired === true);

      const mine = await api("GET", "/api/v1/order/my-orders", null, { token });
      check("my orders include payment method and status",
        mine.json.orders.every((o) => o.paymentMethod && o.paymentStatus));
    },
    {
      env: {
        RAZORPAY_KEY_ID: KEY_ID,
        RAZORPAY_KEY_SECRET: KEY_SECRET,
        RAZORPAY_API_URL,
        PAYMENT_HOLD_SECONDS: "3",
        PAYMENT_SWEEP_SECONDS: "1",
      },
    }
  );

  // Without keys, online payment is refused before any stock is touched.
  await withServer(
    async ({ api, db }) => {
      await api("POST", "/api/v1/auth/register", { name: "N", email: "n@x.com", password: "secret1", phone: "1", address: "Addr", answer: "a" });
      const { json } = await api("POST", "/api/v1/auth/login", { email: "n@x.com", password: "secret1" });
      const id = new ObjectId();
      await db.collection("products").insertOne({ _id: id, name: "P", slug: "p", description: "d", price: 500, category: new ObjectId(), quantity: 2 });
      const r = await api("POST", "/api/v1/order/create-order", { shippingAddress: "Addr", paymentMethod: "razorpay", items: [{ product: String(id), quantity: 1 }] }, { token: json.token });
      check("no Razorpay keys -> 503, suggests COD", r.status === 503 && /Cash on Delivery/.test(r.json?.message), r.text);
      check("no stock taken, no order saved",
        (await db.collection("products").findOne({ _id: id })).quantity === 2 && (await db.collection("orders").countDocuments()) === 0);
    },
    { port: 8098 }
  );
} finally {
  razorpay.close();
}
