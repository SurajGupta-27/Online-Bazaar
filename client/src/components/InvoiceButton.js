import React, { useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";

// Matches the API: an order has an invoice once it's confirmed (Cash on
// Delivery, which older orders without a method count as, or paid online).
export const hasInvoice = (order) =>
  (order.paymentMethod || "cod") === "cod" || order.paymentStatus === "paid";

// "attachment; filename="INV-2026-000001.pdf"" -> "INV-2026-000001.pdf"
const filenameFrom = (header, fallback) => header?.match(/filename="([^"]+)"/)?.[1] || fallback;

const readBlobText = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsText(blob);
  });

// A failed blob request carries the API's JSON error as a Blob.
const blobErrorMessage = async (error, fallback) => {
  try {
    return JSON.parse(await readBlobText(error.response.data)).message || fallback;
  } catch {
    return fallback;
  }
};

// Downloads the order's invoice PDF. The request carries the login token
// (axios default header), so it's fetched as a blob rather than a plain link.
const InvoiceButton = ({ order, className = "btn btn-sm btn-outline-primary" }) => {
  const [busy, setBusy] = useState(false);
  if (!hasInvoice(order)) return null;

  const download = async () => {
    setBusy(true);
    try {
      const response = await axios.get(`/api/v1/order/invoice/${order._id}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(
        response.headers?.["content-disposition"],
        `invoice-${order._id.slice(-8).toUpperCase()}.pdf`
      );
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      toast.error(await blobErrorMessage(error, "Unable to download the invoice"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <button type="button" className={className} onClick={download} disabled={busy}>
      {busy ? "Preparing invoice..." : "Download invoice"}
    </button>
  );
};

export default InvoiceButton;
