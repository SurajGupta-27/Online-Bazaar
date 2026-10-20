import mongoose from "mongoose";

// "Notify me when available": one user waiting for one out-of-stock product.
// Used once: deleted when the back-in-stock email for it has been sent.
const restockRequestSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.ObjectId,
      ref: "users",
      required: true,
    },
    product: {
      type: mongoose.ObjectId,
      ref: "Products",
      required: true,
    },
  },
  { timestamps: true }
);

restockRequestSchema.index({ user: 1, product: 1 }, { unique: true });
restockRequestSchema.index({ product: 1 });

export default mongoose.model("RestockRequest", restockRequestSchema);
