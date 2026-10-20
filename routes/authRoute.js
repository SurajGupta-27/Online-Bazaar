import express from "express";
import {
  registerController,
  loginController,
  googleLoginController,
  testController,
  forgotPasswordController,
  updateProfileController,
  getAllUsersController,
} from "../controllers/authController.js";
import { isAdmin, requireSignIn } from "../middlewares/authMiddleware.js";
import {
  forgotPasswordLimiter,
  googleLoginLimiter,
  loginLimiter,
} from "../middlewares/rateLimiters.js";

//router object
const router = express.Router();

//routing
//REGISTER || METHOD POST
router.post("/register", registerController);

//LOGIN || POST
router.post("/login", loginLimiter, loginController);

//GOOGLE SIGN-IN || POST (body: { credential } = Google ID token)
router.post("/google", googleLoginLimiter, googleLoginController);

//Forgot Password || POST
router.post("/forgot-password", forgotPasswordLimiter, forgotPasswordController);

//test routes
router.get("/test", requireSignIn, isAdmin, testController);

//protected User route auth
router.get("/user-auth", requireSignIn, (req, res) => {
  res.status(200).send({ ok: true });
});
//protected Admin route auth
router.get("/admin-auth", requireSignIn, isAdmin, (req, res) => {
  res.status(200).send({ ok: true });
});

//update profile
router.put("/profile", requireSignIn, updateProfileController);

//all users (admin)
router.get("/all-users", requireSignIn, isAdmin, getAllUsersController);

export default router;