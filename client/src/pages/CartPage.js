import React from "react";
import Layout from "./../components/Layout/Layout";
import { formatPrice } from "../utils/formatPrice";
import { BRAND } from "../brand";
import { productImage } from "../utils/productImage";
import { useCart, cartQuantity, maxCartQuantity } from "../context/cart";
import { useAuth } from "../context/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { errorMessage } from "../utils/errorMessage";
import { loadRazorpay } from "../utils/loadRazorpay";

const PAYMENT_OPTIONS = [
  { value: "razorpay", label: "Pay Online (Razorpay)", hint: "UPI, cards, netbanking, wallets" },
  { value: "cod", label: "Cash on Delivery", hint: "Pay in cash when your order arrives" },
];

const CartPage = () => {
  const [auth] = useAuth();
  const [cart, setCart, , removeFromCart, updateQuantity] = useCart();
  const navigate = useNavigate();
  const [placingOrder, setPlacingOrder] = React.useState(false);
  const [paymentMethod, setPaymentMethod] = React.useState("cod");

  //total price
  const totalPrice = () => {
    try {
      const total = cart?.reduce(
        (sum, item) => sum + Number(item.price || 0) * cartQuantity(item),
        0
      );
      return formatPrice(total);
    } catch (error) {
      console.log(error);
    }
  };
  //detele item
  const removeCartItem = (pid) => {
    try {
      removeFromCart(pid);
    } catch (error) {
      console.log(error);
    }
  };

  const finishOrder = (message) => {
    setCart([]);
    localStorage.removeItem("cart");
    toast.success(message);
    navigate("/dashboard/user/orders");
  };

  // Frees the stock the server is holding for an unpaid online order.
  const cancelPayment = (orderId) =>
    axios.post(`/api/v1/order/cancel-payment/${orderId}`).catch(() => {});

  // Opens Razorpay Checkout for an order the server has already created and
  // priced. The cart is only cleared once the server has verified the payment.
  const payOnline = async (order, payment) => {
    const Razorpay = await loadRazorpay();
    if (!Razorpay) {
      await cancelPayment(order._id);
      toast.error("Couldn't load the payment window. Check your connection and try again.");
      setPlacingOrder(false);
      return;
    }
    let settled = false;
    const checkout = new Razorpay({
      key: payment.keyId,
      order_id: payment.razorpayOrderId,
      amount: payment.amount,
      currency: payment.currency,
      name: BRAND.name,
      description: `Order ${order._id.slice(-8).toUpperCase()}`,
      prefill: {
        name: auth.user.name,
        email: auth.user.email,
        contact: auth.user.phone,
      },
      timeout: payment.timeout,
      handler: async (response) => {
        settled = true;
        try {
          await axios.post("/api/v1/order/verify-payment", {
            orderId: order._id,
            razorpay_payment_id: response.razorpay_payment_id,
            razorpay_signature: response.razorpay_signature,
          });
          finishOrder("Payment successful. Order placed!");
        } catch (error) {
          toast.error(errorMessage(error, "We couldn't confirm your payment"));
          if (error.response?.status === 409) navigate("/dashboard/user/orders");
        } finally {
          setPlacingOrder(false);
        }
      },
      modal: {
        // Closed without paying (or Checkout timed out): release the order.
        ondismiss: async () => {
          if (settled) return;
          settled = true;
          await cancelPayment(order._id);
          toast.error("Payment cancelled. Your cart is unchanged.");
          setPlacingOrder(false);
        },
      },
    });
    // Checkout stays open after a failed attempt so the shopper can retry.
    checkout.on("payment.failed", (response) => {
      toast.error(response?.error?.description || "Payment failed. Please try again.");
    });
    checkout.open();
  };

  const placeOrder = async () => {
    setPlacingOrder(true);
    let data;
    try {
      ({ data } = await axios.post("/api/v1/order/create-order", {
        shippingAddress: auth.user.address,
        paymentMethod,
        items: cart.map((item) => ({
          product: item._id,
          quantity: cartQuantity(item),
        })),
      }));
    } catch (error) {
      toast.error(errorMessage(error, "Unable to place order"));
      setPlacingOrder(false);
      return;
    }
    if (paymentMethod === "razorpay") {
      await payOnline(data.order, data.payment);
    } else {
      finishOrder("Order placed. Pay in cash when it's delivered.");
      setPlacingOrder(false);
    }
  };
  return (
    <Layout>
      <div className="container">
        <div className="row">
          <div className="col-md-12">
            <h1 className="text-center bg-light p-2 mb-1">
              {`Hello ${auth?.token && auth?.user?.name}`}
            </h1>
            <h4 className="text-center">
              {cart?.length
                ? `You Have ${cart.reduce((sum, item) => sum + cartQuantity(item), 0)} items in your cart ${
                    auth?.token ? "" : "please login to checkout"
                  }`
                : " Your Cart Is Empty"}
            </h4>
          </div>
        </div>
        <div className="row">
          <div className="col-md-8">
            {cart?.map((p) => (
              <div className="row mb-2 p-3 card flex-row" key={p._id}>
                <div className="col-md-4">
                  <img
                    src={productImage(p, 200)}
                    className="card-img-top"
                    alt={p.name}
                    width="100px"
                    height={"100px"}
                  />
                </div>
                <div className="col-md-8">
                  <p>{p.name}</p>
                  <p>{p.description.substring(0, 30)}</p>
                  <p>Price : {formatPrice(p.price)}</p>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <label htmlFor={`qty-${p._id}`}>Quantity :</label>
                    <select
                      id={`qty-${p._id}`}
                      className="form-select w-auto"
                      value={cartQuantity(p)}
                      onChange={(e) => updateQuantity(p._id, e.target.value)}
                    >
                      {Array.from({ length: maxCartQuantity(p) }, (_, i) => i + 1).map(
                        (n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        )
                      )}
                    </select>
                  </div>
                  <button
                    className="btn btn-danger"
                    onClick={() => removeCartItem(p._id)}
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="col-md-4 text-center">
            <h2>Cart Summary</h2>
            <p>Total | Checkout | Payment</p>
            <hr />
            <h4>Total : {totalPrice()} </h4>
            {auth?.user?.address ? (
              <>
                <div className="mb-3">
                  <h4>Current Address</h4>
                  <h5>{auth?.user?.address}</h5>
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => navigate("/dashboard/user/profile")}
                  >
                    Update Address
                  </button>
                  <fieldset className="text-start mt-3" disabled={placingOrder}>
                    <legend className="h5">Payment method</legend>
                    {PAYMENT_OPTIONS.map((option) => (
                      <div className="form-check mb-2" key={option.value}>
                        <input
                          className="form-check-input"
                          type="radio"
                          name="paymentMethod"
                          id={`pay-${option.value}`}
                          value={option.value}
                          checked={paymentMethod === option.value}
                          onChange={() => setPaymentMethod(option.value)}
                        />
                        <label className="form-check-label" htmlFor={`pay-${option.value}`}>
                          {option.label}
                          <small className="d-block text-muted">{option.hint}</small>
                        </label>
                      </div>
                    ))}
                  </fieldset>
                  <button
                    className="btn btn-primary w-100 mt-2"
                    disabled={placingOrder || !cart.length}
                    onClick={placeOrder}
                  >
                    {placingOrder
                      ? paymentMethod === "razorpay"
                        ? "Waiting for payment..."
                        : "Placing order..."
                      : paymentMethod === "razorpay"
                      ? `Pay ${totalPrice()}`
                      : "Place order"}
                  </button>
                </div>
              </>
            ) : (
              <div className="mb-3">
                {auth?.token ? (
                  <button
                    className="btn btn-outline-warning"
                    onClick={() => navigate("/dashboard/user/profile")}
                  >
                    Update Address
                  </button>
                ) : (
                  <button
                    className="btn btn-outline-warning"
                    onClick={() =>
                      navigate("/login", {
                        state: "/cart",
                      })
                    }
                  >
                    Plase Login to checkout
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CartPage;