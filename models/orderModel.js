import mongoose from "mongoose";

const orderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.ObjectId,
      ref: "users",
      required: true,
    },
    items: [
      {
        product: {
          type: mongoose.ObjectId,
          ref: "Products",
          required: true,
        },
        name: { type: String, required: true },
        price: { type: Number, required: true },
        quantity: { type: Number, required: true, min: 1 },
      },
    ],
    total: { type: Number, required: true, min: 0 },
    shippingAddress: { type: String, required: true },
    status: {
      type: String,
      enum: ["placed", "processing", "shipped", "delivered", "cancelled"],
      default: "placed",
    },
    paymentMethod: { type: String, enum: ["cod", "razorpay"], default: "cod" },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "failed"],
      default: "pending",
    },
    razorpayOrderId: String,
    razorpayPaymentId: String,
    paidAt: Date,
    // Online orders hold their stock until this time; unpaid holds are then released.
    holdExpiresAt: Date,
    // Set in the same update that returns the items to stock, so it happens once.
    stockReleased: { type: Boolean, default: false },
    // A payment that arrived after the order was cancelled; refund it in Razorpay.
    refundRequired: { type: Boolean, default: false },
    // Every status the order has had, oldest first (helpers/orderStatus.js).
    statusHistory: {
      type: [{ _id: false, status: String, at: Date }],
      default: [],
    },
    // Issued once the order is confirmed (COD placed, or paid online):
    // "INV-2026-000001", numbered per calendar year.
    invoiceNumber: { type: String, unique: true, sparse: true },
    invoicedAt: Date,
  },
  { timestamps: true }
);

orderSchema.index({ paymentMethod: 1, paymentStatus: 1, holdExpiresAt: 1 });

export default mongoose.model("Order", orderSchema);
