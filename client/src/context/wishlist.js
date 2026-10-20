import { useState, useEffect, useContext, createContext, useCallback } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "./auth";
import { errorMessage } from "../utils/errorMessage";

// Without a provider (e.g. a component rendered on its own in a test), the
// wishlist is empty and changes do nothing.
const WishlistContext = createContext([[], async () => false, async () => {}]);

export const inWishlist = (wishlist, productId) =>
  wishlist.some((item) => item.product?._id === productId);

// The signed-in user's wishlist, kept in the database. Items are
// { product, priceWhenAdded, addedAt }, newest first.
const WishlistProvider = ({ children }) => {
  const [auth] = useAuth();
  const [wishlist, setWishlist] = useState([]);
  const token = auth?.token;

  useEffect(() => {
    if (!token) {
      setWishlist([]);
      return;
    }
    let current = true;
    axios
      .get("/api/v1/wishlist")
      .then(({ data }) => current && setWishlist(data?.items || []))
      .catch((error) => console.log(error));
    return () => {
      current = false;
    };
  }, [token]);

  // Removes a product; the list updates at once and is restored on failure.
  const removeFromWishlist = useCallback(
    async (productId) => {
      const removed = wishlist.find((item) => item.product?._id === productId);
      setWishlist((items) => items.filter((item) => item.product?._id !== productId));
      try {
        await axios.delete(`/api/v1/wishlist/${productId}`);
      } catch (error) {
        if (removed) setWishlist((items) => [removed, ...items]);
        toast.error(errorMessage(error, "Couldn't update your wishlist"));
        throw error;
      }
    },
    [wishlist]
  );

  // Adds or removes a product; resolves to true if it's now on the wishlist.
  const toggleWishlist = useCallback(
    async (product) => {
      if (inWishlist(wishlist, product._id)) {
        await removeFromWishlist(product._id);
        return false;
      }
      const item = { product, priceWhenAdded: product.price, addedAt: new Date().toISOString() };
      setWishlist((items) => [item, ...items]);
      try {
        await axios.post(`/api/v1/wishlist/${product._id}`);
        return true;
      } catch (error) {
        setWishlist((items) => items.filter((i) => i !== item));
        toast.error(errorMessage(error, "Couldn't update your wishlist"));
        throw error;
      }
    },
    [wishlist, removeFromWishlist]
  );

  return (
    <WishlistContext.Provider value={[wishlist, toggleWishlist, removeFromWishlist]}>
      {children}
    </WishlistContext.Provider>
  );
};

// const [wishlist, toggleWishlist, removeFromWishlist] = useWishlist();
const useWishlist = () => useContext(WishlistContext);

export { useWishlist, WishlistProvider };
