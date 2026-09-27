import express from "express";
import { isAdmin, requireSignIn } from "../middlewares/authMiddleware.js";
import {
  createOrderController,
  getAllOrdersController,
  getMyOrdersController,
  updateOrderStatusController,
} from "../controllers/orderController.js";

const router = express.Router();

router.post("/create-order", requireSignIn, createOrderController);
router.get("/my-orders", requireSignIn, getMyOrdersController);

// admin
router.get("/all-orders", requireSignIn, isAdmin, getAllOrdersController);
router.put("/order-status/:id", requireSignIn, isAdmin, updateOrderStatusController);

export default router;
