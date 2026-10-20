import rateLimit, { ipKeyGenerator } from "express-rate-limit";

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

// Unsubscribe links work without logging in; their tokens can't be guessed,
// but there's no reason to let anyone try thousands.
export const unsubscribeLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
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

// Shopping assistant: per signed-in account, else per IP. Every message can
// use the AI's free quota, so there's a short-term and a daily limit
// (ASSISTANT_LIMIT_PER_MINUTE, default 8; ASSISTANT_LIMIT_PER_DAY, default 150).
// Read on each request, since .env loads after this module.
const assistantKey = (req) => (req.user?._id ? `user:${req.user._id}` : `ip:${ipKeyGenerator(req.ip)}`);
const assistantSetting = (name, fallback) => () => Number(process.env[name]) || fallback;
const slowDown = {
  success: false,
  message: "You're sending messages too quickly. Please wait a moment and try again.",
};

export const assistantLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: assistantSetting("ASSISTANT_LIMIT_PER_MINUTE", 8),
  keyGenerator: assistantKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: slowDown,
});

export const assistantDailyLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: assistantSetting("ASSISTANT_LIMIT_PER_DAY", 150),
  keyGenerator: assistantKey,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: {
    success: false,
    message: "You've reached today's limit for the assistant. Please try again tomorrow.",
  },
});
