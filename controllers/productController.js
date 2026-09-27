import productModel from "../models/productModel.js";
import categoryModel from "../models/categoryModel.js";
import fs from "fs";
import slugify from "slugify";
import { escapeRegex } from "../helpers/escapeRegex.js";
import mongoose from "mongoose";
import {
  ALLOWED_PHOTO_TYPES,
  MAX_PHOTO_BYTES,
} from "../middlewares/uploadMiddleware.js";

const isBlank = (value) => value === undefined || String(value).trim() === "";

// Returns a user-facing message for the first invalid field, or null.
const validateProduct = async (fields, photo) => {
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
  if (photo && photo.size > MAX_PHOTO_BYTES) return "Photo must be less than 1MB";
  if (photo && !ALLOWED_PHOTO_TYPES.includes(photo.type)) {
    return "Photo must be a JPEG, PNG, WebP, GIF or AVIF image";
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
    const photo = req.files?.photo;
    const invalid = await validateProduct(req.fields, photo);
    if (invalid) {
      return res.status(400).send({ success: false, message: invalid });
    }

    const fields = productFields(req.fields);
    const products = new productModel({ ...fields, slug: await uniqueSlug(fields.name) });
    if (photo) {
      products.photo.data = fs.readFileSync(photo.path);
      products.photo.contentType = photo.type;
    }
    await products.save();
    res.status(201).send({
      success: true,
      message: "Product Created Successfully",
      products,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in crearing product",
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
      message: "ALlProducts ",
      products,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Erorr in getting products",
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
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Eror while getitng single product",
    });
  }
};

// get photo
export const productPhotoController = async (req, res) => {
  try {
    const product = await productModel.findById(req.params.pid).select("photo");
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
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Erorr while getting photo",
    });
  }
};

//delete controller
export const deleteProductController = async (req, res) => {
  try {
    await productModel.findByIdAndDelete(req.params.pid).select("-photo");
    res.status(200).send({
      success: true,
      message: "Product Deleted successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error while deleting product",
    });
  }
};

//upate producta
export const updateProductController = async (req, res) => {
  try {
    const photo = req.files?.photo;
    if (!mongoose.isValidObjectId(req.params.pid)) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const invalid = await validateProduct(req.fields, photo);
    if (invalid) {
      return res.status(400).send({ success: false, message: invalid });
    }

    const fields = productFields(req.fields);
    const products = await productModel.findByIdAndUpdate(
      req.params.pid,
      { ...fields, slug: await uniqueSlug(fields.name, req.params.pid) },
      { new: true }
    );
    if (!products) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    if (photo) {
      products.photo.data = fs.readFileSync(photo.path);
      products.photo.contentType = photo.type;
    }

    await products.save();
    res.status(201).send({
      success: true,
      message: "Product Updated Successfully",
      products,
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({
      success: false,
      message: "Error in Updte product",
    });
  }
};

// filters
export const productFiltersController = async (req, res) => {
  try {
    const { checked = [], radio = [] } = req.body;
    let args = {};
    if (checked.length > 0) args.category = checked;
    if (radio.length) args.price = { $gte: radio[0], $lte: radio[1] };
    const products = await productModel.find(args).select("-photo").populate("category");
    res.status(200).send({
      success: true,
      products,
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      success: false,
      message: "Error WHile Filtering Products",
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
    console.log(error);
    res.status(400).send({
      message: "Error in product count",
      success: false,
    });
  }
};

// product list base on page
export const productListController = async (req, res) => {
  try {
    const perPage = 6;
    const page = req.params.page ? req.params.page : 1;
    const products = await productModel
      .find({})
      .select("-photo")
      .skip((page - 1) * perPage)
      .limit(perPage)
      .sort({ createdAt: -1 });
    res.status(200).send({
      success: true,
      products,
    });
  } catch (error) {
    console.log(error);
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
    console.log(error);
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
    console.log(error);
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
    const products = await productModel
      .find({ category: category._id })
      .select("-photo")
      .populate("category");
    res.status(200).send({
      success: true,
      category,
      products,
    });
  } catch (error) {
    console.log(error);
    res.status(400).send({
      success: false,
      message: "Error While Getting products",
    });
  }
};