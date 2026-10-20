import mongoose from "mongoose";

// One product on one user's wishlist. Kept as its own collection, indexed by
// product, so price-drop and back-in-stock alerts can find everyone watching
// a product; `priceWhenAdded` is the price they saw (createdAt: when).
const wishlistItemSchema = new mongoose.Schema(
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
    priceWhenAdded: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

wishlistItemSchema.index({ user: 1, product: 1 }, { unique: true });
wishlistItemSchema.index({ product: 1 });

export default mongoose.model("WishlistItem", wishlistItemSchema);
