import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password: {
      type: String,
      required: true,
    },
    phone: {
      type: String,
      required: true,
    },
    address: {
      type: String,
      required: true,
    },
    answer: {
      type: String,
      required: true,
      trim: true,
    },
    role: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    // Never serialize secrets, even if a controller sends a whole user document.
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.answer;
        return ret;
      },
    },
  }
);

export default mongoose.model("users", userSchema);