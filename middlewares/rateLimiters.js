import rateLimit from "express-rate-limit";

const tooManyAttempts = {
  success: false,
  message: "Too many attempts. Please try again in 15 minutes.",
};

// Only failed logins count, so a user who logs in normally is never blocked.
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooManyAttempts,
});

// Same rule for Google sign-in: only rejected ID tokens count.
export const googleLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooManyAttempts,
});

// Writing or editing reviews: 10 per hour per signed-in user (runs after
// requireSignIn, so it counts per account rather than per IP).
export const reviewLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => `user:${req.user._id}`,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "You're posting reviews too quickly. Please try again later.",
  },
});

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooManyAttempts,
});
