import categoryModel from "../models/categoryModel.js";
import productModel from "../models/productModel.js";
import slugify from "slugify";
import mongoose from "mongoose";
export const createCategoryController = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    if (!name) {
      return res.status(400).send({ success: false, message: "Name is required" });
    }
    const existingCategory = await categoryModel.findOne({ name });
    if (existingCategory) {
      return res.status(409).send({
        success: false,
        message: "Category already exists",
      });
    }
    const category = await new categoryModel({
      name,
      slug: slugify(name),
    }).save();
    res.status(201).send({
      success: true,
      message: "new category created",
      category,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in category",
    });
  }
};

//update category
export const updateCategoryController = async (req, res) => {
  try {
    const name = req.body.name?.trim();
    const { id } = req.params;
    if (!name) {
      return res.status(400).send({ success: false, message: "Name is required" });
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).send({ success: false, message: "Category not found" });
    }
    const duplicate = await categoryModel.findOne({ name, _id: { $ne: id } });
    if (duplicate) {
      return res.status(409).send({
        success: false,
        message: "Category already exists",
      });
    }
    const category = await categoryModel.findByIdAndUpdate(
      id,
      { name, slug: slugify(name) },
      { new: true }
    );
    if (!category) {
      return res.status(404).send({ success: false, message: "Category not found" });
    }
    res.status(200).send({
      success: true,
      message: "Category Updated Successfully",
      category,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error while updating category",
    });
  }
};

// get all cat
export const categoryControlller = async (req, res) => {
  try {
    const category = await categoryModel.find({});
    res.status(200).send({
      success: true,
      message: "All Categories List",
      category,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error while getting all categories",
    });
  }
};

// single category
export const singleCategoryController = async (req, res) => {
  try {
    const category = await categoryModel.findOne({ slug: req.params.slug });
    res.status(200).send({
      success: true,
      message: "Category fetched",
      category,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error While getting Single Category",
    });
  }
};

//delete category
export const deleteCategoryCOntroller = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).send({ success: false, message: "Category not found" });
    }
    // Deleting a category that products still use would leave them orphaned.
    const productCount = await productModel.countDocuments({ category: id });
    if (productCount > 0) {
      return res.status(409).send({
        success: false,
        message: `This category still has ${productCount} product${productCount === 1 ? "" : "s"}. Move or delete them first.`,
      });
    }
    const deleted = await categoryModel.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).send({ success: false, message: "Category not found" });
    }
    res.status(200).send({
      success: true,
      message: "Category Deleted Successfully",
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "error while deleting category",
    });
  }
};