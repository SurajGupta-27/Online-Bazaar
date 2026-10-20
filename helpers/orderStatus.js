// What each order status means to the customer. Emails, invoices and the
// order tracking timeline all read this. To add a stage, add it to the order
// model's status enum, here, and to TRACKING_STEPS (and the client's copy in
// client/src/utils/orderTracking.js).
//
// `daysToDeliver` is how many days after reaching that status the order is
// expected to arrive; `email: true` means the customer is emailed on it.
export const ORDER_STATUS = {
  placed: {
    label: "Order placed",
    message: "We've received your order.",
    daysToDeliver: 5,
  },
  // Used before the tracking timeline existed. Old orders may still have it;
  // it counts as "placed" and the admin can't choose it any more.
  processing: {
    label: "Processing",
    message: "We're getting your order ready.",
    daysToDeliver: 5,
    legacy: true,
  },
  packed: {
    label: "Packed",
    message: "Your order has been packed and will be handed to the courier soon.",
    daysToDeliver: 4,
    email: true,
  },
  shipped: {
    label: "Shipped",
    message: "Your order is on its way.",
    daysToDeliver: 2,
    email: true,
  },
  out_for_delivery: {
    label: "Out for delivery",
    message: "Your order is out for delivery and should reach you today.",
    daysToDeliver: 0,
    email: true,
  },
  delivered: {
    label: "Delivered",
    message: "Your order has been delivered. We hope you enjoy it!",
    email: true,
  },
  cancelled: {
    label: "Cancelled",
    message: "Your order has been cancelled.",
    email: true,
  },
};

// The happy path, in order, for progress displays.
export const TRACKING_STEPS = ["placed", "packed", "shipped", "out_for_delivery", "delivered"];

// The statuses an admin may set: the next step, or cancelled.
export const ADMIN_STATUSES = [...TRACKING_STEPS, "cancelled"];

export const statusLabel = (status) => ORDER_STATUS[status]?.label || status;

// Should the customer be emailed when an order moves to this status?
export const emailsOnStatus = (status) => Boolean(ORDER_STATUS[status]?.email);

// Where a status sits on TRACKING_STEPS (legacy "processing" = "placed"); -1
// for cancelled or unknown statuses.
export const stepIndex = (status) =>
  TRACKING_STEPS.indexOf(status === "processing" ? "placed" : status);

// The one status an order may move forward to, or null once it's delivered
// or cancelled. Orders only move forward, one step at a time.
export const nextStatus = (status) => {
  const index = stepIndex(status);
  return index >= 0 ? TRACKING_STEPS[index + 1] || null : null;
};

// The statuses from which `status` is the next step.
export const previousStatuses = (status) =>
  Object.keys(ORDER_STATUS).filter((s) => nextStatus(s) === status);

// Delivered orders can't be cancelled (that would be a return), nor can
// cancelled ones again.
export const cancellable = (status) => status !== "delivered" && status !== "cancelled";

// The longest tracking note an admin can add (courier name and tracking number).
export const MAX_NOTE_LENGTH = 200;

// A status-history entry, appended whenever an order's status changes.
export const historyEntry = (status, at = new Date(), note) => ({
  status,
  at,
  ...(note && { note }),
});

const DAY_MS = 24 * 60 * 60 * 1000;

// When the order should arrive: the time it reached its current status plus
// that status's daysToDeliver, never earlier than now (a late order is still
// "expected today", not in the past). Null once delivered or cancelled.
export const estimatedDelivery = (order, now = new Date()) => {
  const days = ORDER_STATUS[order.status]?.daysToDeliver;
  if (days === undefined) return null;
  const reached = [...(order.statusHistory || [])].reverse().find((h) => h.status === order.status);
  const since = new Date(reached?.at || order.createdAt || now);
  return new Date(Math.max(since.getTime() + days * DAY_MS, now.getTime()));
};

export const PAYMENT_METHOD_LABEL = {
  cod: "Cash on Delivery",
  razorpay: "Online payment (Razorpay)",
};

export const PAYMENT_STATUS_LABEL = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
};
