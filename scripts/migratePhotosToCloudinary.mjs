// Moves product photos stored in MongoDB (the legacy `photo` Buffer) to
// Cloudinary, making each one the product's main image, then removes the
// bytes from MongoDB.
//
//   npm run migrate:photos              dry run: lists what would be moved
//   npm run migrate:photos -- --apply   does it
//
// Safe to re-run: each photo gets a fixed Cloudinary id (legacy-<productId>),
// so a second run reuses the upload, and a product is only changed while it
// still has its MongoDB photo.
import productModel from "../models/productModel.js";
import { ALLOWED_PHOTO_TYPES } from "../middlewares/uploadMiddleware.js";
import { cloudinaryConfigured, uploadImage } from "../helpers/cloudinary.js";
import { APPLY, connect, eachLimit, run } from "./scriptUtils.mjs";

run(async () => {
  if (APPLY && !cloudinaryConfigured()) {
    throw new Error("Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env first");
  }
  await connect();

  const products = await productModel
    .find({ "photo.data": { $exists: true } })
    .select("name photo images");
  console.log(`${products.length} product(s) have a photo stored in MongoDB.`);

  const counts = { migrated: 0, skipped: 0, failed: 0 };
  await eachLimit(products, 3, async (product) => {
    const { contentType, data } = product.photo;
    const label = `"${product.name}" (${product._id})`;
    // Never re-publish something that isn't a real image type (e.g. text/html).
    if (!ALLOWED_PHOTO_TYPES.includes(contentType) || !data?.length) {
      counts.skipped++;
      console.log(`  skip   ${label}: unsupported type ${contentType || "none"}`);
      return;
    }
    if (!APPLY) {
      counts.migrated++;
      console.log(`  would move ${label}: ${contentType}, ${Math.round(data.length / 1024)} KB`);
      return;
    }
    try {
      const image = await uploadImage(data, { contentType, publicId: `legacy-${product._id}` });
      const others = product.images.filter((i) => i.publicId !== image.publicId);
      const result = await productModel.updateOne(
        { _id: product._id, "photo.data": { $exists: true } },
        { $set: { images: [image, ...others] }, $unset: { photo: "" } }
      );
      counts.migrated += result.modifiedCount;
      console.log(`  moved  ${label} -> ${image.url}`);
    } catch (error) {
      counts.failed++;
      console.log(`  FAILED ${label}: ${error.message}`);
    }
  });

  const verb = APPLY ? "Moved" : "Would move";
  console.log(`\n${verb} ${counts.migrated}, skipped ${counts.skipped}, failed ${counts.failed}.`);
  if (counts.failed) process.exitCode = 1;
});
