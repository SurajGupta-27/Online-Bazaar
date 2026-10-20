import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import axios from "axios";
import Layout from "../../components/Layout/Layout";
import UserMenu from "../../components/Layout/UserMenu";
import OrderTimeline from "../../components/Order/OrderTimeline";
import PaymentInfo from "../../components/PaymentInfo";
import InvoiceButton from "../../components/InvoiceButton";
import { formatPrice } from "../../utils/formatPrice";
import { productImage } from "../../utils/productImage";
import { errorMessage } from "../../utils/errorMessage";
import { deliveryLine, formatDateTime, statusLabel } from "../../utils/orderTracking";

// One of the customer's own orders, with its tracking timeline. The API
// answers 404 for anyone else's order.
const OrderDetails = () => {
  const { id } = useParams();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    setOrder(null);
    setError("");
    axios
      .get(`/api/v1/order/my-orders/${id}`)
      .then(({ data }) => active && setOrder(data.order))
      .catch((err) => active && setError(errorMessage(err, "Unable to load this order")));
    return () => {
      active = false;
    };
  }, [id]);

  const ref = id.slice(-8).toUpperCase();
  const delivery = order && deliveryLine(order);
  const cancelled = order?.status === "cancelled";

  return (
    <Layout title={`Order ${ref}`}>
      <div className="container-fluid p-3 m-3">
        <div className="row">
          <div className="col-md-3">
            <UserMenu />
          </div>
          <div className="col-md-9 order-details">
            <Link to="/dashboard/user/orders" className="d-inline-block mb-2">
              &larr; All orders
            </Link>
            {error ? (
              <div className="card p-4">
                <h1 className="section-heading">Order not found</h1>
                <p className="text-muted mb-0">{error}</p>
              </div>
            ) : !order ? (
              <p className="text-muted">Loading your order...</p>
            ) : (
              <>
                <div className="d-flex justify-content-between align-items-start gap-3 flex-wrap mb-3">
                  <div>
                    <h1 className="section-heading mb-1">Order {ref}</h1>
                    <small className="text-muted">Placed {formatDateTime(order.createdAt)}</small>
                  </div>
                  <span className={`badge order-status-badge ${cancelled ? "is-cancelled" : ""}`}>
                    {statusLabel(order.status)}
                  </span>
                </div>

                <section className="card p-3 mb-3" aria-labelledby="tracking-heading">
                  <h2 id="tracking-heading" className="h5 mb-1">Tracking</h2>
                  {delivery && <p className="order-delivery-line">{delivery}</p>}
                  {cancelled && (
                    <p className="order-cancelled-line">
                      This order was cancelled.
                      {order.paymentStatus === "paid" && order.paymentMethod === "razorpay"
                        ? " Your online payment will be refunded."
                        : ""}
                    </p>
                  )}
                  <OrderTimeline order={order} />
                </section>

                <section className="card p-3 mb-3" aria-labelledby="items-heading">
                  <h2 id="items-heading" className="h5">Items</h2>
                  <ul className="list-unstyled mb-0">
                    {order.items.map((item, i) => {
                      const product = item.product;
                      const image = product && productImage(product, 160);
                      const name = product?.slug ? (
                        <Link to={`/product/${product.slug}`}>{item.name}</Link>
                      ) : (
                        item.name
                      );
                      return (
                        <li key={i} className="order-item">
                          {image ? (
                            <img src={image} alt="" className="order-item-image" loading="lazy" />
                          ) : (
                            <span className="order-item-image" aria-hidden="true" />
                          )}
                          <div className="flex-grow-1">
                            <div>{name}</div>
                            <small className="text-muted">
                              {item.quantity} x {formatPrice(item.price)}
                            </small>
                          </div>
                          <strong>{formatPrice(item.price * item.quantity)}</strong>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="d-flex justify-content-between border-top pt-2 mt-2">
                    <strong>Total</strong>
                    <strong>{formatPrice(order.total)}</strong>
                  </div>
                </section>

                <section className="card p-3 mb-3" aria-labelledby="delivery-heading">
                  <h2 id="delivery-heading" className="h5">Delivery and payment</h2>
                  <p className="mb-2">{order.shippingAddress}</p>
                  <PaymentInfo order={order} />
                  <div>
                    <InvoiceButton order={order} />
                  </div>
                </section>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default OrderDetails;
