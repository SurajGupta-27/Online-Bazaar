import mongoose from "mongoose";
import reviewModel from "../models/reviewModel.js";
import productModel from "../models/productModel.js";
import orderModel from "../models/orderModel.js";
import userModel from "../models/userModel.js";
import { plainText } from "../helpers/plainText.js";

export const REVIEW_MIN_LENGTH = 10;
export const REVIEW_MAX_LENGTH = 1000;
const PER_PAGE = 10;
const ADMIN_PER_PAGE = 20;

const pageOf = (query) => Math.max(parseInt(query.page, 10) || 1, 1);

// Validated { rating, comment } from a request body, or { error }.
const parseReview = ({ rating, comment } = {}) => {
  const stars = ["number", "string"].includes(typeof rating) ? Number(rating) : NaN;
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { error: "Choose a rating from 1 to 5 stars" };
  }
  // The raw length check keeps huge inputs away from the sanitizer.
  if (typeof comment !== "string" || comment.length > REVIEW_MAX_LENGTH * 5) {
    return { error: `Write a review of ${REVIEW_MIN_LENGTH} to ${REVIEW_MAX_LENGTH} characters` };
  }
  const text = plainText(comment);
  if (text.length < REVIEW_MIN_LENGTH || text.length > REVIEW_MAX_LENGTH) {
    return { error: `Write a review of ${REVIEW_MIN_LENGTH} to ${REVIEW_MAX_LENGTH} characters` };
  }
  return { rating: stars, comment: text };
};

// What anyone may see of a review: the reviewer's name, never their email or id.
const publicReview = (review) => ({
  _id: review._id,
  name: review.user?.name || "Customer",
  rating: review.rating,
  comment: review.comment,
  verified: review.verified,
  createdAt: review.createdAt,
  updatedAt: review.updatedAt,
  // Mongoose gives both timestamps the same value on creation.
  edited: review.updatedAt > review.createdAt,
});

// Has this user received (status "delivered") an order containing the product?
const isVerifiedBuyer = (userId, productId) =>
  orderModel.exists({ user: userId, status: "delivered", "items.product": productId });

// Average (to 0.1), count and per-star counts of a product's reviews.
const ratingSummary = async (productId) => {
  const groups = await reviewModel.aggregate([
    { $match: { product: new mongoose.Types.ObjectId(String(productId)) } },
    { $group: { _id: "$rating", count: { $sum: 1 } } },
  ]);
  const breakdown = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let count = 0;
  let sum = 0;
  for (const group of groups) {
    breakdown[group._id] = group.count;
    count += group.count;
    sum += group._id * group.count;
  }
  return { average: count ? Math.round((sum / count) * 10) / 10 : 0, count, breakdown };
};

// Recomputes the product's stored average and count from its reviews, so they
// are always derived from the reviews rather than adjusted step by step.
export const refreshProductRating = async (productId) => {
  const { average, count } = await ratingSummary(productId);
  await productModel.updateOne(
    { _id: productId },
    { $set: { ratingAverage: average, ratingCount: count } },
    { timestamps: false }
  );
  return { average, count };
};

// GET /product/:pid?page=  (public)
export const getProductReviewsController = async (req, res) => {
  try {
    const { pid } = req.params;
    if (!mongoose.isValidObjectId(pid) || !(await productModel.exists({ _id: pid }))) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const page = pageOf(req.query);
    const [summary, reviews] = await Promise.all([
      ratingSummary(pid),
      reviewModel
        .find({ product: pid })
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PER_PAGE)
        .limit(PER_PAGE)
        .populate("user", "name"),
    ]);
    res.status(200).send({
      success: true,
      summary,
      reviews: reviews.map(publicReview),
      page,
      pages: Math.max(1, Math.ceil(summary.count / PER_PAGE)),
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to load reviews" });
  }
};

// GET /product/:pid/mine  (signed in): may I review it, and my review if any.
export const getMyReviewController = async (req, res) => {
  try {
    const { pid } = req.params;
    if (!mongoose.isValidObjectId(pid)) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const [review, verified] = await Promise.all([
      reviewModel.findOne({ product: pid, user: req.user._id }).populate("user", "name"),
      isVerifiedBuyer(req.user._id, pid),
    ]);
    res.status(200).send({
      success: true,
      canReview: Boolean(verified),
      review: review ? publicReview(review) : null,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to load your review" });
  }
};

// POST /product/:pid  (signed in, verified buyers only)
export const createReviewController = async (req, res) => {
  try {
    const { pid } = req.params;
    if (!mongoose.isValidObjectId(pid) || !(await productModel.exists({ _id: pid }))) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const parsed = parseReview(req.body);
    if (parsed.error) {
      return res.status(400).send({ success: false, message: parsed.error });
    }
    if (!(await isVerifiedBuyer(req.user._id, pid))) {
      return res.status(403).send({
        success: false,
        message: "Only customers who have received this product can review it",
      });
    }
    const alreadyReviewed = {
      success: false,
      message: "You have already reviewed this product. Edit your review instead.",
    };
    if (await reviewModel.exists({ product: pid, user: req.user._id })) {
      return res.status(409).send(alreadyReviewed);
    }
    let review;
    try {
      review = await reviewModel.create({
        product: pid,
        user: req.user._id,
        rating: parsed.rating,
        comment: parsed.comment,
        verified: true,
      });
    } catch (error) {
      // Two submissions at once: the unique index lets only one through.
      if (error.code !== 11000) throw error;
      return res.status(409).send(alreadyReviewed);
    }
    await review.populate("user", "name");
    const summary = await refreshProductRating(pid);
    res.status(201).send({
      success: true,
      message: "Thanks for your review!",
      review: publicReview(review),
      summary,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to save your review" });
  }
};

// PUT /:id  (signed in, own review only)
export const updateReviewController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).send({ success: false, message: "Review not found" });
    }
    const parsed = parseReview(req.body);
    if (parsed.error) {
      return res.status(400).send({ success: false, message: parsed.error });
    }
    const review = await reviewModel
      .findOneAndUpdate(
        { _id: id, user: req.user._id },
        { $set: { rating: parsed.rating, comment: parsed.comment } },
        { new: true, runValidators: true }
      )
      .populate("user", "name");
    if (!review) {
      return res.status(404).send({ success: false, message: "Review not found" });
    }
    const summary = await refreshProductRating(review.product);
    res.status(200).send({
      success: true,
      message: "Review updated",
      review: publicReview(review),
      summary,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to update your review" });
  }
};

// DELETE /:id  (the review's author, or an admin)
export const deleteReviewController = async (req, res) => {
  try {
    const { id } = req.params;
    const review = mongoose.isValidObjectId(id) ? await reviewModel.findById(id) : null;
    const isAuthor = review && String(review.user) === String(req.user._id);
    const isAdmin = review && !isAuthor && (await userModel.exists({ _id: req.user._id, role: 1 }));
    // Someone else's review looks the same as a missing one.
    if (!isAuthor && !isAdmin) {
      return res.status(404).send({ success: false, message: "Review not found" });
    }
    await reviewModel.deleteOne({ _id: review._id });
    const summary = await refreshProductRating(review.product);
    res.status(200).send({ success: true, message: "Review deleted", summary });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to delete the review" });
  }
};

// GET /all?page=  (admin): newest reviews across the store, for moderation.
export const getAllReviewsController = async (req, res) => {
  try {
    const page = pageOf(req.query);
    const [total, reviews] = await Promise.all([
      reviewModel.estimatedDocumentCount(),
      reviewModel
        .find({})
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * ADMIN_PER_PAGE)
        .limit(ADMIN_PER_PAGE)
        .populate("user", "name email")
        .populate("product", "name slug"),
    ]);
    res.status(200).send({
      success: true,
      reviews: reviews.map((review) => ({
        ...publicReview(review),
        email: review.user?.email || "",
        product: review.product
          ? { _id: review.product._id, name: review.product.name, slug: review.product.slug }
          : null,
      })),
      page,
      pages: Math.max(1, Math.ceil(total / ADMIN_PER_PAGE)),
      total,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to load reviews" });
  }
};
