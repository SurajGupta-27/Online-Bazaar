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

export const forgotPasswordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: tooManyAttempts,
});
