import express from "express";
import { assistantChatController } from "../controllers/assistantController.js";
import { optionalSignIn } from "../middlewares/authMiddleware.js";
import { assistantLimiter, assistantDailyLimiter } from "../middlewares/rateLimiters.js";

const router = express.Router();

// Open to everyone; limited per account when signed in, else per IP.
router.post("/chat", optionalSignIn, assistantLimiter, assistantDailyLimiter, assistantChatController);

export default router;
