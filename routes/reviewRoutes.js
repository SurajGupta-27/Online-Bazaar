import express from "express";
import {
  createReviewController,
  deleteReviewController,
  getAllReviewsController,
  getMyReviewController,
  getProductReviewsController,
  updateReviewController,
} from "../controllers/reviewController.js";
import { isAdmin, requireSignIn } from "../middlewares/authMiddleware.js";
import { reviewLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

//a product's reviews and rating summary (public)
router.get("/product/:pid", getProductReviewsController);

//can I review this product, and my review if any
router.get("/product/:pid/mine", requireSignIn, getMyReviewController);

//write a review (verified buyers only)
router.post("/product/:pid", requireSignIn, reviewLimiter, createReviewController);

//edit my review
router.put("/:id", requireSignIn, reviewLimiter, updateReviewController);

//delete my review (or any review, as admin)
router.delete("/:id", requireSignIn, deleteReviewController);

//all reviews, newest first (admin moderation)
router.get("/all", requireSignIn, isAdmin, getAllReviewsController);

export default router;
