import React from "react";

const METHOD_LABELS = { cod: "Cash on Delivery", razorpay: "Online (Razorpay)" };

const statusBadge = (order) => {
  if (order.paymentStatus === "paid") return ["Paid", "text-bg-success"];
  if (order.paymentStatus === "failed") return ["Payment failed", "text-bg-danger"];
  return order.paymentMethod === "razorpay"
    ? ["Awaiting payment", "text-bg-warning"]
    : ["Payment pending", "text-bg-warning"];
};

// Payment method, status and Razorpay payment id for one order. Orders saved
// before payments existed have no method and count as Cash on Delivery.
const PaymentInfo = ({ order }) => {
  const method = order.paymentMethod || "cod";
  const [label, badgeClass] = statusBadge({ ...order, paymentMethod: method });
  return (
    <p className="mb-1 d-flex flex-wrap align-items-center gap-2">
      <span>Payment: {METHOD_LABELS[method]}</span>
      <span className={`badge ${badgeClass}`}>{label}</span>
      {order.refundRequired && <span className="badge text-bg-dark">Refund due</span>}
      {order.razorpayPaymentId && (
        <small className="text-muted">ID: {order.razorpayPaymentId}</small>
      )}
    </p>
  );
};

export default PaymentInfo;
