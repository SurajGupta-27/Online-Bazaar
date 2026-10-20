import PDFDocument from "pdfkit";
import orderModel from "../models/orderModel.js";
import { nextSequence } from "../models/counterModel.js";
import { BRAND } from "./brand.js";
import { PAYMENT_METHOD_LABEL, PAYMENT_STATUS_LABEL, statusLabel } from "./orderStatus.js";

const TIME_ZONE = "Asia/Kolkata";

// An order gets an invoice once it's confirmed: Cash on Delivery orders when
// placed, online orders once paid. Unpaid online orders never get one.
export const invoiceAvailable = (order) =>
  order.paymentMethod === "cod" || order.paymentStatus === "paid";

const yearIn = (date) =>
  Number(new Intl.DateTimeFormat("en-IN", { timeZone: TIME_ZONE, year: "numeric" }).format(date));

// Gives a confirmed order its invoice number ("INV-2026-000001") if it has
// none yet, and returns the order. Returns null for unconfirmed orders.
export const ensureInvoiceNumber = async (order) => {
  if (order.invoiceNumber) return order;
  if (!invoiceAvailable(order)) return null;
  const invoicedAt = new Date();
  const year = yearIn(invoicedAt);
  const seq = await nextSequence(`invoice-${year}`);
  const invoiceNumber = `INV-${year}-${String(seq).padStart(6, "0")}`;
  const updated = await orderModel.findOneAndUpdate(
    { _id: order._id, invoiceNumber: { $exists: false } },
    { $set: { invoiceNumber, invoicedAt } },
    { new: true }
  );
  // Numbered by a simultaneous request in the meantime: use that number.
  return updated || orderModel.findById(order._id);
};

// The PDF's built-in Helvetica only has Western European characters: map
// common typographic ones and replace anything else, rather than print garbage.
const pdfSafe = (value) =>
  String(value ?? "")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/…/g, "...")
    .replace(/₹\s*/g, "Rs. ")
    .replace(/[^\n\x20-\x7E\xA0-\xFF]/g, "?");

const money = (amount) =>
  `Rs. ${(Number(amount) || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

const formatDate = (date) =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        timeZone: TIME_ZONE,
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "-";

export const shortOrderId = (order) => String(order._id).slice(-8).toUpperCase();

const INK = "#0f172a";
const MUTED = "#64748b";
const RULE = "#e2e8f0";
const PRIMARY = "#1e3a8a";

// The invoice PDF for an order (with `invoiceNumber`) and its customer.
// `compress: false` keeps the text searchable by the tests; invoices are small.
export const buildInvoicePdf = (order, customer) =>
  new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "A4",
      margin: 50,
      compress: false,
      info: {
        Title: `Invoice ${order.invoiceNumber}`,
        Author: BRAND.name,
      },
    });
    const chunks = [];
    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);

    const left = doc.page.margins.left;
    const right = doc.page.width - doc.page.margins.right;
    const width = right - left;

    // Header: brand on the left, "INVOICE" and its number on the right.
    doc.fillColor(PRIMARY).font("Helvetica-Bold").fontSize(22).text(BRAND.name, left, 50);
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(pdfSafe(BRAND.tagline));
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(16).text("INVOICE", left, 50, { width, align: "right" });
    doc.font("Helvetica").fontSize(10).text(order.invoiceNumber, { width, align: "right" });

    doc.moveTo(left, 100).lineTo(right, 100).strokeColor(RULE).lineWidth(1).stroke();

    // Invoice details and customer, in two columns.
    const column = width / 2;
    const label = (text, x, y) => doc.fillColor(MUTED).font("Helvetica").fontSize(9).text(text, x, y);
    const value = (text, x, opts = {}) =>
      doc.fillColor(INK).font("Helvetica").fontSize(10).text(pdfSafe(text), x, undefined, { width: column - 10, ...opts });

    let y = 115;
    label("Invoice number", left, y);
    value(order.invoiceNumber, left);
    label("Invoice date", left, doc.y + 6);
    value(formatDate(order.invoicedAt || order.createdAt), left);
    label("Order", left, doc.y + 6);
    value(`#${shortOrderId(order)} (placed ${formatDate(order.createdAt)})`, left);
    label("Order status", left, doc.y + 6);
    value(statusLabel(order.status), left);
    const leftEnd = doc.y;

    label("Billed to", left + column, y);
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(10)
      .text(pdfSafe(customer?.name || "Customer"), left + column, undefined, { width: column });
    if (customer?.email) value(customer.email, left + column);
    if (customer?.phone) value(customer.phone, left + column);
    label("Ship to", left + column, doc.y + 6);
    value(order.shippingAddress, left + column);
    y = Math.max(leftEnd, doc.y) + 25;

    // Items table.
    const cols = [
      { title: "#", x: left, w: 25, align: "left" },
      { title: "Item", x: left + 25, w: width - 25 - 45 - 95 - 95, align: "left" },
      { title: "Qty", x: right - 235, w: 45, align: "right" },
      { title: "Unit price", x: right - 190, w: 95, align: "right" },
      { title: "Amount", x: right - 95, w: 95, align: "right" },
    ];
    const header = () => {
      doc.rect(left, y, width, 22).fill("#f1f5f9");
      doc.fillColor(MUTED).font("Helvetica-Bold").fontSize(9);
      cols.forEach((c) => doc.text(c.title, c.x + 4, y + 7, { width: c.w - 8, align: c.align }));
      y += 28;
    };
    header();
    order.items.forEach((item, index) => {
      const cells = [
        String(index + 1),
        pdfSafe(item.name),
        String(item.quantity),
        money(item.price),
        money(item.price * item.quantity),
      ];
      doc.font("Helvetica").fontSize(10);
      const rowHeight = Math.max(...cells.map((text, i) => doc.heightOfString(text, { width: cols[i].w - 8 })));
      if (y + rowHeight > doc.page.height - 150) {
        doc.addPage();
        y = 50;
        header();
        doc.font("Helvetica").fontSize(10);
      }
      doc.fillColor(INK);
      cells.forEach((text, i) => doc.text(text, cols[i].x + 4, y, { width: cols[i].w - 8, align: cols[i].align }));
      y += rowHeight + 8;
      doc.moveTo(left, y - 4).lineTo(right, y - 4).strokeColor(RULE).lineWidth(0.5).stroke();
    });

    // Total and payment need ~120pt above the footer; start a page if not.
    if (y > doc.page.height - 230) {
      doc.addPage();
      y = 50;
    }
    // Total.
    y += 6;
    doc.fillColor(INK).font("Helvetica-Bold").fontSize(12)
      .text("Total", right - 235, y, { width: 140, align: "right" })
      .text(money(order.total), right - 95, y, { width: 91, align: "right" });
    y += 30;

    // Payment.
    doc.fillColor(MUTED).font("Helvetica").fontSize(9).text("Payment", left, y);
    doc.fillColor(INK).fontSize(10)
      .text(`${PAYMENT_METHOD_LABEL[order.paymentMethod] || order.paymentMethod} - ${PAYMENT_STATUS_LABEL[order.paymentStatus] || order.paymentStatus}`, left, undefined, { width });
    if (order.paidAt && order.paymentStatus === "paid") {
      doc.text(`Paid on ${formatDate(order.paidAt)}`, { width });
    }
    if (order.razorpayPaymentId) doc.text(`Payment ID: ${pdfSafe(order.razorpayPaymentId)}`, { width });
    if (order.paymentMethod === "cod" && order.paymentStatus !== "paid" && order.status !== "cancelled") {
      doc.text(`Amount due on delivery: ${money(order.total)}`, { width });
    }
    if (order.status === "cancelled") {
      doc.fillColor("#dc2626").text(
        order.refundRequired || order.paymentStatus === "paid"
          ? "This order was cancelled. The amount paid will be refunded."
          : "This order was cancelled. Nothing is due.",
        { width }
      );
    }

    // Footer, kept inside the bottom margin so PDFKit doesn't start a new page.
    const footerY = doc.page.height - 100;
    doc.moveTo(left, footerY).lineTo(right, footerY).strokeColor(RULE).lineWidth(1).stroke();
    doc.fillColor(MUTED).font("Helvetica").fontSize(9)
      .text(`Thank you for shopping with ${BRAND.name}.`, left, footerY + 10, { width, align: "center" })
      .text("This is a computer-generated invoice and needs no signature.", { width, align: "center" })
      .text(`${BRAND.name} by ${BRAND.owner}`, { width, align: "center" });

    doc.end();
  });

export const invoiceFilename = (order) => `${order.invoiceNumber}.pdf`;
