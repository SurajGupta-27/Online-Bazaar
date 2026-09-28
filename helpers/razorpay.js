import crypto from "node:crypto";

// Talks to Razorpay's REST API directly (no SDK). RAZORPAY_API_URL exists only
// so tests can point this at a local mock; it defaults to the real API.
// Keys are read on each call, and the secret never leaves the server.
const apiUrl = () => process.env.RAZORPAY_API_URL || "https://api.razorpay.com/v1";

export const razorpayConfigured = () =>
  Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);

export const razorpayKeyId = () => process.env.RAZORPAY_KEY_ID;

// Rupees -> paise, the unit Razorpay amounts are in.
export const toPaise = (rupees) => Math.round(rupees * 100);

export const createRazorpayOrder = async ({ amount, receipt, notes }) => {
  const auth = Buffer.from(
    `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`
  ).toString("base64");
  const res = await fetch(`${apiUrl()}/orders`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Basic ${auth}` },
    body: JSON.stringify({ amount, currency: "INR", receipt, notes }),
    signal: AbortSignal.timeout(10000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.id) {
    throw new Error(
      `Razorpay order creation failed (${res.status}): ${body.error?.description || "no details"}`
    );
  }
  return body;
};

// Checkout returns razorpay_signature = HMAC-SHA256(order_id|payment_id, secret).
export const isValidPaymentSignature = (razorpayOrderId, paymentId, signature) => {
  if (typeof paymentId !== "string" || typeof signature !== "string") return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
