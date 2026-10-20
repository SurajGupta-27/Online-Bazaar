// What each order status means to the customer. Emails and invoices read
// this, and so will the order tracking timeline (Roadmap step 4): to add a
// stage such as "packed" or "out for delivery", add it to the order model's
// status enum, here, and to TRACKING_STEPS.
export const ORDER_STATUS = {
  placed: {
    label: "Order placed",
    message: "We've received your order.",
  },
  processing: {
    label: "Processing",
    message: "We're getting your order ready.",
  },
  shipped: {
    label: "Shipped",
    message: "Your order is on its way.",
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
export const TRACKING_STEPS = ["placed", "processing", "shipped", "delivered"];

export const statusLabel = (status) => ORDER_STATUS[status]?.label || status;

// Should the customer be emailed when an order moves to this status?
export const emailsOnStatus = (status) => Boolean(ORDER_STATUS[status]?.email);

// A status-history entry, appended whenever an order's status changes.
export const historyEntry = (status, at = new Date()) => ({ status, at });

export const PAYMENT_METHOD_LABEL = {
  cod: "Cash on Delivery",
  razorpay: "Online payment (Razorpay)",
};

export const PAYMENT_STATUS_LABEL = {
  pending: "Pending",
  paid: "Paid",
  failed: "Failed",
};
