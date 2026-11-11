// Price-drop and back-in-stock emails. productChanged() is called after a
// product's price or stock changes and returns at once; the alerts are queued
// (models/alertModel.js) and sent in small batches in the background, so
// saving a product is never slowed down, and failures are only logged.
//
// Rules: price drops go to wishlist users when the price falls below both the
// price they saved it at and the price in their last price-drop email (so the
// same drop is never sent twice). Back in stock (0 -> more than 0) goes to
// everyone who asked ("Notify me", used once) and to wishlist users. Each
// customer gets at most one alert per product per 24 hours: a later one waits
// and is checked again before it goes out. Gmail allows about 500 emails a
// day, so alerts stop at ALERT_DAILY_LIMIT and the rest wait.
import alertModel from "../models/alertModel.js";
import productModel from "../models/productModel.js";
import restockRequestModel from "../models/restockRequestModel.js";
import userModel from "../models/userModel.js";
import wishlistModel from "../models/wishlistModel.js";
import { ALERT_KINDS, alertsOn, unsubscribeToken } from "./alertTokens.js";
import { backInStockEmail, priceDropEmail, storeUrl } from "./emailTemplates.js";
import { apiOrigin } from "./clientUrl.js";
import { emailConfigured, sendInBackground, sendMail } from "./mailer.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RETRY_MS = 15 * 60 * 1000;
export const MAX_ATTEMPTS = 3;

const setting = (name, fallback) => {
  const value = Number(process.env[name]);
  return process.env[name] !== undefined && process.env[name] !== "" && Number.isFinite(value) && value >= 0
    ? value
    : fallback;
};
const batchSize = () => Math.max(1, setting("ALERT_BATCH_SIZE", 20));
const batchPauseMs = () => setting("ALERT_BATCH_PAUSE_SECONDS", 5) * 1000;
const dailyLimit = () => setting("ALERT_DAILY_LIMIT", 300);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// --- Queueing ----------------------------------------------------------------

// One pending alert per user, product and kind: a newer change updates it.
const queue = async (userIds, productId, kind, fields = {}) => {
  if (!userIds.length) return 0;
  try {
    await alertModel.bulkWrite(
      userIds.map((user) => ({
        updateOne: {
          filter: { user, product: productId, kind, status: "pending" },
          update: { $set: { ...fields, attempts: 0 }, $setOnInsert: { sendAfter: new Date() } },
          upsert: true,
        },
      })),
      { ordered: false }
    );
  } catch (error) {
    // Queued twice at once: the unique index keeps one pending alert.
    if (error.code !== 11000 && !error.writeErrors?.every((e) => e.code === 11000)) throw error;
  }
  return userIds.length;
};

// Of these users, those who get this kind of alert.
const subscribed = async (userIds, kind) => {
  const users = await userModel
    .find({ _id: { $in: userIds }, [`alertPrefs.${ALERT_KINDS[kind].pref}`]: { $ne: false } })
    .select("_id");
  return users.map((user) => user._id);
};

const queuePriceDrops = async (productId, oldPrice, newPrice) => {
  const items = await wishlistModel
    .find({
      product: productId,
      priceWhenAdded: { $gt: newPrice },
      $or: [{ lastAlertedPrice: null }, { lastAlertedPrice: { $gt: newPrice } }],
    })
    .select("user");
  const users = await subscribed(items.map((item) => item.user), "price_drop");
  return queue(users, productId, "price_drop", { oldPrice, newPrice });
};

const queueBackInStock = async (productId) => {
  const [requests, items] = await Promise.all([
    restockRequestModel.find({ product: productId }).select("user"),
    wishlistModel.find({ product: productId }).select("user"),
  ]);
  const watchers = [...new Map([...requests, ...items].map((r) => [String(r.user), r.user])).values()];
  return queue(await subscribed(watchers, "back_in_stock"), productId, "back_in_stock");
};

// Call after a product's price or stock changed, with { price, quantity }
// before and after. Returns at once; does nothing unless the price fell or
// the stock went from 0 to more than 0.
export const productChanged = (productId, before, after) => {
  const priceDropped = Number(after.price) < Number(before.price);
  const restocked = !(Number(before.quantity) > 0) && Number(after.quantity) > 0;
  if (!priceDropped && !restocked) return;
  sendInBackground(`alerts for product ${productId}`, async () => {
    if (!emailConfigured()) {
      console.log(`Email not configured; no alerts for product ${productId}`);
      return;
    }
    let queued = 0;
    if (priceDropped) queued += await queuePriceDrops(productId, Number(before.price), Number(after.price));
    if (restocked) queued += await queueBackInStock(productId);
    if (queued) processAlertQueue();
  });
};

// --- Sending -------------------------------------------------------------------

const unsubscribeParams = (userId, kind) =>
  new URLSearchParams({ u: String(userId), k: kind, t: unsubscribeToken(String(userId), kind) }).toString();

// The /unsubscribe page for the email's link, and the API address for mail
// apps' one-click unsubscribe (List-Unsubscribe with List-Unsubscribe-Post).
const unsubscribeLinks = (userId, kind) => {
  const params = unsubscribeParams(userId, kind);
  return {
    page: storeUrl(`/unsubscribe?${params}`),
    oneClick: `${apiOrigin()}/api/v1/alerts/unsubscribe?${params}`,
  };
};

const finish = (id, status, note = "", extra = {}) =>
  alertModel.updateOne({ _id: id }, { $set: { status, note, finishedAt: new Date(), ...extra } });

// Price drop: decide and claim the price. The claim (setting lastAlertedPrice
// only if it's still higher) is what makes the same drop go out once.
// Returns { email, undo } or { skip }.
const preparePriceDrop = async (alert, user, product, links) => {
  const item = await wishlistModel.findOne({ user: user._id, product: product._id });
  if (!item) return { skip: "no longer on the wishlist" };
  const price = product.price;
  const claimed = await wishlistModel.findOneAndUpdate(
    {
      _id: item._id,
      priceWhenAdded: { $gt: price },
      $or: [{ lastAlertedPrice: null }, { lastAlertedPrice: { $gt: price } }],
    },
    { $set: { lastAlertedPrice: price } }
  );
  if (!claimed) return { skip: "price is no longer lower" };
  return {
    email: priceDropEmail(user, product, {
      oldPrice: claimed.priceWhenAdded,
      newPrice: price,
      unsubscribeUrl: links.page,
    }),
    undo: () =>
      wishlistModel.updateOne(
        { _id: item._id, lastAlertedPrice: price },
        claimed.lastAlertedPrice == null
          ? { $unset: { lastAlertedPrice: 1 } }
          : { $set: { lastAlertedPrice: claimed.lastAlertedPrice } }
      ),
  };
};

// Back in stock: only while it is, and only to people still watching it.
const prepareBackInStock = async (alert, user, product, links) => {
  if (!(product.quantity > 0)) return { skip: "out of stock again" };
  const [requested, wishlisted] = await Promise.all([
    restockRequestModel.exists({ user: user._id, product: product._id }),
    wishlistModel.exists({ user: user._id, product: product._id }),
  ]);
  if (!requested && !wishlisted) return { skip: "no longer watching" };
  return {
    email: backInStockEmail(user, product, { requested: Boolean(requested), unsubscribeUrl: links.page }),
    // The "Notify me" request has been used.
    done: () => restockRequestModel.deleteOne({ user: user._id, product: product._id }),
  };
};

// Sends one alert. Returns "sent", "skipped", "waiting" or "failed".
const deliver = async (alertId) => {
  const alert = await alertModel.findOneAndUpdate(
    { _id: alertId, status: "pending" },
    { $set: { status: "sending" } },
    { new: true }
  );
  if (!alert) return "skipped";
  const [user, product] = await Promise.all([
    userModel.findById(alert.user).select("name email alertPrefs"),
    productModel.findById(alert.product).select("-photo"),
  ]);
  if (!user?.email || !product) {
    await finish(alert._id, "skipped", "user or product no longer exists");
    return "skipped";
  }
  if (!alertsOn(user, alert.kind)) {
    await finish(alert._id, "skipped", "turned off by the customer");
    return "skipped";
  }
  // At most one alert per product per customer per 24 hours: wait until then
  // (it's checked again before it goes out).
  const recent = await alertModel
    .findOne({ user: user._id, product: product._id, status: "sent", sentAt: { $gt: new Date(Date.now() - DAY_MS) } })
    .sort({ sentAt: -1 })
    .select("sentAt");
  if (recent) {
    await alertModel.updateOne(
      { _id: alert._id },
      { $set: { status: "pending", sendAfter: new Date(recent.sentAt.getTime() + DAY_MS), note: "waiting: one alert a day" } }
    );
    return "waiting";
  }

  const links = unsubscribeLinks(user._id, alert.kind);
  const prepare = alert.kind === "price_drop" ? preparePriceDrop : prepareBackInStock;
  const { email, skip, undo, done } = await prepare(alert, user, product, links);
  if (skip) {
    await finish(alert._id, "skipped", skip);
    return "skipped";
  }
  try {
    const sent = await sendMail({
      to: user.email,
      ...email,
      list: { unsubscribe: links.oneClick },
      headers: { "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" },
    });
    if (!sent) throw new Error("email is not configured");
  } catch (error) {
    await undo?.();
    const attempts = alert.attempts + 1;
    console.log(`Alert email failed (${alert.kind} ${alert._id}, attempt ${attempts}/${MAX_ATTEMPTS}): ${error.message}`);
    if (attempts >= MAX_ATTEMPTS) {
      await finish(alert._id, "failed", error.message.slice(0, 200), { attempts });
    } else {
      await alertModel.updateOne(
        { _id: alert._id },
        { $set: { status: "pending", attempts, sendAfter: new Date(Date.now() + attempts * RETRY_MS), note: error.message.slice(0, 200) } }
      );
    }
    return "failed";
  }
  await finish(alert._id, "sent", "", { sentAt: new Date() });
  await done?.();
  return "sent";
};

// Sends due alerts in batches of ALERT_BATCH_SIZE, pausing between batches,
// until none are due or today's ALERT_DAILY_LIMIT is reached.
const drainQueue = async () => {
  if (!emailConfigured()) return;
  // A send cut off by a restart may or may not have gone out: never resend it.
  await alertModel.updateMany(
    { status: "sending", updatedAt: { $lt: new Date(Date.now() - 10 * 60 * 1000) } },
    { $set: { status: "failed", note: "interrupted", finishedAt: new Date() } }
  );
  for (;;) {
    const sentToday = await alertModel.countDocuments({ status: "sent", sentAt: { $gt: new Date(Date.now() - DAY_MS) } });
    const room = dailyLimit() - sentToday;
    if (room <= 0) {
      const waiting = await alertModel.countDocuments({ status: "pending", sendAfter: { $lte: new Date() } });
      if (waiting) console.log(`Alert emails: daily limit of ${dailyLimit()} reached; ${waiting} waiting`);
      return;
    }
    const due = await alertModel
      .find({ status: "pending", sendAfter: { $lte: new Date() } })
      .sort({ sendAfter: 1, _id: 1 })
      .limit(Math.min(batchSize(), room))
      .select("_id");
    if (!due.length) return;
    const counts = { sent: 0, skipped: 0, waiting: 0, failed: 0 };
    for (const { _id } of due) counts[await deliver(_id)]++;
    console.log(`Alert emails: ${counts.sent} sent, ${counts.skipped} skipped, ${counts.waiting} waiting, ${counts.failed} failed`);
    if (due.length < batchSize()) return;
    await sleep(batchPauseMs());
  }
};

// Starts sending if it isn't already running (one sender per server). Called
// after alerts are queued, and on a timer by server.js for alerts that had to
// wait (retries, the one-a-day rule, the daily limit).
let running = false;
let again = false;
export const processAlertQueue = () => {
  if (running) {
    again = true;
    return;
  }
  running = true;
  (async () => {
    try {
      do {
        again = false;
        await drainQueue();
      } while (again);
    } catch (error) {
      console.log(`Alert emails: ${error.message}`);
    } finally {
      running = false;
    }
  })();
};
