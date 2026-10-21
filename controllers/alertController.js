import mongoose from "mongoose";
import userModel from "../models/userModel.js";
import productModel from "../models/productModel.js";
import restockRequestModel from "../models/restockRequestModel.js";
import {
  ALERT_KINDS,
  alertPreferences,
  validUnsubscribeToken,
} from "../helpers/alertTokens.js";

export const MAX_RESTOCK_REQUESTS = 100;

// GET /preferences  : my alert settings, { priceDrop, backInStock }.
export const getPreferencesController = async (req, res) => {
  try {
    const user = await userModel.findById(req.user._id).select("alertPrefs");
    if (!user) return res.status(404).send({ success: false, message: "User not found" });
    res.status(200).send({ success: true, alerts: alertPreferences(user) });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to load your alert settings" });
  }
};

// PUT /preferences  : { priceDrop?, backInStock? }, each true or false.
export const updatePreferencesController = async (req, res) => {
  try {
    const $set = {};
    for (const { pref } of Object.values(ALERT_KINDS)) {
      const value = req.body?.[pref];
      if (value === undefined) continue;
      if (typeof value !== "boolean") {
        return res.status(400).send({ success: false, message: "Alert settings must be on or off" });
      }
      $set[`alertPrefs.${pref}`] = value;
    }
    if (!Object.keys($set).length) {
      return res.status(400).send({ success: false, message: "Nothing to change" });
    }
    const user = await userModel
      .findByIdAndUpdate(req.user._id, { $set }, { new: true })
      .select("alertPrefs");
    if (!user) return res.status(404).send({ success: false, message: "User not found" });
    res.status(200).send({ success: true, message: "Alert settings saved", alerts: alertPreferences(user) });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to save your alert settings" });
  }
};

// GET /restock  : ids of the products I asked to hear about.
export const getRestockRequestsController = async (req, res) => {
  try {
    const requests = await restockRequestModel.find({ user: req.user._id }).select("product");
    res.status(200).send({ success: true, products: requests.map((r) => r.product) });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to load your alerts" });
  }
};

// POST /restock/:pid  : "Notify me when available" (out-of-stock products only).
export const addRestockRequestController = async (req, res) => {
  try {
    const { pid } = req.params;
    const product = mongoose.isValidObjectId(pid)
      ? await productModel.findById(pid).select("quantity")
      : null;
    if (!product) {
      return res.status(404).send({ success: false, message: "Product not found" });
    }
    const filter = { user: req.user._id, product: product._id };
    if (await restockRequestModel.exists(filter)) {
      return res.status(200).send({ success: true, message: "We'll email you when it's back" });
    }
    if (product.quantity > 0) {
      return res.status(400).send({ success: false, message: "This product is in stock" });
    }
    if ((await restockRequestModel.countDocuments({ user: req.user._id })) >= MAX_RESTOCK_REQUESTS) {
      return res.status(400).send({
        success: false,
        message: `You're already waiting for ${MAX_RESTOCK_REQUESTS} products. Cancel one first.`,
      });
    }
    try {
      await restockRequestModel.create(filter);
    } catch (error) {
      // Asked twice at once: the unique index keeps one.
      if (error.code !== 11000) throw error;
    }
    res.status(201).send({ success: true, message: "We'll email you when it's back" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to set up the alert" });
  }
};

// DELETE /restock/:pid  : cancel it (cancelling a missing one is fine).
export const removeRestockRequestController = async (req, res) => {
  try {
    const { pid } = req.params;
    if (mongoose.isValidObjectId(pid)) {
      await restockRequestModel.deleteOne({ user: req.user._id, product: pid });
    }
    res.status(200).send({ success: true, message: "Alert cancelled" });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Unable to cancel the alert" });
  }
};

// The link's { u: user id, k: kind, t: token }, from the query string (the
// List-Unsubscribe header's URL) or the JSON body (the /unsubscribe page).
const linkParams = (req) => {
  const { u, k, t } = { ...req.query, ...(req.body && typeof req.body === "object" ? req.body : {}) };
  return { userId: u, kind: k, token: t };
};

// Turns one kind of alert on or off for the user named in a signed link.
const setFromLink = (subscribed) => async (req, res) => {
  try {
    const { userId, kind, token } = linkParams(req);
    if (!validUnsubscribeToken(userId, kind, token) || !mongoose.isValidObjectId(userId)) {
      return res.status(400).send({ success: false, message: "This link is invalid" });
    }
    const { pref, label } = ALERT_KINDS[kind];
    const user = await userModel.findByIdAndUpdate(userId, { $set: { [`alertPrefs.${pref}`]: subscribed } });
    if (!user) return res.status(400).send({ success: false, message: "This link is invalid" });
    res.status(200).send({
      success: true,
      kind,
      label,
      subscribed,
      message: subscribed ? `You'll get ${label} again` : `You won't get ${label} any more`,
    });
  } catch (error) {
    console.error(error);
    res.status(500).send({ success: false, message: "Something went wrong" });
  }
};

// POST /unsubscribe and /resubscribe  : no login, the signed link is enough.
export const unsubscribeController = setFromLink(false);
export const resubscribeController = setFromLink(true);
