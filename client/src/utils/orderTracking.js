// Order statuses and the tracking timeline. Must match helpers/orderStatus.js
// in the API (TRACKING_STEPS, the labels, and the one-step-forward rule).
export const TRACKING_STEPS = ["placed", "packed", "shipped", "out_for_delivery", "delivered"];

const LABELS = {
  placed: "Order placed",
  processing: "Order placed", // used before tracking existed; counts as placed
  packed: "Packed",
  shipped: "Shipped",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

export const MAX_NOTE_LENGTH = 200;

export const statusLabel = (status) => LABELS[status] || status;

export const stepIndex = (status) =>
  TRACKING_STEPS.indexOf(status === "processing" ? "placed" : status);

// The one status an order can move forward to, or null when delivered/cancelled.
export const nextStatus = (status) => {
  const index = stepIndex(status);
  return index >= 0 ? TRACKING_STEPS[index + 1] || null : null;
};

export const cancellable = (status) => status !== "delivered" && status !== "cancelled";

// The latest history entry for a status (old orders may have no history).
const lastEntry = (history, status) => [...history].reverse().find((h) => h.status === status);

// The rows of an order's timeline, oldest first:
// { status, label, state: "done" | "current" | "upcoming" | "cancelled", at, note }.
// A cancelled order shows the steps it reached, then "Cancelled".
export const timelineSteps = (order) => {
  const history = order.statusHistory || [];
  const entryFor = (status) =>
    lastEntry(history, status) ||
    (status === "placed" && (lastEntry(history, "processing") || { at: order.createdAt })) ||
    null;
  const row = (status, state) => {
    const entry = state === "upcoming" ? null : entryFor(status);
    return { status, label: statusLabel(status), state, at: entry?.at || null, note: entry?.note || "" };
  };

  if (order.status === "cancelled") {
    const reached = TRACKING_STEPS.filter((s) => s === "placed" || lastEntry(history, s));
    return [...reached.map((s) => row(s, "done")), row("cancelled", "cancelled")];
  }
  const current = Math.max(0, stepIndex(order.status));
  return TRACKING_STEPS.map((s, i) => row(s, i < current ? "done" : i === current ? "current" : "upcoming"));
};

const DATE = { day: "numeric", month: "short", year: "numeric" };

// "Tue, 20 Oct"
export const formatDay = (value) =>
  new Date(value).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });

// "20 Oct 2026, 2:05 pm"
export const formatDateTime = (value) =>
  `${new Date(value).toLocaleDateString("en-IN", DATE).replace(",", "")}, ${new Date(value)
    .toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
    .toLowerCase()}`;

// A short line about delivery for lists and the order page.
export const deliveryLine = (order) => {
  if (order.status === "cancelled") return "";
  if (order.status === "delivered") {
    const at = lastEntry(order.statusHistory || [], "delivered")?.at;
    return at ? `Delivered on ${formatDay(at)}` : "Delivered";
  }
  return order.estimatedDelivery ? `Arriving by ${formatDay(order.estimatedDelivery)}` : "";
};
