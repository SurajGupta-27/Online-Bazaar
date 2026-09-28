// Imports the DummyJSON product catalogue (https://dummyjson.com/products)
// into the store, skipping groceries.
//
//   npm run seed:dummyjson                         dry run: shows what would be imported
//   npm run seed:dummyjson -- --apply              imports
//   options: --limit 10   only the first 10 products
//            --rate 85    rupees per US dollar (default USD_TO_INR or 85)
//            --images 4   at most this many images per product (default 4)
//
// Safe to re-run: products are matched by externalId ("dummyjson:<id>") and
// skipped if already imported, categories are matched by name, and images
// get fixed Cloudinary ids so a retried upload reuses the earlier one.
import slugify from "slugify";
import productModel from "../models/productModel.js";
import categoryModel from "../models/categoryModel.js";
import { escapeRegex } from "../helpers/escapeRegex.js";
import { cloudinaryConfigured, uploadImage } from "../helpers/cloudinary.js";
import { APPLY, connect, eachLimit, numberArg, run } from "./scriptUtils.mjs";

const SOURCE = process.env.DUMMYJSON_URL || "https://dummyjson.com";
const SKIP_CATEGORIES = new Set(["groceries"]);
const RATE = numberArg("--rate") || Number(process.env.USD_TO_INR) || 85;
const MAX_IMAGES = Math.min(numberArg("--images") || 4, 6);
const LIMIT = numberArg("--limit");

// $19.99 at ₹85 -> ₹1,699: rounded to the nearest ₹10, ending in 9.
const toRupees = (usd, rate = RATE) =>
  Math.max(9, Math.round((Number(usd) * rate) / 10) * 10 - 1);

const getJson = async (path) => {
  const res = await fetch(`${SOURCE}${path}`, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`DummyJSON ${path} answered ${res.status}`);
  return res.json();
};

// Existing category with this name (any case), or a new one when applying.
const categoryFor = async (name) => {
  const existing = await categoryModel.findOne({
    name: { $regex: `^${escapeRegex(name)}$`, $options: "i" },
  });
  let category = existing;
  if (!existing && APPLY) {
    category = await categoryModel.create({ name, slug: slugify(name, { lower: true, strict: true }) });
  }
  return { category, created: !existing };
};

// A slug no other product uses: "iphone-9", or "iphone-9-dj12" if taken.
const freeSlug = async (title, id) => {
  const base = slugify(title, { lower: true, strict: true }) || "product";
  return (await productModel.exists({ slug: base })) ? `${base}-dj${id}` : base;
};

run(async () => {
  if (APPLY && !cloudinaryConfigured()) {
    throw new Error("Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET in .env first");
  }
  await connect();
  // The unique externalId index must exist before inserting.
  if (APPLY) await productModel.init();

  const [{ products: all }, categoryList] = await Promise.all([
    getJson("/products?limit=0"),
    getJson("/products/categories"),
  ]);
  const categoryNames = new Map(categoryList.map((c) => [c.slug, c.name]));
  const wanted = all.filter((p) => !SKIP_CATEGORIES.has(p.category)).slice(0, LIMIT);
  console.log(
    `DummyJSON: ${all.length} products, ${wanted.length} to import ` +
      `(skipping ${[...SKIP_CATEGORIES].join(", ")}), at ₹${RATE} per US dollar, up to ${MAX_IMAGES} images each.`
  );

  const already = new Set(
    (await productModel.find({ externalId: { $in: wanted.map((p) => `dummyjson:${p.id}`) } }).select("externalId"))
      .map((p) => p.externalId)
  );
  const todo = wanted.filter((p) => !already.has(`dummyjson:${p.id}`));
  console.log(`${already.size} already imported, ${todo.length} new.\n`);

  // Categories first, one at a time, so none is created twice.
  const categories = new Map();
  for (const p of todo) {
    if (categories.has(p.category)) continue;
    const name = categoryNames.get(p.category) || p.category;
    const entry = await categoryFor(name);
    categories.set(p.category, entry);
    if (entry.created) console.log(`  ${APPLY ? "created" : "would create"} category "${name}"`);
  }

  const counts = { imported: 0, failed: 0 };
  await eachLimit(todo, 3, async (p) => {
    const price = toRupees(p.price);
    const stock = Number.isInteger(p.stock) && p.stock >= 0 ? p.stock : 25;
    const imageUrls = (p.images?.length ? p.images : [p.thumbnail]).filter(Boolean).slice(0, MAX_IMAGES);
    const label = `"${p.title}" (${categoryNames.get(p.category) || p.category}, $${p.price} -> ₹${price}, stock ${stock}, ${imageUrls.length} image(s))`;
    if (!APPLY) {
      counts.imported++;
      console.log(`  would import ${label}`);
      return;
    }
    try {
      // Cloudinary downloads each image from DummyJSON's CDN itself.
      const images = [];
      for (const [n, url] of imageUrls.entries()) {
        images.push(await uploadImage(url, { publicId: `dummyjson-${p.id}-${n + 1}` }));
      }
      await productModel.create({
        name: p.title,
        slug: await freeSlug(p.title, p.id),
        description: p.description || p.title,
        price,
        category: categories.get(p.category).category._id,
        quantity: stock,
        shipping: true,
        images,
        externalId: `dummyjson:${p.id}`,
      });
      counts.imported++;
      console.log(`  imported ${label}`);
    } catch (error) {
      // A duplicate externalId means another run imported it meanwhile.
      if (error.code === 11000 && error.keyPattern?.externalId) {
        console.log(`  skip   "${p.title}": already imported`);
        return;
      }
      counts.failed++;
      console.log(`  FAILED "${p.title}": ${error.message}`);
    }
  });

  const verb = APPLY ? "Imported" : "Would import";
  console.log(`\n${verb} ${counts.imported}, already there ${already.size}, failed ${counts.failed}.`);
  if (counts.failed) {
    console.log("Run the same command again to retry the failed products.");
    process.exitCode = 1;
  }
});
