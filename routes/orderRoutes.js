import express from "express";
import { requireSignIn } from "../middlewares/authMiddleware.js";
import {
  createOrderController,
  getMyOrdersController,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/create-order", requireSignIn, createOrderController);
router.get("/my-orders", requireSignIn, getMyOrdersController);

export default router;
