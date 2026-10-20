import express from "express";
import { dashboardController } from "../controllers/analyticsController.js";
import { isAdmin, requireSignIn } from "../middlewares/authMiddleware.js";

const router = express.Router();

//store analytics (admin)
router.get("/dashboard", requireSignIn, isAdmin, dashboardController);

export default router;
