import JWT from "jsonwebtoken";
import userModel from "../models/userModel.js";

//Protected Routes token base
export const requireSignIn = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
    if (!token || !process.env.JWT_SECRET) {
      return res.status(401).send({
        success: false,
        message: "Authentication required",
      });
    }
    const decode = JWT.verify(
      token,
      process.env.JWT_SECRET
    );
    req.user = decode;
    next();
  } catch (error) {
    return res.status(401).send({
      success: false,
      message: "Invalid or expired authentication token",
    });
  }
};

// For routes open to everyone that treat signed-in users differently (e.g.
// rate limits per account): sets req.user when a valid token is sent, and
// otherwise carries on without one.
export const optionalSignIn = (req, res, next) => {
  const token = req.headers.authorization?.replace(/^Bearer\s+/i, "");
  if (token && process.env.JWT_SECRET) {
    try {
      req.user = JWT.verify(token, process.env.JWT_SECRET);
    } catch {
      // An expired or bad token just means "not signed in" here.
    }
  }
  next();
};

//admin acceess
export const isAdmin = async (req, res, next) => {
  try {
    const user = await userModel.findById(req.user._id);
    if (!user) {
      return res.status(401).send({
        success: false,
        message: "User account not found",
      });
    }
    if (user.role !== 1) {
      // 403, not 401: the user is signed in, just not allowed here.
      return res.status(403).send({
        success: false,
        message: "UnAuthorized Access",
      });
    } else {
      next();
    }
  } catch (error) {
    console.error(error);
    res.status(500).send({
      success: false,
      message: "Error in admin middelware",
    });
  }
};