import mongoose from "mongoose";

// Accounts created with Google have no password, security answer, phone or
// address until the user adds them; every other account needs all four.
function passwordAccount() {
  return !this.googleId;
}

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
      required: passwordAccount,
    },
    phone: {
      type: String,
      required: passwordAccount,
      trim: true,
    },
    address: {
      type: String,
      required: passwordAccount,
      trim: true,
    },
    answer: {
      type: String,
      required: passwordAccount,
      trim: true,
    },
    // Google's account id (the ID token's `sub`), set by Google sign-in.
    googleId: {
      type: String,
      unique: true,
      sparse: true,
    },
    role: {
      type: Number,
      default: 0,
    },
    // Price-drop and back-in-stock emails (helpers/productAlerts.js). Older
    // accounts have no value, which counts as on (alertsOn below).
    alertPrefs: {
      priceDrop: { type: Boolean, default: true },
      backInStock: { type: Boolean, default: true },
    },
  },
  {
    timestamps: true,
    // Never serialize secrets, even if a controller sends a whole user document.
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.answer;
        delete ret.googleId;
        return ret;
      },
    },
  }
);

export default mongoose.model("users", userSchema);
