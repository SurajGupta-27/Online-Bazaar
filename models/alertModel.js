import mongoose from "mongoose";

// One price-drop or back-in-stock email to one user about one product
// (helpers/productAlerts.js). Queued as "pending" when the product changes,
// then sent in small batches; what the email says is decided at send time.
const alertSchema = new mongoose.Schema(
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
    kind: {
      type: String,
      enum: ["price_drop", "back_in_stock"],
      required: true,
    },
    // pending -> sending -> sent, or skipped (no longer true, or turned off),
    // or failed (after MAX_ATTEMPTS, or interrupted mid-send).
    status: {
      type: String,
      enum: ["pending", "sending", "sent", "skipped", "failed"],
      default: "pending",
    },
    // The change that queued it (price drops only).
    oldPrice: Number,
    newPrice: Number,
    // Not before this time: retries back off, and the one-a-day limit waits.
    sendAfter: {
      type: Date,
      default: Date.now,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    sentAt: Date,
    // Why it was skipped, or the last send error.
    note: String,
    // Set once it's sent, skipped or failed; the record is deleted 90 days later.
    finishedAt: Date,
  },
  { timestamps: true }
);

// At most one waiting alert of each kind per user and product: a newer change
// updates it instead of queueing another email.
alertSchema.index(
  { user: 1, product: 1, kind: 1 },
  { unique: true, partialFilterExpression: { status: "pending" } }
);
alertSchema.index({ status: 1, sendAfter: 1 });
alertSchema.index({ user: 1, product: 1, sentAt: -1 });
alertSchema.index({ finishedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export default mongoose.model("Alert", alertSchema);
