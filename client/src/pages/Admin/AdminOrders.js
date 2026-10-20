import React, { useEffect, useState } from "react";
import AdminMenu from "../../components/Layout/AdminMenu";
import { formatPrice } from "../../utils/formatPrice";
import PaymentInfo from "../../components/PaymentInfo";
import InvoiceButton from "../../components/InvoiceButton";
import Layout from "../../components/Layout/Layout";
import axios from "axios";
import toast from "react-hot-toast";
import { errorMessage } from "../../utils/errorMessage";
import OrderTimeline from "../../components/Order/OrderTimeline";
import {
  MAX_NOTE_LENGTH,
  cancellable,
  deliveryLine,
  nextStatus,
  statusLabel,
} from "../../utils/orderTracking";

// Cash is collected on delivery, so only then can a COD order be marked paid
// (the API enforces the same rule).
const canMarkPaid = (order) =>
  (order.paymentMethod || "cod") === "cod" &&
  order.paymentStatus !== "paid" &&
  order.status === "delivered";

// Moves an order to its next tracking step (the API allows only that, or
// cancelling), with an optional tracking note the customer sees. The note can
// also be saved on the current step on its own.
const TrackingControls = ({ order, onSave }) => {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  if (order.status === "cancelled") return null;
  const ref = order._id.slice(-8).toUpperCase();
  const next = nextStatus(order.status);
  const awaitingPayment = order.paymentMethod === "razorpay" && order.paymentStatus !== "paid";

  const save = async (status) => {
    setBusy(true);
    const saved = await onSave(order, status, note.trim());
    setBusy(false);
    if (saved) setNote("");
  };

  return (
    <div className="admin-tracking">
      <label htmlFor={`note-${order._id}`} className="form-label small mb-1">
        Tracking note for order {ref} (optional)
      </label>
      <input
        id={`note-${order._id}`}
        className="form-control form-control-sm"
        maxLength={MAX_NOTE_LENGTH}
        placeholder="e.g. BlueDart, AWB 1234567890"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="d-flex gap-2 flex-wrap mt-2">
        {next && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            disabled={busy || awaitingPayment}
            onClick={() => save(next)}
          >
            Mark as {statusLabel(next)}
          </button>
        )}
        {order.status !== "processing" && (
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            disabled={busy || !note.trim()}
            onClick={() => save(order.status)}
          >
            Add note to "{statusLabel(order.status)}"
          </button>
        )}
        {cancellable(order.status) && (
          <button
            type="button"
            className="btn btn-sm btn-outline-danger"
            disabled={busy}
            onClick={() => save("cancelled")}
          >
            Cancel order
          </button>
        )}
      </div>
      {awaitingPayment && next && (
        <small className="text-muted d-block mt-1">Waiting for the online payment before it can move on.</small>
      )}
    </div>
  );
};

const AdminOrders = () => {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const { data } = await axios.get("/api/v1/order/all-orders");
        setOrders(data.orders || []);
      } catch (error) {
        toast.error(errorMessage(error, "Unable to load orders"));
      }
    };
    loadOrders();
  }, []);

  // Returns whether it was saved, so the note field can be cleared.
  const changeStatus = async (order, status, note) => {
    if (
      status === "cancelled" &&
      !window.confirm("Cancel this order? Its items will be returned to stock.")
    ) {
      return false;
    }
    try {
      const { data } = await axios.put(`/api/v1/order/order-status/${order._id}`, {
        status,
        ...(note && { note }),
      });
      setOrders((current) =>
        current.map((o) => (o._id === order._id ? data.order : o))
      );
      toast.success(
        status === order.status ? "Tracking note saved" : `Order marked as ${statusLabel(status)}`
      );
      return true;
    } catch (error) {
      toast.error(errorMessage(error, "Unable to update order status"));
      return false;
    }
  };

  const markPaid = async (order) => {
    try {
      const { data } = await axios.put(`/api/v1/order/mark-paid/${order._id}`);
      setOrders((current) =>
        current.map((o) => (o._id === order._id ? data.order : o))
      );
      toast.success("Order marked as paid");
    } catch (error) {
      toast.error(errorMessage(error, "Unable to mark order as paid"));
    }
  };

  return (
    <Layout title={"Dashboard - All Orders"}>
      <div className="container-fluid m-3 p-3">
        <div className="row">
          <div className="col-md-3">
            <AdminMenu />
          </div>
          <div className="col-md-9">
            <h1 className="section-heading">All orders</h1>
            {orders.length === 0 ? (
              <p className="text-muted">No orders have been placed yet.</p>
            ) : (
              orders.map((order) => (
                <article className="card p-3 mb-3" key={order._id}>
                  <div className="d-flex justify-content-between gap-3 flex-wrap">
                    <strong>Order {order._id.slice(-8).toUpperCase()}</strong>
                    <span
                      className={`badge order-status-badge ${order.status === "cancelled" ? "is-cancelled" : ""}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  {deliveryLine(order) && (
                    <p className="order-delivery-line mb-0 mt-1">{deliveryLine(order)}</p>
                  )}
                  <p className="mb-1 mt-2">
                    {order.user?.name || "Deleted user"}
                    {order.user?.email && ` (${order.user.email})`}
                  </p>
                  <p className="mb-1">
                    {order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}
                  </p>
                  <p className="mb-1 text-muted">Ship to: {order.shippingAddress}</p>
                  <PaymentInfo order={order} />
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    <strong>{formatPrice(order.total)}</strong>
                    {canMarkPaid(order) && (
                      <button
                        className="btn btn-sm btn-outline-success"
                        onClick={() => markPaid(order)}
                      >
                        Mark cash received
                      </button>
                    )}
                    <InvoiceButton order={order} />
                  </div>
                  <small className="text-muted d-block mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </small>
                  <TrackingControls order={order} onSave={changeStatus} />
                  <details className="mt-2">
                    <summary>Tracking history</summary>
                    <OrderTimeline order={order} />
                  </details>
                </article>
              ))
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default AdminOrders;
