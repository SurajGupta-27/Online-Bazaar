import productModel from "../models/productModel.js";
import categoryModel from "../models/categoryModel.js";
import reviewModel from "../models/reviewModel.js";
import wishlistModel from "../models/wishlistModel.js";
import restockRequestModel from "../models/restockRequestModel.js";
import alertModel from "../models/alertModel.js";
import fs from "fs";
import slugify from "slugify";
import { escapeRegex } from "../helpers/escapeRegex.js";
import mongoose from "mongoose";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
  MAX_PHOTOS,
} from "../middlewares/uploadMiddleware.js";
import {
  cloudinaryConfigured,
  deleteImages,
  uploadImage,
} from "../helpers/cloudinary.js";
import { productChanged } from "../helpers/productAlerts.js";

const isBlank = (value) => value === undefined || String(value).trim() === "";

// New images arrive as "photos" (one or many); "photo" is the old single field.
const uploadedPhotos = (files = {}) =>
  [files.photos, files.photo].flat().filter(Boolean);

// Returns { status, message } for the first problem with the uploaded photos.
const validatePhotos = (photos, existingCount = 0) => {
  if (photos.length + existingCount > MAX_PHOTOS) {
    return { status: 400, message: `A product can have at most ${MAX_PHOTOS} photos` };
  }
  for (const photo of photos) {
    if (photo.size > MAX_PHOTO_BYTES) {
      return { status: 413, message: "Photo must be less than 1MB" };
    }
    if (!ALLOWED_PHOTO_TYPES.includes(photo.type)) {
      return { status: 400, message: "Photo must be a JPEG, PNG, WebP, GIF or AVIF image" };
    }
  }
  if (photos.length > 0 && !cloudinaryConfigured()) {
    return { status: 503, message: "Image uploads are not configured on the server" };
  }
  return null;
};

// Uploads every photo, or none: if one fails, the ones already uploaded are
// deleted again. Returns { images } or { status, message }.
const uploadPhotos = async (photos) => {
  const results = await Promise.allSettled(
    photos.map((photo) =>
      uploadImage(fs.readFileSync(photo.path), { contentType: photo.type })
    )
  );
  const images = results.filter((r) => r.status === "fulfilled").map((r) => r.value);
  const failed = results.find((r) => r.status === "rejected");
  if (!failed) return { images };
  console.error(failed.reason);
  await deleteImages(images.map((image) => image.publicId));
  // Cloudinary answers 400 when the file isn't really an image.
  return failed.reason?.status === 400
    ? { status: 400, message: "Photo could not be read as an image" }
    : { status: 502, message: "Image upload failed. Please try again." };
};

// The final image order on update. "images" is a JSON list in display order
// of existing publicIds to keep and "new:<n>" for the n-th uploaded photo.
// Existing images left out are removed; uploads left out go at the end.
// Without the field, existing images are kept and uploads appended.
// Returns entries like { existing: image } / { upload: n }, or null if invalid.
const imageOrder = (field, existing, uploadCount) => {
  const uploads = Array.from({ length: uploadCount }, (_, n) => ({ upload: n }));
  if (field === undefined) return [...existing.map((image) => ({ existing: image })), ...uploads];
  let tokens;
  try {
    tokens = JSON.parse(field);
  } catch {
    return null;
  }
  if (!Array.isArray(tokens) || new Set(tokens).size !== tokens.length) return null;
  const byId = new Map(existing.map((image) => [image.publicId, image]));
  const order = [];
  for (const token of tokens) {
    const n = /^new:(\d+)$/.exec(token)?.[1];
    if (n !== undefined && Number(n) < uploadCount) order.push({ upload: Number(n) });
    else if (byId.has(token)) order.push({ existing: byId.get(token) });
    else return null;
  }
  const placed = new Set(order.map((entry) => entry.upload));
  return [...order, ...uploads.filter((entry) => !placed.has(entry.upload))];
};

// Returns a user-facing message for the first invalid field, or null.
const validateProduct = async (fields) => {
  const { name, description, price, category, quantity } = fields;
  if (isBlank(name)) return "Name is required";
  if (isBlank(description)) return "Description is required";
  if (isBlank(price) || !(Number(price) >= 0)) {
    return "Price must be a number of 0 or more";
  }
  if (isBlank(quantity) || !Number.isInteger(Number(quantity)) || Number(quantity) < 0) {
    return "Quantity must be a whole number of 0 or more";
  }
  if (isBlank(category)) return "Category is required";
  if (!mongoose.isValidObjectId(category) || !(await categoryModel.exists({ _id: category }))) {
    return "Selected category does not exist";
  }
  return null;
};

// Only these fields can be set from the admin form.
const productFields = (fields) => ({
  name: String(fields.name).trim(),
  description: String(fields.description).trim(),
  price: Number(fields.price),
  quantity: Number(fields.quantity),
  category: fields.category,
  shipping: ["1", "true", "yes"].includes(String(fields.shipping).toLowerCase()),
});

// Lowercase, URL-safe slug that no other product uses ("pen", "pen-2", ...).
const uniqueSlug = async (name, excludeId) => {
  const base = slugify(name, { lower: true, strict: true }) || "product";
  let slug = base;
  for (let n = 2; await productModel.exists({ slug, _id: { $ne: excludeId } }); n++) {
    slug = `${base}-${n}`;
  }
  return slug;
};

export const createProductController = async (req, res) => {
  try {
    const photos = uploadedPhotos(req.files);
    const invalid = await validateProduct(req.fields);
    if (invalid) {
      return res.status(400).send({ success: false, message: invalid });
    }
    const badPhoto = validatePhotos(photos);
    if (badPhoto) {
      return res.status(badPhoto.status).send({ success: false, message: badPhoto.message });
    }

    const fields = productFields(req.fields);
    const products = new productModel({ ...fields, slug: await uniqueSlug(fields.name) });
    const upload = await uploadPhotos(photos);
    if (!upload.images) {
      return res.status(upload.status).send({ success: false, message: upload.message });
    }
    products.images = upload.images;
    try {
      await products.save();
    } catch (error) {
      await deleteImages(upload.images.map((image) => image.publicId));
      throw error;
    }
    res.status(201).send({
      success: true,
      message: "Product Created Successfully",
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in creating product",
    });
  }
};

//get all products
export const getProductController = async (req, res) => {
  try {
    const products = await productModel
      .find({})
      .populate("category")
      .select("-photo")
      .limit(12)
      .sort({ createdAt: -1 });
    res.status(200).send({
      success: true,
      counTotal: products.length,
      message: "All products",
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in getting products",
    });
  }
};
// get single product
export const getSingleProductController = async (req, res) => {
  try {
    const product = await productModel
      .findOne({ slug: req.params.slug })
      .select("-photo")
      .populate("category");
    res.status(200).send({
      success: true,
      message: "Single Product Fetched",
      product,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error while getting product",
    });
  }
};

// get photo: the main Cloudinary image, or a legacy photo stored in MongoDB.
export const productPhotoController = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.pid)) {
      return res.status(404).send({ success: false, message: "Photo not found" });
    }
    const product = await productModel.findById(req.params.pid).select("photo images");
    if (product?.images?.length) {
      return res.redirect(302, product.images[0].url);
    }
    // Never serve stored content as anything but an image (e.g. text/html).
    if (
      product?.photo?.data &&
      ALLOWED_PHOTO_TYPES.includes(product.photo.contentType)
    ) {
      res.set("Content-type", product.photo.contentType);
      // helmet defaults to same-origin; photos must load on the frontend's origin.
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
      return res.status(200).send(product.photo.data);
    }
    return res.status(404).send({ success: false, message: "Photo not found" });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error while getting photo",
    });
  }
};

//delete controller
export const deleteProductController = async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.pid)) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const deleted = await productModel.findByIdAndDelete(req.params.pid).select("-photo");
    if (deleted) {
      await Promise.all([
        reviewModel.deleteMany({ product: deleted._id }),
        wishlistModel.deleteMany({ product: deleted._id }),
        restockRequestModel.deleteMany({ product: deleted._id }),
        alertModel.deleteMany({ product: deleted._id }),
      ]);
    }
    await deleteImages(deleted?.images?.map((image) => image.publicId));
    res.status(200).send({
      success: true,
      message: "Product Deleted successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error while deleting product",
    });
  }
};

//upate producta
export const updateProductController = async (req, res) => {
  try {
    const photos = uploadedPhotos(req.files);
    if (!mongoose.isValidObjectId(req.params.pid)) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const invalid = await validateProduct(req.fields);
    if (invalid) {
      return res.status(400).send({ success: false, message: invalid });
    }
    const products = await productModel.findById(req.params.pid);
    if (!products) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const order = imageOrder(req.fields.images, products.images, photos.length);
    if (!order) {
      return res.status(400).send({ success: false, message: "Invalid image list" });
    }
    const kept = order.filter((entry) => entry.existing).map((entry) => entry.existing);
    const badPhoto = validatePhotos(photos, kept.length);
    if (badPhoto) {
      return res.status(badPhoto.status).send({ success: false, message: badPhoto.message });
    }
    const upload = await uploadPhotos(photos);
    if (!upload.images) {
      return res.status(upload.status).send({ success: false, message: upload.message });
    }

    const keptIds = new Set(kept.map((image) => image.publicId));
    const removed = products.images.filter((image) => !keptIds.has(image.publicId));
    const fields = productFields(req.fields);
    const before = { price: products.price, quantity: products.quantity };
    products.set({ ...fields, slug: await uniqueSlug(fields.name, req.params.pid) });
    products.images = order.map((entry) => entry.existing || upload.images[entry.upload]);
    // Once a product has Cloudinary images its old MongoDB photo is not used.
    if (products.images.length > 0) products.photo = undefined;
    try {
      await products.save();
    } catch (error) {
      await deleteImages(upload.images.map((image) => image.publicId));
      throw error;
    }
    await deleteImages(removed.map((image) => image.publicId));
    // Price-drop and back-in-stock emails, queued in the background.
    productChanged(products._id, before, { price: products.price, quantity: products.quantity });
    res.status(201).send({
      success: true,
      message: "Product Updated Successfully",
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in updating product",
    });
  }
};

// "Sort by" choices for product lists. Each ends with _id so the order is
// stable and paging never repeats or skips a product.
const SORTS = {
  newest: { createdAt: -1, _id: -1 },
  price_asc: { price: 1, _id: 1 },
  price_desc: { price: -1, _id: -1 },
  rating: { ratingAverage: -1, ratingCount: -1, _id: -1 },
};
// The sort for a request value (default newest), or null if it isn't one of
// SORTS (hasOwn, so "constructor" and friends don't count).
const sortFor = (value = "newest") =>
  typeof value === "string" && Object.hasOwn(SORTS, value) ? SORTS[value] : null;

// filters
export const productFiltersController = async (req, res) => {
  try {
    const { checked = [], radio = [] } = req.body;
    const sort = sortFor(req.body.sort);
    if (!sort) {
      return res.status(400).send({ success: false, message: "Invalid sort" });
    }
    if (!Array.isArray(checked) || !checked.every((id) => mongoose.isValidObjectId(id))) {
      return res.status(400).send({ success: false, message: "Invalid category filter" });
    }
    // radio is a price range [min, max): max is excluded, null means no limit.
    const [min, max] = Array.isArray(radio) ? radio : [];
    if (
      !Array.isArray(radio) ||
      (radio.length > 0 && !(Number.isFinite(min) && (max === null || Number.isFinite(max))))
    ) {
      return res.status(400).send({ success: false, message: "Invalid price filter" });
    }
    let args = {};
    if (checked.length > 0) args.category = { $in: checked };
    if (radio.length) {
      args.price = { $gte: min };
      if (max !== null) args.price.$lt = max;
    }
    const products = await productModel.find(args).select("-photo").sort(sort).populate("category");
    res.status(200).send({
      success: true,
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(400).send({
      success: false,
      message: "Error while filtering products",
    });
  }
};

// product count
export const productCountController = async (req, res) => {
  try {
    const total = await productModel.find({}).estimatedDocumentCount();
    res.status(200).send({
      success: true,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(400).send({
      message: "Error in product count",
      success: false,
    });
  }
};

// product list base on page
export const productListController = async (req, res) => {
  try {
    // ?perPage= lets the admin list show more per page (1-48, default 6);
    // ?sort= is one of SORTS (default newest).
    const perPage = Math.min(Math.max(parseInt(req.query.perPage, 10) || 6, 1), 48);
    const page = Math.max(parseInt(req.params.page, 10) || 1, 1);
    const sort = sortFor(req.query.sort);
    if (!sort) {
      return res.status(400).send({ success: false, message: "Invalid sort" });
    }
    const products = await productModel
      .find({})
      .select("-photo")
      .sort(sort)
      .skip((page - 1) * perPage)
      .limit(perPage);
    res.status(200).send({
      success: true,
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(400).send({
      success: false,
      message: "error in per page ctrl",
    });
  }
};

// search product
export const searchProductController = async (req, res) => {
  try {
    const keyword = req.params.keyword.trim().slice(0, 100);
    const pattern = escapeRegex(keyword);
    const resutls = await productModel
      .find({
        $or: [
          { name: { $regex: pattern, $options: "i" } },
          { description: { $regex: pattern, $options: "i" } },
        ],
      })
      .select("-photo");
    res.json(resutls);
  } catch (error) {
    console.error(error);
    res.status(400).send({
      success: false,
      message: "Error In Search Product API",
    });
  }
};

// similar products
export const realtedProductController = async (req, res) => {
  try {
    const { pid, cid } = req.params;
    const products = await productModel
      .find({
        category: cid,
        _id: { $ne: pid },
      })
      .select("-photo")
      .limit(3)
      .populate("category");
    res.status(200).send({
      success: true,
      products,
    });
  } catch (error) {
    console.error(error);
    res.status(400).send({
      success: false,
      message: "error while geting related product",
    });
  }
};

// get prdocyst by catgory
export const productCategoryController = async (req, res) => {
  try {
    const category = await categoryModel.findOne({ slug: req.params.slug });
    if (!category) {
      return res.status(404).send({
        success: false,
        message: "Category not found",
      });
    }
    // Paged like the home page: ?page=N, 6 per page, newest first.
    const perPage = 6;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [products, total] = await Promise.all([
      productModel
        .find({ category: category._id })
        .select("-photo")
        .populate("category")
        .sort({ createdAt: -1 })
        .skip((page - 1) * perPage)
        .limit(perPage),
      productModel.countDocuments({ category: category._id }),
    ]);
    res.status(200).send({
      success: true,
      category,
      products,
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(400).send({
      success: false,
      message: "Error While Getting products",
    });
  }
};