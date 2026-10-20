import express from "express";
import {
  addRestockRequestController,
  getPreferencesController,
  getRestockRequestsController,
  removeRestockRequestController,
  resubscribeController,
  unsubscribeController,
  updatePreferencesController,
} from "../controllers/alertController.js";
import { requireSignIn } from "../middlewares/authMiddleware.js";
import { unsubscribeLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

//unsubscribe link (no login: the link is signed). Mail apps' one-click
//unsubscribe posts a form body, so accept that as well as JSON.
const formBody = express.urlencoded({ extended: false, limit: "1kb" });
router.post("/unsubscribe", unsubscribeLimiter, formBody, unsubscribeController);
router.post("/resubscribe", unsubscribeLimiter, resubscribeController);

//my alert settings
router.get("/preferences", requireSignIn, getPreferencesController);
router.put("/preferences", requireSignIn, updatePreferencesController);

//"notify me when available"
router.get("/restock", requireSignIn, getRestockRequestsController);
router.post("/restock/:pid", requireSignIn, addRestockRequestController);
router.delete("/restock/:pid", requireSignIn, removeRestockRequestController);

export default router;
