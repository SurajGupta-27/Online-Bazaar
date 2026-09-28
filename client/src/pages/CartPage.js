import React from "react";
import Layout from "./../components/Layout/Layout";
import { formatPrice } from "../utils/formatPrice";
import { useCart, cartQuantity, maxCartQuantity } from "../context/cart";
import { useAuth } from "../context/auth";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
const CartPage = () => {
  const [auth] = useAuth();
  const [cart, setCart, , removeFromCart, updateQuantity] = useCart();
  const navigate = useNavigate();
  const [placingOrder, setPlacingOrder] = React.useState(false);

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

  const placeOrder = async () => {
    try {
      setPlacingOrder(true);
      await axios.post("/api/v1/order/create-order", {
        shippingAddress: auth.user.address,
        items: cart.map((item) => ({
          product: item._id,
          quantity: cartQuantity(item),
        })),
      });
      setCart([]);
      localStorage.removeItem("cart");
      toast.success("Order placed successfully");
      navigate("/dashboard/user/orders");
    } catch (error) {
      toast.error(error.response?.data?.message || "Unable to place order");
    } finally {
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
                    src={`/api/v1/product/product-photo/${p._id}`}
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
                  <button
                    className="btn btn-primary w-100 mt-3"
                    disabled={placingOrder || !cart.length}
                    onClick={placeOrder}
                  >
                    {placingOrder ? "Placing order..." : "Place order"}
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