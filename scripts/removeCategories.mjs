// Removes whole categories: their products, the products' Cloudinary images,
// then the categories themselves.
//
//   npm run remove:categories -- --category Vehicle --category Motorcycle
//                                          dry run: lists what would be removed
//   add --apply to remove them
//
// Category names match exactly, ignoring case. A product that appears in an
// order is kept (order history points at it), and so is its category. Safe to
// re-run: a product is only deleted after its images are, so a failed image
// delete leaves the product in place for the next run to retry.
import productModel from "../models/productModel.js";
import categoryModel from "../models/categoryModel.js";
import orderModel from "../models/orderModel.js";
import { escapeRegex } from "../helpers/escapeRegex.js";
import { cloudinaryConfigured, deleteImage } from "../helpers/cloudinary.js";
import { APPLY, args, connect, eachLimit, run } from "./scriptUtils.mjs";

const names = args.flatMap((arg, i) => (args[i - 1] === "--category" ? [arg] : []));

run(async () => {
  if (!names.length) throw new Error('Name at least one category: --category "Vehicle"');
  if (APPLY && !cloudinaryConfigured()) {
    throw new Error("Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env first");
  }
  await connect();

  const counts = { products: 0, images: 0, categories: 0, kept: 0, failed: 0 };
  for (const name of names) {
    const category = await categoryModel.findOne({
      name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
    });
    if (!category) {
      console.log(`no category named "${name}"`);
      continue;
    }

    const products = await productModel.find({ category: category._id }).select("name images");
    const ordered = new Set(
      (await orderModel.distinct("items.product", { "items.product": { $in: products.map((p) => p._id) } }))
        .map(String)
    );
    console.log(`Category "${category.name}" (${category._id}): ${products.length} product(s)`);

    let left = 0;
    await eachLimit(products, 3, async (product) => {
      const publicIds = (product.images || []).map((image) => image.publicId).filter(Boolean);
      const label = `"${product.name}" (${product._id}), ${publicIds.length} image(s)`;
      if (ordered.has(String(product._id))) {
        console.log(`  keep   ${label}: it appears in an order`);
        counts.kept++;
        left++;
        return;
      }
      if (!APPLY) {
        console.log(`  would delete ${label}`);
        counts.products++;
        counts.images += publicIds.length;
        return;
      }
      try {
        for (const publicId of publicIds) await deleteImage(publicId);
        await productModel.deleteOne({ _id: product._id });
        console.log(`  deleted ${label}`);
        counts.products++;
        counts.images += publicIds.length;
      } catch (error) {
        console.log(`  FAILED ${label}: ${error.message}`);
        counts.failed++;
        left++;
      }
    });

    if (left) {
      console.log(`  keep category "${category.name}": ${left} product(s) remain`);
    } else {
      if (APPLY) await categoryModel.deleteOne({ _id: category._id });
      console.log(`  ${APPLY ? "deleted" : "would delete"} category "${category.name}"`);
      counts.categories++;
    }
  }

  const verb = APPLY ? "Deleted" : "Would delete";
  console.log(
    `\n${verb} ${counts.products} product(s), ${counts.images} image(s), ${counts.categories} categor${counts.categories === 1 ? "y" : "ies"}; kept ${counts.kept} (in orders), failed ${counts.failed}.`
  );
});
