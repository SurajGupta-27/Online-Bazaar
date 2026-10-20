import express from "express";
import {
  addToWishlistController,
  getWishlistController,
  removeFromWishlistController,
} from "../controllers/wishlistController.js";
import { requireSignIn } from "../middlewares/authMiddleware.js";

const router = express.Router();

// Every wishlist route is for the signed-in user's own wishlist.
router.use(requireSignIn);

//my wishlist
router.get("/", getWishlistController);

//add a product
router.post("/:pid", addToWishlistController);

//remove a product
router.delete("/:pid", removeFromWishlistController);

export default router;
