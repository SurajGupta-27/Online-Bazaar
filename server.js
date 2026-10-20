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
import { releaseExpiredPayments } from "./controllers/orderController.js";
import cors from "cors";
import helmet from "helmet";
import mongoose from "mongoose";

//configure env
dotenv.config();

//databse config
connectDB();

//rest object
const app = express();

// Trust X-Forwarded-For only from a local proxy (the React dev server), so rate
// limits apply per real client IP. Adjust if deploying behind a remote proxy.
app.set("trust proxy", "loopback");

// Only the frontend origin(s) may call the API from a browser.
// CLIENT_URL can be a comma-separated list; defaults to the React dev server.
const allowedOrigins = (process.env.CLIENT_URL || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim());

//middelwares
app.use(helmet());
app.use(cors({ origin: allowedOrigins }));
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

//rest api
app.get("/", (req, res) => {
  res.send("<h1>Online Bazaar API</h1>");
});

app.get("/api/health", (req, res) => {
  res.status(200).send({ success: true, service: "online-bazaar-api" });
});

// Last-resort error handler: log details, never send them to the client.
app.use((err, req, res, next) => {
  console.log(err);
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
  releaseExpiredPayments().catch((error) => console.log(error));
}, sweepSeconds * 1000).unref();

//run listen
app.listen(PORT, () => {
  console.log(
    `Server Running on ${process.env.DEV_MODE || "development"} mode on port ${PORT}`.bgCyan
      .white
  );
});