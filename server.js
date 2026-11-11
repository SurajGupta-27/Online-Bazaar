import express from "express";
import colors from "colors";
import dotenv from "dotenv";
import morgan from "morgan";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoute.js";
import categoryRoutes from "./routes/categoryRoutes.js";
import productRoutes from "./routes/productRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import reviewRoutes from "./routes/reviewRoutes.js";
import wishlistRoutes from "./routes/wishlistRoutes.js";
import analyticsRoutes from "./routes/analyticsRoutes.js";
import alertRoutes from "./routes/alertRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";
import { releaseExpiredPayments } from "./controllers/orderController.js";
import { processAlertQueue } from "./helpers/productAlerts.js";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { clientOrigins } from "./helpers/clientUrl.js";

//configure env
dotenv.config();

//database config
connectDB();

//rest object
const app = express();

// Which proxies may set X-Forwarded-For, so rate limits apply per real client
// IP. Default "loopback" (the React dev server's proxy). Behind a host's load
// balancers (Render), TRUST_PROXY is the number of proxy hops in front of the
// app; GET /api/health shows the IP the server sees, to check it.
const trustProxy = (value = "") => {
  const setting = value.trim();
  if (!setting) return "loopback";
  if (/^\d+$/.test(setting)) return Number(setting);
  if (setting === "true" || setting === "false") return setting === "true";
  return setting;
};
app.set("trust proxy", trustProxy(process.env.TRUST_PROXY));

// Only the frontend origin(s) may call the API from a browser.
const allowedOrigins = clientOrigins();

// The React build, when it exists (npm run build), is served by this server
// so the store and the API share one origin. SERVE_CLIENT=false turns it off;
// CLIENT_BUILD_DIR (tests) points it at another folder.
const clientBuild =
  process.env.CLIENT_BUILD_DIR || fileURLToPath(new URL("./client/build", import.meta.url));
const serveClient =
  process.env.SERVE_CLIENT !== "false" && existsSync(join(clientBuild, "index.html"));

//middlewares
app.use(
  helmet({
    // The store loads Bootstrap from jsDelivr, Google Sign-In and Razorpay
    // Checkout; product images come from Cloudinary (any https image).
    contentSecurityPolicy: {
      directives: {
        scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://accounts.google.com/gsi/client", "https://checkout.razorpay.com"],
        connectSrc: ["'self'", "https://accounts.google.com/gsi/", "https://*.razorpay.com"],
        frameSrc: ["https://accounts.google.com/gsi/", "https://api.razorpay.com", "https://checkout.razorpay.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:"],
        formAction: ["'self'", "https://*.razorpay.com"],
        // Only over https; on http://localhost it would break the page.
        upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null,
      },
    },
    // Google Sign-In's popup needs to talk back to the page.
    crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
  })
);
// When the store is hosted apart from the API (Vercel + Render), CLIENT_URL
// lists its origin(s). maxAge lets browsers reuse the preflight that the
// Authorization header triggers; the invoice's file name is in
// Content-Disposition, which cross-origin pages can only read if exposed.
app.use(cors({ origin: allowedOrigins, maxAge: 600, exposedHeaders: ["Content-Disposition"] }));
// Product photos are <img> tags on the store's pages, which may be on another
// origin; Helmet's default (same-origin) would block them there.
app.use("/api/v1/product/product-photo", (req, res, next) => {
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});
app.use(express.json());
app.use(morgan("dev"));

app.use("/api/v1", (req, res, next) => {
  if (mongoose.connection.readyState !== 1) {
    return res.status(503).send({
      success: false,
      message: "Database is unavailable. Start MongoDB and check MONGO_URL.",
    });
  }
  next();
});

//routes
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/category", categoryRoutes);
app.use("/api/v1/product", productRoutes);
app.use("/api/v1/order", orderRoutes);
app.use("/api/v1/review", reviewRoutes);
app.use("/api/v1/wishlist", wishlistRoutes);
app.use("/api/v1/analytics", analyticsRoutes);
app.use("/api/v1/alerts", alertRoutes);
app.use("/api/v1/assistant", assistantRoutes);

// Health check for the host and uptime monitors: 200 whenever the server
// runs; `database` says whether MongoDB is connected. `clientIp` is the
// caller's IP as the server sees it, for checking TRUST_PROXY.
app.get("/api/health", (req, res) => {
  res.status(200).send({
    success: true,
    service: "online-bazaar-api",
    database: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
    clientIp: req.ip,
  });
});

// Unknown API paths get JSON, never the React page.
app.use("/api", (req, res) => {
  res.status(404).send({ success: false, message: "Not found" });
});

if (serveClient) {
  // Hashed files under static/ never change; everything else is revalidated.
  app.use(
    express.static(clientBuild, {
      index: false,
      setHeaders: (res, path) => {
        const hashed = path.startsWith(join(clientBuild, "static"));
        res.set("Cache-Control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
      },
    })
  );
  // Every other path is a React route.
  app.get(/.*/, (req, res) => {
    res.set("Cache-Control", "no-cache");
    res.sendFile(join(clientBuild, "index.html"));
  });
} else {
  app.get("/", (req, res) => {
    res.send("<h1>Online Bazaar API</h1>");
  });
}

// Last-resort error handler: log details, never send them to the client.
app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || err.statusCode || 500;
  const clientError = status >= 400 && status < 500;
  res.status(clientError ? status : 500).send({
    success: false,
    message: clientError ? "Invalid request" : "Something went wrong",
  });
});

//PORT
const PORT = process.env.PORT || 8080;

// Free the stock held by online orders that were never paid.
const sweepSeconds = Number(process.env.PAYMENT_SWEEP_SECONDS) || 60;
setInterval(() => {
  if (mongoose.connection.readyState !== 1) return;
  releaseExpiredPayments().catch((error) => console.error(error));
}, sweepSeconds * 1000).unref();

// Send price-drop and back-in-stock alerts that had to wait (retries, the
// one-a-day rule, the daily email limit).
const alertSweepSeconds = Number(process.env.ALERT_SWEEP_SECONDS) || 300;
setInterval(() => {
  if (mongoose.connection.readyState !== 1) return;
  processAlertQueue();
}, alertSweepSeconds * 1000).unref();

//run listen
app.listen(PORT, () => {
  console.log(
    `Server Running on ${process.env.DEV_MODE || "development"} mode on port ${PORT}`.bgCyan
      .white
  );
});