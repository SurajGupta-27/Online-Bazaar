// Order emails and invoices. Emails are captured by tests/outbox.mjs (never
// sent) and Razorpay is a local mock, as in payments.test.mjs.
import http from "node:http";
import crypto from "node:crypto";
import { join } from "node:path";
import { withServer, check, ObjectId } from "./harness.mjs";
import { createOutbox, emailEnv, pdfText, attachmentBytes } from "./outbox.mjs";

const KEY_ID = "rzp_test_mockkey";
const KEY_SECRET = "mock_secret_for_tests";
let next = 1;
const razorpay = http.createServer((req, res) => {
  let body = "";
  req.on("data", (d) => (body += d));
  req.on("end", () => {
    const { amount, currency, receipt } = JSON.parse(body || "{}");
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ id: `order_mock${next++}`, amount, currency, receipt, status: "created" }));
  });
});
await new Promise((r) => razorpay.listen(0, "127.0.0.1", r));
const razorpayEnv = {
  RAZORPAY_KEY_ID: KEY_ID,
  RAZORPAY_KEY_SECRET: KEY_SECRET,
  RAZORPAY_API_URL: `http://127.0.0.1:${razorpay.address().port}/v1`,
};
const sign = (orderId, paymentId) =>
  crypto.createHmac("sha256", KEY_SECRET).update(`${orderId}|${paymentId}`).digest("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const year = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" }).format(new Date());

const setup = async (api, db) => {
  const register = async (name, email, extra = {}) => {
    await api("POST", "/api/v1/auth/register", { name, email, password: "secret1", phone: "98765 43210", address: "12 MG Road, Pune", answer: "a", ...extra });
    return (await api("POST", "/api/v1/auth/login", { email, password: "secret1" })).json.token;
  };
  const buyer = await register("Asha Rao", "asha@x.com");
  const other = await register("Ravi", "ravi@x.com");
  const admin = await register("Admin", "admin@x.com");
  await db.collection("users").updateOne({ email: "admin@x.com" }, { $set: { role: 1 } });
  const phone = new ObjectId();
  const pen = new ObjectId();
  await db.collection("products").insertMany([
    { _id: phone, name: "Phone X", slug: "phone-x", description: "d", price: 19599, category: new ObjectId(), quantity: 20 },
    { _id: pen, name: "Pen <b>Bold</b> & Co", slug: "pen", description: "d", price: 49.5, category: new ObjectId(), quantity: 20 },
  ]);
  const place = (token, paymentMethod, items = [{ product: String(phone), quantity: 1 }]) =>
    api("POST", "/api/v1/order/create-order", { shippingAddress: "12 MG Road, Pune", paymentMethod, items }, { token });
  return { buyer, other, admin, phone, pen, place };
};

const outbox = createOutbox();
try {
  await withServer(async ({ api, db, logs }) => {
    const { buyer, other, admin, phone, pen, place } = await setup(api, db);
    const orders = db.collection("orders");

    // --- COD: confirmation with invoice ------------------------------------
    const cod = await place(buyer, "cod", [{ product: String(phone), quantity: 1 }, { product: String(pen), quantity: 2 }]);
    check("COD order placed", cod.status === 201, cod.text);
    const [mail] = await outbox.waitFor(1);
    check("confirmation email sent to the customer", mail?.to?.map((t) => t.address).join() === "asha@x.com", JSON.stringify(mail?.to));
    const ref = cod.json.order._id.slice(-8).toUpperCase();
    check("subject names the order", mail?.subject === `Order #${ref} confirmed - Online Bazaar`, mail?.subject);
    check("from Online Bazaar", /Online Bazaar/.test(JSON.stringify(mail?.from)));
    check("has HTML and a plain-text version", /<html/.test(mail?.html || "") && /Thanks for your order, Asha!/.test(mail?.text || ""));
    const stored = await orders.findOne({ _id: new ObjectId(cod.json.order._id) });
    check("invoice number issued", stored.invoiceNumber === `INV-${year}-000001`, stored.invoiceNumber);
    check("status history starts with placed", stored.statusHistory.length === 1 && stored.statusHistory[0].status === "placed");

    const attachment = mail?.attachments?.[0];
    check("invoice PDF attached", attachment?.filename === `INV-${year}-000001.pdf` && attachment.contentType === "application/pdf", JSON.stringify(attachment && { ...attachment, content: undefined }));
    const pdf = attachment ? attachmentBytes(attachment) : Buffer.alloc(0);
    const text = pdfText(pdf);
    check("attachment is a PDF", pdf.subarray(0, 5).toString() === "%PDF-");
    for (const expected of [
      "Online Bazaar", "INVOICE", `INV-${year}-000001`, `#${ref}`, "Asha Rao", "asha@x.com", "98765 43210",
      "12 MG Road, Pune", "Phone X", "Pen <b>Bold</b> & Co", "Rs. 19,599.00", "Rs. 49.50", "Rs. 99.00",
      "Rs. 19,698.00", "Cash on Delivery - Pending", "Amount due on delivery: Rs. 19,698.00",
    ]) {
      check(`invoice shows "${expected}"`, text.includes(expected));
    }
    check("email escapes data in HTML", mail.html.includes("Pen &lt;b&gt;Bold&lt;/b&gt; &amp; Co") && !mail.html.includes("<b>Bold</b>"));

    // --- Escaping hostile customer data -------------------------------------
    await db.collection("users").updateOne({ email: "ravi@x.com" }, {
      $set: { name: `<script>alert("x")</script> Ravi`, address: `<img src=x onerror=alert(1)>` },
    });
    outbox.clear();
    const hostile = await api("POST", "/api/v1/order/create-order", {
      shippingAddress: `<img src=x onerror=alert(1)> Lane`, paymentMethod: "cod", items: [{ product: String(pen), quantity: 1 }],
    }, { token: other });
    const [xss] = await outbox.waitFor(1);
    check("hostile order placed", hostile.status === 201, hostile.text);
    check("no raw HTML from customer data in the email",
      xss && !/<script|<img/i.test(xss.html) && xss.html.includes("&lt;img src=x onerror=alert(1)&gt; Lane") && xss.html.includes("Hi &lt;script&gt;alert"),
      xss?.html?.match(/Hi [^,]*/)?.[0]);

    // --- Razorpay: email only once the payment is verified -------------------
    outbox.clear();
    const online = await place(buyer, "razorpay");
    check("online order created", online.status === 201, online.text);
    await sleep(300);
    check("no email before payment", outbox.read().length === 0);
    const verify = () => api("POST", "/api/v1/order/verify-payment", {
      orderId: online.json.order._id,
      razorpay_payment_id: "pay_123",
      razorpay_signature: sign(online.json.payment.razorpayOrderId, "pay_123"),
    }, { token: buyer });
    check("payment verified", (await verify()).status === 200);
    const [paidMail] = await outbox.waitFor(1);
    const paidText = paidMail ? pdfText(attachmentBytes(paidMail.attachments[0])) : "";
    check("confirmation after payment, with the next invoice number",
      paidText.includes(`INV-${year}-000003`) && paidText.includes("Online payment (Razorpay) - Paid") && paidText.includes("Payment ID: pay_123"), paidText.slice(0, 300));
    check("verifying again sends nothing more", (await verify()).status === 200 && (await sleep(300), outbox.read().length === 1));

    // An online order closed without paying: cancelled, no email, no invoice.
    outbox.clear();
    const abandoned = await place(buyer, "razorpay");
    await api("POST", `/api/v1/order/cancel-payment/${abandoned.json.order._id}`, null, { token: buyer });
    await sleep(300);
    const abandonedDoc = await orders.findOne({ _id: new ObjectId(abandoned.json.order._id) });
    check("abandoned payment: no email, no invoice number", outbox.read().length === 0 && !abandonedDoc.invoiceNumber);
    check("abandoned payment recorded in the history", abandonedDoc.statusHistory.map((h) => h.status).join() === "placed,cancelled");

    // --- Status emails ------------------------------------------------------
    const status = (id, s) => api("PUT", `/api/v1/order/order-status/${id}`, { status: s }, { token: admin });
    const codId = cod.json.order._id;
    outbox.clear();
    const packed = await status(codId, "packed");
    const [packMail] = await outbox.waitFor(1);
    check("packed -> email", packed.status === 200 && packMail?.subject === `Order #${ref}: Packed - Online Bazaar`, packMail?.subject);
    outbox.clear();
    const shipped = await status(codId, "shipped");
    const [shipMail] = await outbox.waitFor(1);
    check("shipped -> email", shipped.status === 200 && shipMail?.subject === `Order #${ref}: Shipped - Online Bazaar`, shipMail?.subject);
    check("status email shows progress and has a text version",
      /Shipped/.test(shipMail?.html) && /\[x\] Packed/.test(shipMail?.text) && /\[x\] Shipped/.test(shipMail?.text) &&
        /\[ \] Out for delivery/.test(shipMail?.text) && /\[ \] Delivered/.test(shipMail?.text), shipMail?.text);
    const same = await status(codId, "shipped");
    await sleep(300);
    check("setting the same status again: no email", same.status === 200 && outbox.read().length === 1);
    await status(codId, "out_for_delivery");
    const afterOut = await outbox.waitFor(2);
    check("out for delivery -> email", afterOut[1]?.subject === `Order #${ref}: Out for delivery - Online Bazaar`, afterOut[1]?.subject);
    await status(codId, "delivered");
    const afterDelivered = await outbox.waitFor(3);
    check("delivered -> email", afterDelivered[2]?.subject === `Order #${ref}: Delivered - Online Bazaar`, afterDelivered[2]?.subject);
    const history = (await orders.findOne({ _id: new ObjectId(codId) })).statusHistory.map((h) => h.status).join();
    check("history records each change once", history === "placed,packed,shipped,out_for_delivery,delivered", history);

    outbox.clear();
    await status(online.json.order._id, "cancelled");
    const [cancelMail] = await outbox.waitFor(1);
    check("cancelled -> email mentioning the refund",
      /Cancelled/.test(cancelMail?.subject) && /will be refunded/.test(cancelMail?.text), cancelMail?.text);
    await status(online.json.order._id, "cancelled");
    await sleep(300);
    check("cancelling twice sends one email", outbox.read().length === 1);

    // --- Invoice download ---------------------------------------------------
    const invoice = (id, token) => api("GET", `/api/v1/order/invoice/${id}`, null, { token });
    const mine = await invoice(codId, buyer);
    check("customer downloads own invoice", mine.status === 200 && mine.headers.get("content-type") === "application/pdf" &&
      mine.headers.get("content-disposition") === `attachment; filename="INV-${year}-000001.pdf"`, `${mine.status} ${mine.headers.get("content-type")}`);
    check("not cached by shared caches", /no-store/.test(mine.headers.get("cache-control") || ""));
    check("someone else's invoice -> 404", (await invoice(codId, other)).status === 404);
    check("admin downloads any invoice", (await invoice(codId, admin)).status === 200);
    check("logged out -> 401", (await api("GET", `/api/v1/order/invoice/${codId}`)).status === 401);
    check("invalid id -> 404", (await invoice("nope", buyer)).status === 404);
    check("unpaid online order has no invoice (409)", (await invoice(abandoned.json.order._id, buyer)).status === 409);

    // Orders confirmed before invoices existed get a number on first download.
    const buyerId = (await db.collection("users").findOne({ email: "asha@x.com" }))._id;
    const legacy = await orders.insertOne({
      user: buyerId, items: [{ product: phone, name: "Phone X", price: 100, quantity: 1 }], total: 100,
      shippingAddress: "Old address", status: "delivered", paymentMethod: "cod", paymentStatus: "paid", createdAt: new Date("2025-01-05"),
    });
    const legacyPdf = await invoice(legacy.insertedId, buyer);
    const legacyDoc = await orders.findOne({ _id: legacy.insertedId });
    check("legacy order: invoice number issued on download", legacyPdf.status === 200 && legacyDoc.invoiceNumber === `INV-${year}-000004`, legacyDoc.invoiceNumber);
    const again = await invoice(legacy.insertedId, buyer);
    check("and kept on the next download", again.status === 200 && (await orders.findOne({ _id: legacy.insertedId })).invoiceNumber === `INV-${year}-000004`);

    check("no email errors logged", !/Email failed/.test(logs()), logs().match(/Email failed.*/)?.[0]);
  }, { env: { ...emailEnv(outbox), ...razorpayEnv } });

  // --- Email failures never reach the customer --------------------------------
  await withServer(async ({ api, db, logs }) => {
    const { buyer, place } = await setup(api, db);
    const r = await place(buyer, "cod");
    check("order succeeds when sending fails", r.status === 201 && r.json.success === true, r.text);
    check("response says nothing about email", !/email|mail/i.test(r.text));
    await sleep(500);
    check("failure logged on the server", /Email failed \(confirmation for order/.test(logs()), logs().slice(-300));
  }, { port: 8096, env: { ...emailEnv(outbox), EMAIL_OUTBOX: join(outbox.file, "missing-dir", "outbox.jsonl") } });

  // --- Not configured: orders still work, nothing is sent ----------------------
  await withServer(async ({ api, db, logs }) => {
    const { buyer, place } = await setup(api, db);
    const r = await place(buyer, "cod");
    await sleep(500);
    check("order succeeds without email settings", r.status === 201, r.text);
    check("skipped email logged", /Email not configured; skipped "Order #/.test(logs()), logs().slice(-300));
    const id = r.json.order._id;
    const pdf = await api("GET", `/api/v1/order/invoice/${id}`, null, { token: buyer });
    check("invoice still downloadable", pdf.status === 200 && pdf.text.startsWith("%PDF-"));
  }, { port: 8095 });
} finally {
  razorpay.close();
}
