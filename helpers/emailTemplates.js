// Order emails: HTML (tables and inline styles, which email clients render
// reliably) plus a plain-text version. Every value from the database goes
// through escapeHtml() before it is placed in HTML.
import { BRAND, formatRupees } from "./brand.js";
import { ORDER_STATUS, PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, TRACKING_STEPS, stepIndex, statusLabel } from "./orderStatus.js";
import { shortOrderId } from "./invoice.js";

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
export const storeUrl = (path = "") =>
  `${(process.env.CLIENT_URL || "http://localhost:3000").split(",")[0].trim().replace(/\/$/, "")}${path}`;

const button = (href, text) =>
  `<a href="${escapeHtml(href)}" style="display:inline-block;padding:12px 22px;border-radius:8px;background:${COLORS.primary};color:#ffffff;text-decoration:none;font-weight:600;${FONT}">${escapeHtml(text)}</a>`;

// The shared frame: brand header, a heading, the body, a footer.
const layout = ({ preheader, heading, body }) => `<!doctype html>
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
You're receiving this because you placed an order with us.
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

// The order's progress along TRACKING_STEPS (or "Cancelled"). Reusable by the
// order tracking timeline's emails.
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
  const ordersUrl = storeUrl("/dashboard/user/orders");
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
<p style="margin:0 0 20px;"><strong>Invoice:</strong> ${escapeHtml(order.invoiceNumber)} (attached as a PDF)</p>
<p style="margin:0;">${button(ordersUrl, "View your orders")}</p>`,
    }),
    text: [
      `Thanks for your order, ${firstName}!`,
      "",
      `Order #${ref}`,
      itemsText(order),
      "",
      `Payment: ${paymentLine(order)}${codDue ? ` - please keep ${formatRupees(order.total)} ready on delivery` : ""}`,
      `Delivering to: ${order.shippingAddress}`,
      `Invoice: ${order.invoiceNumber} (attached as a PDF)`,
      "",
      `View your orders: ${ordersUrl}`,
      "",
      `${BRAND.name} - ${BRAND.tagline}`,
    ].join("\n"),
  };
};

// Sent when the admin moves an order to a status with `email: true`.
export const orderStatusEmail = (order, customer, status) => {
  const ref = shortOrderId(order);
  const firstName = String(customer?.name || "there").split(" ")[0];
  const ordersUrl = storeUrl("/dashboard/user/orders");
  const info = ORDER_STATUS[status] || { label: status, message: "" };
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
${refund ? `<p style="margin:0 0 12px;">${escapeHtml(refund)}</p>` : ""}
${itemsTable(order)}
<p style="margin:0 0 20px;"><strong>Delivering to:</strong> ${escapeHtml(order.shippingAddress)}</p>
<p style="margin:0;">${button(ordersUrl, "View your orders")}</p>`,
    }),
    text: [
      `Hi ${firstName}, ${info.message}`,
      "",
      `Order #${ref}: ${info.label}`,
      progressText(status),
      ...(refund ? ["", refund] : []),
      "",
      itemsText(order),
      `Delivering to: ${order.shippingAddress}`,
      "",
      `View your orders: ${ordersUrl}`,
    ].join("\n"),
  };
};
