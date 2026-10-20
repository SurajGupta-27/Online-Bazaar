import React from "react";
import { Link } from "react-router-dom";
import toast from "react-hot-toast";
import Layout from "../../components/Layout/Layout";
import UserMenu from "../../components/Layout/UserMenu";
import { RatingSummary } from "../../components/Product/StarRating";
import { useWishlist } from "../../context/wishlist";
import { useAuth } from "../../context/auth";
import { alertSettings } from "../../context/alerts";
import AlertsOn from "../../components/Product/AlertsOn";
import { useCart } from "../../context/cart";
import { formatPrice } from "../../utils/formatPrice";
import { productImage } from "../../utils/productImage";

const Wishlist = () => {
  const [wishlist, , removeFromWishlist] = useWishlist();
  const [, , addToCart] = useCart();
  const [auth] = useAuth();
  // Wishlist items get price-drop and back-in-stock emails, unless turned off.
  const settings = alertSettings(auth?.user);
  const alertsTitle = [
    settings.priceDrop && "if the price drops",
    settings.backInStock && "when it's back in stock",
  ]
    .filter(Boolean)
    .join(" or ");

  const moveToCart = async (product) => {
    const added = addToCart(product);
    try {
      await removeFromWishlist(product._id);
      toast.success(added ? "Moved to your cart" : "Already in your cart, removed from your wishlist");
    } catch (error) {
      // removeFromWishlist has already shown the error.
    }
  };

  const remove = async (product) => {
    try {
      await removeFromWishlist(product._id);
      toast.success("Removed from your wishlist");
    } catch (error) {
      // removeFromWishlist has already shown the error.
    }
  };

  return (
    <Layout title={"Your Wishlist"}>
      <div className="container-fluid m-3 p-3">
        <div className="row">
          <div className="col-md-3">
            <UserMenu />
          </div>
          <div className="col-md-9">
            <h1>Wishlist</h1>
            {wishlist.length === 0 ? (
              <div className="empty-state">
                <h3>Your wishlist is empty</h3>
                <p className="text-muted">Tap the heart on any product to save it here.</p>
                <Link to="/" className="btn btn-primary">
                  Browse products
                </Link>
              </div>
            ) : (
              <>
                <p className="text-muted">
                  {wishlist.length} {wishlist.length === 1 ? "item" : "items"}
                </p>
                <ul className="wishlist-list">
                  {wishlist.map(({ product, priceWhenAdded }) => {
                    const inStock = Number(product.quantity) > 0;
                    const dropped = priceWhenAdded > product.price;
                    return (
                      <li key={product._id} className="wishlist-item">
                        {/* Same destination as the name link, so hidden from screen readers and Tab. */}
                        <Link
                          to={`/product/${product.slug}`}
                          className="wishlist-image"
                          tabIndex={-1}
                          aria-hidden="true"
                        >
                          <img src={productImage(product, 200)} alt="" loading="lazy" />
                        </Link>
                        <div className="wishlist-info">
                          <Link to={`/product/${product.slug}`} className="wishlist-name">
                            {product.name}
                          </Link>
                          <RatingSummary average={product.ratingAverage} count={product.ratingCount} />
                          <div>
                            <span className="price">{formatPrice(product.price)}</span>
                            {dropped && (
                              <span className="price-drop">
                                {" "}
                                Price dropped from {formatPrice(priceWhenAdded)}
                              </span>
                            )}
                          </div>
                          <span className={inStock ? "text-success" : "text-danger"}>
                            {inStock ? "In stock" : "Out of stock"}
                          </span>
                          {alertsTitle && <AlertsOn title={`We'll email you ${alertsTitle}`} />}
                        </div>
                        <div className="wishlist-actions">
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            disabled={!inStock}
                            onClick={() => moveToCart(product)}
                          >
                            Move to cart
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline-danger btn-sm"
                            onClick={() => remove(product)}
                          >
                            Remove
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Wishlist;
