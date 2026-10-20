// Customer emails about orders. Each function returns immediately: the work
// runs after the response (sendInBackground), so email can never slow down
// or break checkout or the admin panel; failures are only logged.
import orderModel from "../models/orderModel.js";
import { buildInvoicePdf, ensureInvoiceNumber, invoiceFilename } from "./invoice.js";
import { orderConfirmationEmail, orderStatusEmail } from "./emailTemplates.js";
import { sendInBackground, sendMail } from "./mailer.js";
import { emailsOnStatus } from "./orderStatus.js";

const loadOrder = (orderId) => orderModel.findById(orderId).populate("user", "name email phone");

// Order confirmed (COD placed, or online payment verified): issue the invoice
// number and email the confirmation with the invoice PDF attached.
export const notifyOrderConfirmed = (orderId) =>
  sendInBackground(`confirmation for order ${orderId}`, async () => {
    const loaded = await loadOrder(orderId);
    const order = loaded && (await ensureInvoiceNumber(loaded));
    if (!order || !loaded.user?.email) return;
    const customer = loaded.user;
    const pdf = await buildInvoicePdf(order, customer);
    const email = orderConfirmationEmail(order, customer);
    await sendMail({
      to: customer.email,
      ...email,
      attachments: [{ filename: invoiceFilename(order), content: pdf, contentType: "application/pdf" }],
    });
  });

// The admin changed the order's status: email the customer if that status
// is one they hear about (helpers/orderStatus.js).
export const notifyOrderStatus = (orderId, status) => {
  if (!emailsOnStatus(status)) return;
  sendInBackground(`${status} update for order ${orderId}`, async () => {
    const order = await loadOrder(orderId);
    if (!order?.user?.email) return;
    await sendMail({ to: order.user.email, ...orderStatusEmail(order, order.user, status) });
  });
};
