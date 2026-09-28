import express from "express";
import { isAdmin, requireSignIn } from "../middlewares/authMiddleware.js";
import {
  cancelPaymentController,
  createOrderController,
  getAllOrdersController,
  getMyOrdersController,
  markOrderPaidController,
  updateOrderStatusController,
  verifyPaymentController,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/create-order", requireSignIn, createOrderController);
router.post("/verify-payment", requireSignIn, verifyPaymentController);
router.post("/cancel-payment/:id", requireSignIn, cancelPaymentController);
router.get("/my-orders", requireSignIn, getMyOrdersController);

// admin
router.get("/all-orders", requireSignIn, isAdmin, getAllOrdersController);
router.put("/order-status/:id", requireSignIn, isAdmin, updateOrderStatusController);
router.put("/mark-paid/:id", requireSignIn, isAdmin, markOrderPaidController);

export default router;
