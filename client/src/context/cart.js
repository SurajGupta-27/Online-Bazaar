import { useState, useContext, createContext, useEffect } from "react";

const CartContext = createContext();
const CartProvider = ({ children }) => {
  const [cart, setCart] = useState([]);

  useEffect(() => {
    let existingCartItem = localStorage.getItem("cart");
    if (existingCartItem) setCart(JSON.parse(existingCartItem));
  }, []);

  const addToCart = (product) => {
    const existing = cart.some((item) => item._id === product._id);
    if (existing) return false;
    const nextCart = [...cart, product];
    setCart(nextCart);
    localStorage.setItem("cart", JSON.stringify(nextCart));
    return true;
  };

  const removeFromCart = (productId) => {
    const nextCart = cart.filter((item) => item._id !== productId);
    setCart(nextCart);
    localStorage.setItem("cart", JSON.stringify(nextCart));
  };

  return (
    <CartContext.Provider value={[cart, setCart, addToCart, removeFromCart]}>
      {children}
    </CartContext.Provider>
  );
};

// custom hook
const useCart = () => useContext(CartContext);

export { useCart, CartProvider };