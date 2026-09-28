import mongoose from "mongoose";

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
    },
    slug: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: true,
    },
    price: {
      type: Number,
      required: true,
    },
    category: {
      type: mongoose.ObjectId,
      ref: "Category",
      required: true,
    },
    quantity: {
      type: Number,
      required: true,
    },
    // Cloudinary images; the first one is the main image.
    images: {
      type: [
        {
          _id: false,
          url: { type: String, required: true },
          publicId: { type: String, required: true },
        },
      ],
      default: [],
    },
    // Legacy: photos uploaded before Cloudinary, stored in MongoDB. Moved to
    // `images` by scripts/migratePhotosToCloudinary.mjs.
    photo: {
      data: Buffer,
      contentType: String,
    },
    shipping: {
      type: Boolean,
    },
    // Where an imported product came from, e.g. "dummyjson:12", so imports
    // never create duplicates. Products added by an admin have none.
    externalId: {
      type: String,
      index: { unique: true, sparse: true },
    },
  },
  {
    timestamps: true,
    // Legacy photo bytes are served only by GET /product-photo/:pid, never inside JSON.
    toJSON: {
      transform: (doc, ret) => {
        delete ret.photo;
        return ret;
      },
    },
  }
);

export default mongoose.model("Products", productSchema);