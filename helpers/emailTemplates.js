// Order emails: HTML (tables and inline styles, which email clients render
// reliably) plus a plain-text version. Every value from the database goes
// through escapeHtml() before it is placed in HTML.
import { BRAND, formatRupees } from "./brand.js";
import {
  ORDER_STATUS,
  PAYMENT_METHOD_LABEL,
  PAYMENT_STATUS_LABEL,
  TRACKING_STEPS,
  estimatedDelivery,
  stepIndex,
  statusLabel,
} from "./orderStatus.js";
import { shortOrderId } from "./invoice.js";
import { clientOrigins } from "./clientUrl.js";

export const escapeHtml = (value) =>
  String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

const COLORS = { primary: "#1e3a8a", ink: "#0f172a", muted: "#64748b", border: "#e2e8f0", bg: "#f6f7fb", success: "#15803d", danger: "#dc2626" };
const FONT = "font-family:'DM Sans',Segoe UI,Helvetica,Arial,sans-serif;";

// The store's address for links in emails: the first CLIENT_URL origin.
export const storeUrl = (path = "") => `${clientOrigins()[0]}${path}`;

// The customer's order details page, with the tracking timeline.
export const orderUrl = (order) => storeUrl(`/dashboard/user/orders/${order._id}`);

// "Fri, 24 Oct 2026", in India time.
const formatDay = (date) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-IN", {
      timeZone: "Asia/Kolkata",
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    })
      .formatToParts(new Date(date))
      .map(({ type, value }) => [type, value])
  );
  return `${parts.weekday}, ${parts.day} ${parts.month} ${parts.year}`;
};

// "Expected by Fri, 24 Oct 2026", or "" once delivered or cancelled.
const expectedLine = (order) => {
  const date = estimatedDelivery(order);
  return date ? `Expected by ${formatDay(date)}` : "";
};

const button = (href, text) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;${FONT}">${escapeHtml(text)}</a>`;

// The shared frame: brand header, a heading, the body, a footer. `footer` is
// HTML (already escaped) saying why the customer is getting this email.
const ORDER_FOOTER = "You're receiving this because you placed an order with us.";
const layout = ({ preheader, heading, body, footer = ORDER_FOOTER }) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${COLORS.bg};">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLORS.bg};padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${COLORS.border};border-radius:12px;">
<tr><td style="padding:20px 28px;border-bottom:1px solid ${COLORS.border};${FONT}">
<span style="font-size:20px;font-weight:800;color:${COLORS.primary};">${escapeHtml(BRAND.name)}</span>
</td></tr>
<tr><td style="padding:28px;${FONT}color:${COLORS.ink};font-size:15px;line-height:1.55;">
<h1 style="margin:0 0 12px;font-size:22px;line-height:1.3;color:${COLORS.ink};">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:18px 28px;border-top:1px solid ${COLORS.border};${FONT}color:${COLORS.muted};font-size:12px;">
${escapeHtml(BRAND.name)} &middot; ${escapeHtml(BRAND.tagline)}<br>
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body></html>`;

const itemsTable = (order) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;${FONT}font-size:14px;">
<tr>
<th align="left" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.muted};font-weight:600;">Item</th>
<th align="right" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.muted};font-weight:600;">Qty</th>
<th align="right" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};color:${COLORS.muted};font-weight:600;">Amount</th>
</tr>
${order.items
  .map(
    (item) => `<tr>
<td style="padding:8px 8px 8px 0;border-bottom:1px solid ${COLORS.border};">${escapeHtml(item.name)}</td>
<td align="right" style="padding:8px 0;border-bottom:1px solid ${COLORS.border};">${escapeHtml(item.quantity)}</td>
<td align="right" style="padding:8px 0 8px 8px;border-bottom:1px solid ${COLORS.border};white-space:nowrap;">${escapeHtml(formatRupees(item.price * item.quantity))}</td>
</tr>`
  )
  .join("")}
<tr>
<td colspan="2" align="right" style="padding:10px 0;font-weight:700;">Total</td>
<td align="right" style="padding:10px 0 10px 8px;font-weight:700;white-space:nowrap;">${escapeHtml(formatRupees(order.total))}</td>
</tr>
</table>`;

const itemsText = (order) =>
  [
    ...order.items.map((item) => `- ${item.name} x ${item.quantity}: ${formatRupees(item.price * item.quantity)}`),
    `Total: ${formatRupees(order.total)}`,
  ].join("\n");

const paymentLine = (order) =>
  `${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod} (${PAYMENT_STATUS_LABEL[order.paymentStatus] || order.paymentStatus})`;

// The order's progress along TRACKING_STEPS (or "Cancelled") for status emails.
export const progressHtml = (status) => {
  if (status === "cancelled") {
    return `<p style="margin:16px 0;padding:10px 14px;border-radius:8px;background:#fef2f2;color:${COLORS.danger};font-weight:600;">${escapeHtml(statusLabel("cancelled"))}</p>`;
  }
  const reached = stepIndex(status);
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;${FONT}font-size:12px;"><tr>${TRACKING_STEPS.map((step, i) => {
    const done = i <= reached;
    return `<td align="center" style="padding:6px 2px;">
<div style="height:6px;border-radius:3px;background:${done ? COLORS.success : COLORS.border};"></div>
<div style="padding-top:6px;color:${done ? COLORS.ink : COLORS.muted};font-weight:${i === reached ? 700 : 400};">${escapeHtml(statusLabel(step))}</div>
</td>`;
  }).join("")}</tr></table>`;
};

export const progressText = (status) =>
  status === "cancelled"
    ? "Status: Cancelled"
    : TRACKING_STEPS.map((step, i) => `${i <= stepIndex(status) ? "[x]" : "[ ]"} ${statusLabel(step)}`).join("  ");

// Sent when an order is confirmed (COD placed, or paid online), with the
// invoice PDF attached.
export const orderConfirmationEmail = (order, customer) => {
  const ref = shortOrderId(order);
  const firstName = String(customer?.name || "there").split(" ")[0];
  const trackUrl = orderUrl(order);
  const expected = expectedLine(order);
  const codDue = order.paymentMethod === "cod" && order.paymentStatus !== "paid";
  return {
    subject: `Order #${ref} confirmed - ${BRAND.name}`,
    html: layout({
      preheader: `Thanks for your order. Your invoice ${order.invoiceNumber} is attached.`,
      heading: "Thanks for your order!",
      body: `
<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)}, we've received your order <strong>#${escapeHtml(ref)}</strong> and are getting it ready.</p>
${itemsTable(order)}
<p style="margin:0 0 6px;"><strong>Payment:</strong> ${escapeHtml(paymentLine(order))}${codDue ? ` &middot; please keep ${escapeHtml(formatRupees(order.total))} ready on delivery` : ""}</p>
<p style="margin:0 0 6px;"><strong>Delivering to:</strong> ${escapeHtml(order.shippingAddress)}</p>
${expected ? `<p style="margin:0 0 6px;"><strong>Delivery:</strong> ${escapeHtml(expected)}</p>` : ""}
<p style="margin:0 0 20px;"><strong>Invoice:</strong> ${escapeHtml(order.invoiceNumber)} (attached as a PDF)</p>
<p style="margin:0;">${button(trackUrl, "Track your order")}</p>`,
    }),
    text: [
      `Thanks for your order, ${firstName}!`,
      "",
      `Order #${ref}`,
      itemsText(order),
      "",
      `Payment: ${paymentLine(order)}${codDue ? ` - please keep ${formatRupees(order.total)} ready on delivery` : ""}`,
      `Delivering to: ${order.shippingAddress}`,
      ...(expected ? [`Delivery: ${expected}`] : []),
      `Invoice: ${order.invoiceNumber} (attached as a PDF)`,
      "",
      `Track your order: ${trackUrl}`,
      "",
      `${BRAND.name} - ${BRAND.tagline}`,
    ].join("\n"),
  };
};

// Sent when the admin moves an order to a status with `email: true`.
export const orderStatusEmail = (order, customer, status) => {
  const ref = shortOrderId(order);
  const firstName = String(customer?.name || "there").split(" ")[0];
  const trackUrl = orderUrl(order);
  const info = ORDER_STATUS[status] || { label: status, message: "" };
  // The admin's note on this step, e.g. the courier and tracking number.
  const note = [...(order.statusHistory || [])].reverse().find((h) => h.status === status)?.note || "";
  const expected = order.status === status ? expectedLine(order) : "";
  const refund =
    status === "cancelled" && order.paymentMethod === "razorpay" && order.paymentStatus === "paid"
      ? "Your online payment will be refunded to the original payment method."
      : "";
  return {
    subject: `Order #${ref}: ${info.label} - ${BRAND.name}`,
    html: layout({
      preheader: `${info.label}: ${info.message}`,
      heading: `${info.label}: order #${ref}`,
      body: `
<p style="margin:0 0 12px;">Hi ${escapeHtml(firstName)}, ${escapeHtml(info.message)}</p>
${progressHtml(status)}
${note ? `<p style="margin:0 0 12px;padding:10px 14px;border-radius:8px;background:${COLORS.bg};"><strong>${status === "cancelled" ? "Reason" : "Tracking details"}:</strong> ${escapeHtml(note)}</p>` : ""}
${expected ? `<p style="margin:0 0 12px;"><strong>${escapeHtml(expected)}</strong></p>` : ""}
${refund ? `<p style="margin:0 0 12px;">${escapeHtml(refund)}</p>` : ""}
${itemsTable(order)}
<p style="margin:0 0 20px;"><strong>Delivering to:</strong> ${escapeHtml(order.shippingAddress)}</p>
<p style="margin:0;">${button(trackUrl, "Track your order")}</p>`,
    }),
    text: [
      `Hi ${firstName}, ${info.message}`,
      "",
      `Order #${ref}: ${info.label}`,
      progressText(status),
      ...(note ? [`${status === "cancelled" ? "Reason" : "Tracking details"}: ${note}`] : []),
      ...(expected ? [expected] : []),
      ...(refund ? ["", refund] : []),
      "",
      itemsText(order),
      `Delivering to: ${order.shippingAddress}`,
      "",
      `Track your order: ${trackUrl}`,
    ].join("\n"),
  };
};

// --- Price-drop and back-in-stock alerts (helpers/productAlerts.js) ---------

export const productUrl = (product) => storeUrl(`/product/${encodeURIComponent(product.slug)}`);

// The main Cloudinary image, resized and as JPEG (which every email client
// shows), or null for products without one.
const emailImage = (product) => {
  const url = product.images?.[0]?.url;
  return url ? url.replace("/image/upload/", "/image/upload/c_limit,w_240,q_auto,f_jpg/") : null;
};

const productBlock = (product, details) => {
  const image = emailImage(product);
  return `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border:1px solid ${COLORS.border};border-radius:10px;${FONT}">
<tr>
${image ? `<td width="120" style="padding:14px;"><img src="${escapeHtml(image)}" alt="" width="120" style="display:block;max-width:120px;height:auto;border-radius:8px;"></td>` : ""}
<td style="padding:14px;vertical-align:top;">
<div style="font-weight:700;font-size:16px;margin-bottom:6px;">${escapeHtml(product.name)}</div>
${details}
</td>
</tr>
</table>`;
};

// Why they got it, and the links to stop it: one click for this kind, or the
// profile page for both.
const alertFooter = (reason, unsubscribeUrl, label) =>
  `You're receiving this because ${escapeHtml(reason)}.<br>
<a href="${escapeHtml(unsubscribeUrl)}" style="color:${COLORS.muted};">Unsubscribe from ${escapeHtml(label)}</a> &middot;
<a href="${escapeHtml(storeUrl("/dashboard/user/profile"))}" style="color:${COLORS.muted};">Manage email alerts</a>`;

const alertFooterText = (reason, unsubscribeUrl, label) =>
  [`You're receiving this because ${reason}.`, `Unsubscribe from ${label}: ${unsubscribeUrl}`, `Manage email alerts: ${storeUrl("/dashboard/user/profile")}`].join("\n");

const firstNameOf = (customer) => String(customer?.name || "there").split(" ")[0];

// A wishlist product is cheaper than when the customer saved it.
export const priceDropEmail = (customer, product, { oldPrice, newPrice, unsubscribeUrl }) => {
  const saving = Math.round((oldPrice - newPrice) * 100) / 100;
  const percent = Math.floor((saving / oldPrice) * 100);
  const savingText = `You save ${formatRupees(saving)}${percent >= 1 ? ` (${percent}%)` : ""}`;
  const soldOut = !(product.quantity > 0);
  const reason = "this product is on your wishlist";
  const label = "price-drop alerts";
  const url = productUrl(product);
  return {
    subject: `Price drop: ${product.name} is now ${formatRupees(newPrice)} - ${BRAND.name}`,
    html: layout({
      preheader: `Now ${formatRupees(newPrice)}, down from ${formatRupees(oldPrice)}. ${savingText}.`,
      heading: "A wishlist item just got cheaper",
      body: `
<p style="margin:0 0 12px;">Hi ${escapeHtml(firstNameOf(customer))}, good news: the price of something on your wishlist has dropped.</p>
${productBlock(
  product,
  `<div style="color:${COLORS.muted};">Was <span style="text-decoration:line-through;">${escapeHtml(formatRupees(oldPrice))}</span> when you saved it</div>
<div style="font-size:20px;font-weight:800;margin:4px 0;">Now ${escapeHtml(formatRupees(newPrice))}</div>
<div style="color:${COLORS.success};font-weight:700;">${escapeHtml(savingText)}</div>
${soldOut ? `<div style="color:${COLORS.danger};margin-top:6px;">Currently out of stock</div>` : ""}`
)}
<p style="margin:0;">${button(url, "View product")}</p>`,
      footer: alertFooter(reason, unsubscribeUrl, label),
    }),
    text: [
      `Hi ${firstNameOf(customer)}, the price of something on your wishlist has dropped.`,
      "",
      product.name,
      `Was: ${formatRupees(oldPrice)} (when you saved it)`,
      `Now: ${formatRupees(newPrice)}`,
      savingText,
      ...(soldOut ? ["Currently out of stock"] : []),
      "",
      `View product: ${url}`,
      "",
      alertFooterText(reason, unsubscribeUrl, label),
    ].join("\n"),
  };
};

// A product the customer asked about (or has on their wishlist) is back in stock.
export const backInStockEmail = (customer, product, { requested, unsubscribeUrl }) => {
  const reason = requested
    ? "you asked us to tell you when this product is back in stock"
    : "this product is on your wishlist";
  const label = "back-in-stock alerts";
  const url = productUrl(product);
  return {
    subject: `Back in stock: ${product.name} - ${BRAND.name}`,
    html: layout({
      preheader: `${product.name} is available again at ${formatRupees(product.price)}.`,
      heading: "It's back in stock",
      body: `
<p style="margin:0 0 12px;">Hi ${escapeHtml(firstNameOf(customer))}, ${escapeHtml(requested ? "the product you were waiting for" : "a product on your wishlist")} is available again. Popular items can sell out quickly.</p>
${productBlock(
  product,
  `<div style="font-size:20px;font-weight:800;margin:4px 0;">${escapeHtml(formatRupees(product.price))}</div>
<div style="color:${COLORS.success};font-weight:700;">In stock</div>`
)}
<p style="margin:0;">${button(url, "Buy now")}</p>`,
      footer: alertFooter(reason, unsubscribeUrl, label),
    }),
    text: [
      `Hi ${firstNameOf(customer)}, ${requested ? "the product you were waiting for" : "a product on your wishlist"} is back in stock.`,
      "",
      product.name,
      `Price: ${formatRupees(product.price)}`,
      "",
      `Buy now: ${url}`,
      "",
      alertFooterText(reason, unsubscribeUrl, label),
    ].join("\n"),
  };
};
