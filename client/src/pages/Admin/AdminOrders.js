import React, { useEffect, useState } from "react";
import AdminMenu from "../../components/Layout/AdminMenu";
import { formatPrice } from "../../utils/formatPrice";
import PaymentInfo from "../../components/PaymentInfo";
import Layout from "../../components/Layout/Layout";
import axios from "axios";
import toast from "react-hot-toast";
import { Select } from "antd";
import { errorMessage } from "../../utils/errorMessage";

// Must match the status enum in models/orderModel.js.
const STATUSES = ["placed", "processing", "shipped", "delivered", "cancelled"];

// Cash is collected on delivery, so only then can a COD order be marked paid
// (the API enforces the same rule).
const canMarkPaid = (order) =>
  (order.paymentMethod || "cod") === "cod" &&
  order.paymentStatus !== "paid" &&
  order.status === "delivered";

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

  const changeStatus = async (order, status) => {
    if (
      status === "cancelled" &&
      !window.confirm("Cancel this order? Its items will be returned to stock.")
    ) {
      return;
    }
    try {
      const { data } = await axios.put(`/api/v1/order/order-status/${order._id}`, {
        status,
      });
      setOrders((current) =>
        current.map((o) => (o._id === order._id ? data.order : o))
      );
      toast.success(`Order marked as ${status}`);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to update order status"));
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
                    <Select
                      aria-label={`Status of order ${order._id.slice(-8).toUpperCase()}`}
                      value={order.status}
                      disabled={order.status === "cancelled"}
                      style={{ minWidth: 150 }}
                      onChange={(status) => changeStatus(order, status)}
                      options={STATUSES.map((s) => ({
                        value: s,
                        label: s.charAt(0).toUpperCase() + s.slice(1),
                      }))}
                    />
                  </div>
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
                  </div>
                  <small className="text-muted d-block mt-1">
                    {new Date(order.createdAt).toLocaleDateString()}
                  </small>
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
