import orderModel from "../models/orderModel.js";
import productModel from "../models/productModel.js";
import userModel from "../models/userModel.js";

export const TIME_ZONE = "Asia/Kolkata";
export const LOW_STOCK_LIMIT = 5;
const DAYS = 30;
const STATUSES = ["placed", "processing", "shipped", "delivered", "cancelled"];

// Definitions used throughout (orders saved before payments existed have no
// paymentMethod or paymentStatus and count as unpaid Cash on Delivery):
// - a *sale* is an order that isn't cancelled and is either Cash on Delivery
//   or paid online. Online orders still waiting for payment are not sales.
// - *revenue* is money received: paid sales. Cancelled orders never count.
// - *unpaid COD* is sales whose cash hasn't been collected yet.
const notCancelled = { status: { $ne: "cancelled" } };
const isCod = { paymentMethod: { $ne: "razorpay" } };
const SALE = { ...notCancelled, $or: [isCod, { paymentStatus: "paid" }] };
const isPaid = { $eq: ["$paymentStatus", "paid"] };
const sumIf = (condition, value = "$total") => ({ $sum: { $cond: [condition, value, 0] } });

// "2026-10-20" for a date, in India time.
const dayKey = (date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);

// The last 30 days, oldest first, ending today (India time), and the instant
// the first of them began. India has no daylight saving: always UTC+5:30.
const lastDays = (now = new Date()) => {
  const [y, m, d] = dayKey(now).split("-").map(Number);
  const days = Array.from({ length: DAYS }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d - (DAYS - 1 - i))).toISOString().slice(0, 10)
  );
  const start = new Date(Date.UTC(y, m - 1, d - (DAYS - 1)) - 5.5 * 60 * 60 * 1000);
  return { days, start };
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// GET /dashboard (admin): everything the analytics page shows, computed here.
export const dashboardController = async (req, res) => {
  try {
    const { days, start } = lastDays();
    const [totals, daily, topProducts, byCategory, payments, statuses, customers, buyers, lowStock, lowStockCount] =
      await Promise.all([
        orderModel.aggregate([
          {
            $group: {
              _id: null,
              sales: sumIf({ $and: [{ $ne: ["$status", "cancelled"] }, { $or: [{ $ne: ["$paymentMethod", "razorpay"] }, isPaid] }] }, 1),
              revenue: sumIf({ $and: [{ $ne: ["$status", "cancelled"] }, isPaid] }),
              paidOrders: sumIf({ $and: [{ $ne: ["$status", "cancelled"] }, isPaid] }, 1),
              unpaidCod: sumIf({ $and: [{ $ne: ["$status", "cancelled"] }, { $ne: ["$paymentMethod", "razorpay"] }, { $not: [isPaid] }] }),
              unpaidCodOrders: sumIf({ $and: [{ $ne: ["$status", "cancelled"] }, { $ne: ["$paymentMethod", "razorpay"] }, { $not: [isPaid] }] }, 1),
              cancelledOrders: sumIf({ $eq: ["$status", "cancelled"] }, 1),
            },
          },
        ]),
        orderModel.aggregate([
          { $match: { ...SALE, createdAt: { $gte: start } } },
          {
            $group: {
              _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIME_ZONE } },
              revenue: sumIf(isPaid),
              unpaidCod: sumIf({ $not: [isPaid] }),
              orders: { $sum: 1 },
            },
          },
        ]),
        orderModel.aggregate([
          { $match: SALE },
          { $unwind: "$items" },
          {
            $group: {
              _id: "$items.product",
              name: { $last: "$items.name" },
              units: { $sum: "$items.quantity" },
              sales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
            },
          },
          { $sort: { units: -1, sales: -1, _id: 1 } },
          { $limit: 5 },
          { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "product", pipeline: [{ $project: { name: 1, slug: 1 } }] } },
          { $project: { units: 1, sales: 1, name: { $ifNull: [{ $first: "$product.name" }, "$name"] }, slug: { $first: "$product.slug" } } },
        ]),
        orderModel.aggregate([
          { $match: SALE },
          { $unwind: "$items" },
          { $lookup: { from: "products", localField: "items.product", foreignField: "_id", as: "product", pipeline: [{ $project: { category: 1 } }] } },
          { $lookup: { from: "categories", localField: "product.category", foreignField: "_id", as: "category", pipeline: [{ $project: { name: 1 } }] } },
          {
            $group: {
              _id: { $first: "$category._id" },
              name: { $first: { $first: "$category.name" } },
              units: { $sum: "$items.quantity" },
              sales: { $sum: { $multiply: ["$items.price", "$items.quantity"] } },
            },
          },
          { $sort: { sales: -1, _id: 1 } },
        ]),
        orderModel.aggregate([
          { $match: SALE },
          {
            $group: {
              _id: { $cond: [{ $eq: ["$paymentMethod", "razorpay"] }, "razorpay", "cod"] },
              orders: { $sum: 1 },
              value: { $sum: "$total" },
            },
          },
        ]),
        // Online orders still at checkout aren't orders yet.
        orderModel.aggregate([
          { $match: { $nor: [{ paymentMethod: "razorpay", paymentStatus: "pending", status: { $ne: "cancelled" } }] } },
          { $group: { _id: { $ifNull: ["$status", "placed"] }, orders: { $sum: 1 } } },
        ]),
        userModel.countDocuments({ role: { $ne: 1 } }),
        orderModel.distinct("user", SALE),
        productModel
          .find({ quantity: { $lte: LOW_STOCK_LIMIT } })
          .select("name slug quantity price category")
          .populate("category", "name")
          .sort({ quantity: 1, name: 1 })
          .limit(50),
        productModel.countDocuments({ quantity: { $lte: LOW_STOCK_LIMIT } }),
      ]);

    const t = totals[0] || {};
    const sales = t.sales || 0;
    const grossValue = (t.revenue || 0) + (t.unpaidCod || 0);
    const perDay = new Map(daily.map((d) => [d._id, d]));
    const paymentOf = (method) => payments.find((p) => p._id === method) || { orders: 0, value: 0 };
    const statusCount = new Map(statuses.map((s) => [s._id, s.orders]));

    res.status(200).send({
      success: true,
      generatedAt: new Date(),
      timeZone: TIME_ZONE,
      summary: {
        revenue: round2(t.revenue),
        paidOrders: t.paidOrders || 0,
        unpaidCod: round2(t.unpaidCod),
        unpaidCodOrders: t.unpaidCodOrders || 0,
        orders: sales,
        cancelledOrders: t.cancelledOrders || 0,
        customers,
        customersWithOrders: buyers.length,
        // Over every sale, paid or awaiting cash.
        averageOrderValue: sales ? round2(grossValue / sales) : 0,
      },
      daily: days.map((date) => {
        const d = perDay.get(date);
        return { date, revenue: round2(d?.revenue), unpaidCod: round2(d?.unpaidCod), orders: d?.orders || 0 };
      }),
      topProducts: topProducts.map((p) => ({ _id: p._id, name: p.name, slug: p.slug || null, units: p.units, sales: round2(p.sales) })),
      salesByCategory: byCategory.map((c) => ({ _id: c._id || null, name: c.name || "Uncategorised", units: c.units, sales: round2(c.sales) })),
      paymentSplit: ["cod", "razorpay"].map((method) => ({
        method,
        orders: paymentOf(method).orders,
        value: round2(paymentOf(method).value),
      })),
      statusBreakdown: STATUSES.map((status) => ({ status, orders: statusCount.get(status) || 0 })),
      lowStock: {
        limit: LOW_STOCK_LIMIT,
        total: lowStockCount,
        products: lowStock.map((p) => ({
          _id: p._id,
          name: p.name,
          slug: p.slug,
          quantity: p.quantity,
          price: p.price,
          category: p.category?.name || null,
        })),
      },
    });
  } catch (error) {
    console.log(error);
    res.status(500).send({ success: false, message: "Unable to load analytics" });
  }
};
