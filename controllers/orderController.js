import mongoose from "mongoose";
import orderModel from "../models/orderModel.js";
import productModel from "../models/productModel.js";
import userModel from "../models/userModel.js";
import {
  createRazorpayOrder,
  isValidPaymentSignature,
  razorpayConfigured,
  razorpayKeyId,
  toPaise,
} from "../helpers/razorpay.js";
import {
  ADMIN_STATUSES,
  MAX_NOTE_LENGTH,
  cancellable,
  estimatedDelivery,
  historyEntry,
  nextStatus,
  previousStatuses,
  statusLabel,
} from "../helpers/orderStatus.js";
import { plainText } from "../helpers/plainText.js";
import { notifyOrderConfirmed, notifyOrderStatus } from "../helpers/orderNotifications.js";
import { productChanged } from "../helpers/productAlerts.js";
import {
  buildInvoicePdf,
  ensureInvoiceNumber,
  invoiceAvailable,
  invoiceFilename,
} from "../helpers/invoice.js";

const PAYMENT_METHODS = ["cod", "razorpay"];

// An order as sent to the browser, with the date it's expected to arrive.
const withTracking = (order) =>
  order && { ...order.toJSON(), estimatedDelivery: estimatedDelivery(order) };

// How long an unpaid online order holds its stock. Checkout closes itself five
// minutes earlier, so a payment can't start after its hold has been released.
const holdSeconds = () => Number(process.env.PAYMENT_HOLD_SECONDS) || 15 * 60;
const checkoutTimeoutSeconds = () => Math.max(60, holdSeconds() - 5 * 60);

// Returns items to stock. A product that was sold out is back in stock, so
// the people waiting for it are emailed (helpers/productAlerts.js).
const restock = (items) =>
  Promise.all(
    items.map(async (item) => {
      const before = await productModel
        .findOneAndUpdate({ _id: item.product }, { $inc: { quantity: item.quantity } })
        .select("price quantity");
      if (before) {
        productChanged(before._id, before, { price: before.price, quantity: before.quantity + item.quantity });
      }
    })
  );

// Atomically marks a matching order's stock as released and applies `update`,
// then returns its items to stock. The stockReleased guard means that however
// many paths race (popup closed, hold expired, admin cancel), stock comes back
// once. Returns the updated order, or null if nothing matched.
const releaseOrder = async (filter, update) => {
  const order = await orderModel.findOneAndUpdate(
    { ...filter, stockReleased: { $ne: true } },
    { ...update, stockReleased: true },
    { new: true }
  );
  if (order) await restock(order.items);
  return order;
};

// An unpaid online order that will never be paid (closed, expired, failed to start).
const cancelUnpaid = () => ({
  status: "cancelled",
  paymentStatus: "failed",
  $push: { statusHistory: historyEntry("cancelled") },
});
const unpaidOnline = { paymentMethod: "razorpay", paymentStatus: "pending" };

// Releases online orders whose payment window has passed. Run on a timer by server.js.
export const releaseExpiredPayments = async () => {
  const expired = await orderModel
    .find({ ...unpaidOnline, stockReleased: { $ne: true }, holdExpiresAt: { $lte: new Date() } })
    .select("_id");
  for (const { _id } of expired) {
    await releaseOrder(
      { _id, ...unpaidOnline, holdExpiresAt: { $lte: new Date() } },
      cancelUnpaid()
    );
  }
  return expired.length;
};

export const createOrderController = async (req, res) => {
  try {
    const { items, shippingAddress } = req.body;
    const paymentMethod = req.body.paymentMethod ?? "cod";
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).send({ success: false, message: "Invalid payment method" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).send({ success: false, message: "Cart is empty" });
    }
    if (!shippingAddress) {
      return res.status(400).send({
        success: false,
        message: "A shipping address is required",
      });
    }
    // Accounts created with Google start without these; delivery needs both.
    const buyer = await userModel.findById(req.user._id).select("phone address");
    if (!buyer?.phone || !buyer?.address) {
      return res.status(400).send({
        success: false,
        message: "Please add your phone number and address to your profile before checkout",
      });
    }
    if (paymentMethod === "razorpay" && !razorpayConfigured()) {
      return res.status(503).send({
        success: false,
        message: "Online payment is not available right now. Please choose Cash on Delivery.",
      });
    }

    // Merge duplicate lines so each product's stock is checked once, in total.
    const requested = new Map();
    for (const item of items) {
      if (!mongoose.isValidObjectId(item?.product)) {
        return res.status(400).send({ success: false, message: "Invalid product in cart" });
      }
      const quantity = Math.max(1, Math.floor(Number(item.quantity)) || 1);
      const id = String(item.product);
      requested.set(id, (requested.get(id) || 0) + quantity);
    }

    const products = await productModel
      .find({ _id: { $in: [...requested.keys()] } })
      .select("-photo");
    if (products.length !== requested.size) {
      return res.status(400).send({
        success: false,
        message: "One or more products are no longer available",
      });
    }
    // Prices always come from the database, never from the client.
    const orderItems = products.map((product) => ({
      product: product._id,
      name: product.name,
      price: product.price,
      quantity: requested.get(String(product._id)),
    }));
    const total = orderItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
    if (paymentMethod === "razorpay" && toPaise(total) < 100) {
      return res.status(400).send({
        success: false,
        message: "Online payment needs an order of at least ₹1",
      });
    }

    // Reserve stock with one conditional update per product, so two orders
    // can never both take the last unit. On any failure, return what was taken.
    // Online orders reserve here too, before checkout opens, so stock can't run
    // out while the shopper is paying; unpaid holds are released later.
    const reserved = [];
    let order;
    try {
      for (const item of orderItems) {
        const updated = await productModel.findOneAndUpdate(
          { _id: item.product, quantity: { $gte: item.quantity } },
          { $inc: { quantity: -item.quantity } },
          { projection: { _id: 1 } }
        );
        if (!updated) {
          await restock(reserved);
          return res.status(409).send({
            success: false,
            message: `${item.name} does not have enough stock`,
          });
        }
        reserved.push(item);
      }

      order = await orderModel.create({
        user: req.user._id,
        items: orderItems,
        total,
        shippingAddress,
        paymentMethod,
        paymentStatus: "pending",
        statusHistory: [historyEntry("placed")],
        ...(paymentMethod === "razorpay" && {
          holdExpiresAt: new Date(Date.now() + holdSeconds() * 1000),
        }),
      });
    } catch (error) {
      await restock(reserved);
      throw error;
    }

    if (paymentMethod === "cod") {
      notifyOrderConfirmed(order._id);
      return res.status(201).send({ success: true, message: "Order placed", order });
    }

    let razorpayOrder;
    try {
      razorpayOrder = await createRazorpayOrder({
        amount: toPaise(total),
        receipt: String(order._id),
        notes: { orderId: String(order._id) },
      });
    } catch (error) {
      console.log(error);
      await releaseOrder({ _id: order._id, ...unpaidOnline }, cancelUnpaid());
      return res.status(502).send({
        success: false,
        message: "Unable to start online payment. Please try again or choose Cash on Delivery.",
      });
    }
    order = await orderModel.findByIdAndUpdate(
      order._id,
      { razorpayOrderId: razorpayOrder.id },
      { new: true }
    );

    return res.status(201).send({
      success: true,
      message: "Order created, awaiting payment",
      order,
      payment: {
        keyId: razorpayKeyId(),
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        timeout: checkoutTimeoutSeconds(),
      },
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Unable to place order",
    });
  }
};

// Called by the client with the three values Razorpay Checkout returns.
// The order is marked paid only if the signature proves Razorpay issued them.
export const verifyPaymentController = async (req, res) => {
  try {
    const { orderId, razorpay_payment_id: paymentId, razorpay_signature: signature } = req.body;
    if (!mongoose.isValidObjectId(orderId)) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    const order = await orderModel.findOne({
      _id: orderId,
      user: req.user._id,
      paymentMethod: "razorpay",
    });
    if (!order || !order.razorpayOrderId) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    // Checked against the Razorpay order id we stored, not one the client sends.
    if (!isValidPaymentSignature(order.razorpayOrderId, paymentId, signature)) {
      return res.status(400).send({ success: false, message: "Payment verification failed" });
    }

    const paid = { paymentStatus: "paid", razorpayPaymentId: paymentId, paidAt: new Date() };
    const updated = await orderModel.findOneAndUpdate(
      { _id: order._id, paymentStatus: "pending", stockReleased: { $ne: true } },
      paid,
      { new: true }
    );
    if (updated) {
      // Only the request that actually marked it paid sends the confirmation.
      notifyOrderConfirmed(updated._id);
      return res.status(200).send({ success: true, message: "Payment successful", order: updated });
    }

    const current = await orderModel.findById(order._id);
    if (current.paymentStatus === "paid" && current.razorpayPaymentId === paymentId) {
      return res.status(200).send({ success: true, message: "Payment successful", order: current });
    }
    // The money arrived after the order was cancelled and its stock released.
    // Record it and flag a refund rather than taking stock that may be sold.
    const late = await orderModel.findOneAndUpdate(
      { _id: order._id, paymentStatus: { $ne: "paid" } },
      { ...paid, refundRequired: true },
      { new: true }
    );
    return res.status(409).send({
      success: false,
      message:
        "Your payment was received after this order was cancelled. It will be refunded.",
      order: late || current,
    });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ success: false, message: "Unable to verify payment" });
  }
};

// The shopper closed Checkout without paying: cancel the order and free its stock.
export const cancelPaymentController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    await releaseOrder({ _id: id, user: req.user._id, ...unpaidOnline }, cancelUnpaid());
    const order = await orderModel.findOne({ _id: id, user: req.user._id });
    if (!order) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    return res.status(200).send({ success: true, message: "Payment cancelled", order });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ success: false, message: "Unable to cancel payment" });
  }
};

export const getMyOrdersController = async (req, res) => {
  try {
    const orders = await orderModel
      .find({ user: req.user._id })
      .populate("items.product", "slug")
      .sort({ createdAt: -1 });
    return res.status(200).send({ success: true, orders: orders.map(withTracking) });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Unable to load orders",
    });
  }
};

// One of the signed-in customer's own orders, for the order details page.
// Someone else's order looks the same as a missing one.
export const getMyOrderController = async (req, res) => {
  try {
    const { id } = req.params;
    const order = mongoose.isValidObjectId(id)
      ? await orderModel
          .findOne({ _id: id, user: req.user._id })
          .populate("items.product", "name slug images")
      : null;
    if (!order) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    return res.status(200).send({ success: true, order: withTracking(order) });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ success: false, message: "Unable to load the order" });
  }
};

// ADMIN: every order, newest first, with the buyer's name and email.
export const getAllOrdersController = async (req, res) => {
  try {
    const orders = await orderModel
      .find({})
      .populate("user", "name email")
      .sort({ createdAt: -1 });
    return res.status(200).send({ success: true, orders: orders.map(withTracking) });
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Unable to load orders",
    });
  }
};

// ADMIN: move an order to its next tracking step, or cancel it, with an
// optional tracking note (e.g. courier and tracking number) that the customer
// sees on the timeline. Orders only move forward, one step at a time, and
// online orders only once paid. Cancelling returns the items to stock; a
// cancelled order can't be reopened (its stock has been released) and a
// delivered one can't be cancelled. Sending the current status with a note
// changes that step's note (an empty note removes it) without emailing anyone.
export const updateOrderStatusController = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!ADMIN_STATUSES.includes(status)) {
      return res.status(400).send({ success: false, message: "Invalid order status" });
    }
    let note;
    if (req.body.note !== undefined && req.body.note !== null) {
      if (typeof req.body.note !== "string") {
        return res.status(400).send({ success: false, message: "Invalid tracking note" });
      }
      note = plainText(req.body.note);
      if (note.length > MAX_NOTE_LENGTH) {
        return res.status(400).send({
          success: false,
          message: `Tracking notes can be at most ${MAX_NOTE_LENGTH} characters`,
        });
      }
    }
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    const existing = await orderModel.findById(id);
    if (!existing) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    const respond = async (message) => {
      const order = await orderModel.findById(id).populate("user", "name email");
      return res.status(200).send({ success: true, message, order: withTracking(order) });
    };
    const conflict = (message) => res.status(409).send({ success: false, message });

    // Same status: nothing is recorded and no email goes out; only the
    // current step's note can change.
    if (existing.status === status) {
      if (note === undefined) return respond("Order status unchanged");
      const index = existing.statusHistory.map((h) => h.status).lastIndexOf(status);
      if (index === -1) return conflict("This order has no tracking history to add a note to");
      const path = `statusHistory.${index}.note`;
      await orderModel.updateOne(
        { _id: id, status, [`statusHistory.${index}.status`]: status },
        note ? { $set: { [path]: note } } : { $unset: { [path]: "" } }
      );
      return respond("Tracking note updated");
    }
    const changed = { status, $push: { statusHistory: historyEntry(status, new Date(), note) } };

    if (status === "cancelled") {
      if (!cancellable(existing.status)) return conflict("Delivered orders can't be cancelled");
      const cancelled = await releaseOrder(
        { _id: id, status: { $nin: ["cancelled", "delivered"] } },
        changed
      );
      if (!cancelled) {
        // Cancelled or delivered by another request in the meantime.
        const current = await orderModel.findById(id).select("status");
        if (current?.status !== "cancelled") return conflict("Delivered orders can't be cancelled");
        return respond("Order status unchanged");
      }
      // An online order cancelled before payment will never be paid; one
      // cancelled after payment needs its money back.
      await orderModel.updateOne({ _id: id, ...unpaidOnline }, { paymentStatus: "failed" });
      await orderModel.updateOne(
        { _id: id, paymentMethod: "razorpay", paymentStatus: "paid" },
        { refundRequired: true }
      );
      notifyOrderStatus(id, status);
      return respond("Order status updated");
    }

    if (existing.status === "cancelled") return conflict("Cancelled orders can't be reopened");
    if (existing.paymentMethod === "razorpay" && existing.paymentStatus !== "paid") {
      return conflict("This order hasn't been paid online yet");
    }
    const expected = nextStatus(existing.status);
    if (status !== expected) {
      return conflict(
        expected
          ? `Orders move forward one step at a time: the next step is ${statusLabel(expected)}`
          : "Delivered orders can't change status"
      );
    }
    // Only from the step before, so a status changed in the meantime is never overwritten.
    const updated = await orderModel.findOneAndUpdate(
      { _id: id, status: { $in: previousStatuses(status) } },
      changed
    );
    if (!updated) {
      const current = await orderModel.findById(id).select("status");
      if (current?.status === status) return respond("Order status unchanged");
      return conflict("This order was changed in the meantime. Reload and try again.");
    }
    notifyOrderStatus(id, status);
    return respond("Order status updated");
  } catch (error) {
    console.log(error);
    return res.status(500).send({
      success: false,
      message: "Unable to update order status",
    });
  }
};

// ADMIN: record the cash collected for a delivered Cash on Delivery order.
export const markOrderPaidController = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    const updated = await orderModel
      .findOneAndUpdate(
        { _id: id, paymentMethod: "cod", paymentStatus: "pending", status: "delivered" },
        { paymentStatus: "paid", paidAt: new Date() },
        { new: true }
      )
      .populate("user", "name email");
    if (updated) {
      return res
        .status(200)
        .send({ success: true, message: "Order marked as paid", order: withTracking(updated) });
    }

    const existing = await orderModel.findById(id);
    if (!existing) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    const message =
      existing.paymentMethod !== "cod"
        ? "Only Cash on Delivery orders can be marked as paid"
        : existing.paymentStatus === "paid"
        ? "This order is already paid"
        : "Mark the order as delivered first";
    return res.status(409).send({ success: false, message });
  } catch (error) {
    console.log(error);
    return res.status(500).send({ success: false, message: "Unable to mark order as paid" });
  }
};

// The invoice PDF for an order: the customer's own orders, or any order for
// an admin. Someone else's order looks the same as a missing one.
export const downloadInvoiceController = async (req, res) => {
  try {
    const { id } = req.params;
    const order = mongoose.isValidObjectId(id)
      ? await orderModel.findById(id).populate("user", "name email phone")
      : null;
    const own = order && String(order.user?._id) === String(req.user._id);
    const admin = order && !own && (await userModel.exists({ _id: req.user._id, role: 1 }));
    if (!own && !admin) {
      return res.status(404).send({ success: false, message: "Order not found" });
    }
    if (!invoiceAvailable(order)) {
      return res.status(409).send({
        success: false,
        message: "The invoice is available once the order is paid",
      });
    }
    // Orders confirmed before invoices existed get their number now.
    const invoiced = await ensureInvoiceNumber(order);
    const pdf = await buildInvoicePdf(invoiced, order.user);
    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${invoiceFilename(invoiced)}"`,
      "Cache-Control": "private, no-store",
    });
    return res.status(200).send(pdf);
  } catch (error) {
    console.log(error);
    return res.status(500).send({ success: false, message: "Unable to create the invoice" });
  }
};
