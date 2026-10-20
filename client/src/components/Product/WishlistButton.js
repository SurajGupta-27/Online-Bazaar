import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AiFillHeart, AiOutlineHeart } from "react-icons/ai";
import toast from "react-hot-toast";
import { useAuth } from "../../context/auth";
import { inWishlist, useWishlist } from "../../context/wishlist";

// The heart on product cards and the product page. Logged-out shoppers are
// sent to log in, then brought back here.
const WishlistButton = ({ product, withLabel = false, className = "" }) => {
  const [auth] = useAuth();
  const [wishlist, toggleWishlist] = useWishlist();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const saved = inWishlist(wishlist, product._id);
  const label = saved ? "Remove from wishlist" : "Add to wishlist";

  const onClick = async () => {
    if (!auth?.token) {
      toast("Log in to save items to your wishlist", { icon: "♡" });
      navigate("/login", { state: location.pathname });
      return;
    }
    setBusy(true);
    try {
      const added = await toggleWishlist(product);
      toast.success(added ? "Added to your wishlist" : "Removed from your wishlist");
    } catch (error) {
      // toggleWishlist has already shown the error.
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      className={`wishlist-btn${saved ? " saved" : ""}${withLabel ? " with-label" : ""} ${className}`}
      aria-label={withLabel ? undefined : label}
      aria-pressed={saved}
      title={label}
      disabled={busy}
      onClick={onClick}
    >
      {saved ? <AiFillHeart aria-hidden="true" /> : <AiOutlineHeart aria-hidden="true" />}
      {withLabel && <span>{saved ? "In your wishlist" : "Add to wishlist"}</span>}
    </button>
  );
};

export default WishlistButton;
