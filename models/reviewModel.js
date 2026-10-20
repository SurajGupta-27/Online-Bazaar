import mongoose from "mongoose";

// A customer's rating and review of a product. Only customers with a
// delivered order containing the product can write one (`verified`), and
// each customer has at most one review per product.
const reviewSchema = new mongoose.Schema(
  {
    product: {
      type: mongoose.ObjectId,
      ref: "Products",
      required: true,
    },
    user: {
      type: mongoose.ObjectId,
      ref: "users",
      required: true,
    },
    rating: {
      type: Number,
      required: true,
      min: 1,
      max: 5,
      validate: Number.isInteger,
    },
    // Plain text (see helpers/plainText.js).
    comment: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    verified: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

reviewSchema.index({ product: 1, user: 1 }, { unique: true });
reviewSchema.index({ product: 1, createdAt: -1 });
reviewSchema.index({ createdAt: -1 });

export default mongoose.model("Review", reviewSchema);
