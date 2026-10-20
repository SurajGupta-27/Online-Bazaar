import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import UserMenu from "../../components/Layout/UserMenu";
import { formatPrice } from "../../utils/formatPrice";
import PaymentInfo from "../../components/PaymentInfo";
import InvoiceButton from "../../components/InvoiceButton";
import Layout from "../../components/Layout/Layout";
import axios from "axios";
import toast from "react-hot-toast";
import { deliveryLine, statusLabel } from "../../utils/orderTracking";

const Orders = () => {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    const loadOrders = async () => {
      try {
        const { data } = await axios.get("/api/v1/order/my-orders");
        setOrders(data.orders || []);
      } catch (error) {
        toast.error(error.response?.data?.message || "Unable to load orders");
      }
    };
    loadOrders();
  }, []);

  return (
    <Layout title={"Your Orders"}>
      <div className="container-flui p-3 m-3">
        <div className="row">
          <div className="col-md-3">
            <UserMenu />
          </div>
          <div className="col-md-9">
            <h1 className="section-heading">Your orders</h1>
            {orders.length === 0 ? (
              <p className="text-muted">You have not placed an order yet.</p>
            ) : (
              orders.map((order) => (
                <article className="card p-3 mb-3" key={order._id}>
                  <div className="d-flex justify-content-between gap-3 flex-wrap">
                    <Link to={`/dashboard/user/orders/${order._id}`} className="text-reset">
                      <strong>Order {order._id.slice(-8).toUpperCase()}</strong>
                    </Link>
                    <span
                      className={`badge order-status-badge ${order.status === "cancelled" ? "is-cancelled" : ""}`}
                    >
                      {statusLabel(order.status)}
                    </span>
                  </div>
                  {deliveryLine(order) && (
                    <p className="order-delivery-line mb-0 mt-1">{deliveryLine(order)}</p>
                  )}
                  <p className="mb-1 mt-2">{order.items.map((item) => `${item.name} x${item.quantity}`).join(", ")}</p>
                  <PaymentInfo order={order} />
                  <div className="d-flex align-items-center gap-3 flex-wrap">
                    <strong>{formatPrice(order.total)}</strong>
                    <Link
                      to={`/dashboard/user/orders/${order._id}`}
                      className="btn btn-sm btn-primary"
                      aria-label={`Track order ${order._id.slice(-8).toUpperCase()}`}
                    >
                      Track order
                    </Link>
                    <InvoiceButton order={order} />
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

export default Orders;