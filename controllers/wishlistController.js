import mongoose from "mongoose";
import wishlistModel from "../models/wishlistModel.js";
import productModel from "../models/productModel.js";

export const MAX_WISHLIST_ITEMS = 100;

// GET /  : my wishlist, most recently added first, with each product's
// current details (price, stock, rating, images).
export const getWishlistController = async (req, res) => {
  try {
    const items = await wishlistModel
      .find({ user: req.user._id })
      .sort({ createdAt: -1, _id: -1 })
      .populate({
        path: "product",
        select: "-photo",
        populate: { path: "category", select: "name slug" },
      });
    // Products deleted since they were added: drop them from the wishlist.
    const gone = items.filter((item) => !item.product).map((item) => item._id);
    if (gone.length) await wishlistModel.deleteMany({ _id: { $in: gone } });
    res.status(200).send({
      success: true,
      items: items
        .filter((item) => item.product)
        .map((item) => ({
          product: item.product,
          priceWhenAdded: item.priceWhenAdded,
          addedAt: item.createdAt,
        })),
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "Unable to load your wishlist" });
  }
};

// POST /:pid  : add a product (adding it again changes nothing).
export const addToWishlistController = async (req, res) => {
  try {
    const { pid } = req.params;
    const product = mongoose.isValidObjectId(pid)
      ? await productModel.findById(pid).select("price")
      : null;
    if (!product) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const filter = { user: req.user._id, product: product._id };
    if (await wishlistModel.exists(filter)) {
      return res.status(200).send({ success: true, message: "Already in your wishlist" });
    }
    if ((await wishlistModel.countDocuments({ user: req.user._id })) >= MAX_WISHLIST_ITEMS) {
      return res.status(400).send({
        success: false,
        message: `Your wishlist is full (${MAX_WISHLIST_ITEMS} items). Remove something first.`,
      });
    }
    try {
      await wishlistModel.create({ ...filter, priceWhenAdded: product.price });
    } catch (error) {
      // Added twice at once: the unique index keeps one.
      if (error.code !== 11000) throw error;
    }
    res.status(201).send({ success: true, message: "Added to your wishlist" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "Unable to update your wishlist" });
  }
};

// DELETE /:pid  : remove a product (removing a missing one is fine).
export const removeFromWishlistController = async (req, res) => {
  try {
    const { pid } = req.params;
    if (mongoose.isValidObjectId(pid)) {
      await wishlistModel.deleteOne({ user: req.user._id, product: pid });
    }
    res.status(200).send({ success: true, message: "Removed from your wishlist" });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "Unable to update your wishlist" });
  }
};
