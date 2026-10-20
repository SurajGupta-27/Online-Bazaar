import mongoose from "mongoose";

// Named sequences (e.g. "invoice-2026"), incremented atomically.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

const counterModel = mongoose.model("Counter", counterSchema);

export const nextSequence = async (name) => {
  const counter = await counterModel.findOneAndUpdate(
    { _id: name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
};

export default counterModel;
