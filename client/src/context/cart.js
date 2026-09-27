import { useState, useContext, createContext, useEffect } from "react";

const CartContext = createContext();

// Most units of one product a single order can hold.
export const MAX_CART_QUANTITY = 10;

// How many units of a cart line to order. Products carry their stock in
// `quantity`, so the chosen amount is stored as `cartQuantity` (carts saved
// before this existed default to 1).
export const cartQuantity = (item) => item.cartQuantity || 1;

// The largest quantity the cart offers for an item: its known stock, capped.
export const maxCartQuantity = (item) =>
  Math.max(1, Math.min(Number(item.quantity) || 1, MAX_CART_QUANTITY));

const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    let existingCartItem = localStorage.getItem("cart");
    if (existingCartItem) setCart(JSON.parse(existingCartItem));
  }, []);

  const saveCart = (nextCart) => {
    setCart(nextCart);
    localStorage.setItem("cart", JSON.stringify(nextCart));
  };

  const addToCart = (product) => {
    const existing = cart.some((item) => item._id === product._id);
    if (existing) return false;
    saveCart([...cart, { ...product, cartQuantity: 1 }]);
    return true;
  };

  const removeFromCart = (productId) => {
    saveCart(cart.filter((item) => item._id !== productId));
  };

  const updateQuantity = (productId, quantity) => {
    saveCart(
      cart.map((item) =>
        item._id === productId
          ? {
              ...item,
              cartQuantity: Math.min(
                Math.max(Math.floor(Number(quantity)) || 1, 1),
                maxCartQuantity(item)
              ),
            }
          : item
      )
    );
  };

  return (
    <CartContext.Provider
      value={[cart, setCart, addToCart, removeFromCart, updateQuantity]}
    >
      {children}
    </CartContext.Provider>
  );
};

// custom hook
const useCart = () => useContext(CartContext);

export { useCart, CartProvider };
