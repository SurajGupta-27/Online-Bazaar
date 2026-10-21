import React from "react";
import ReactDOM from "react-dom/client";
import "./index.css";
import "./App.css";
import App from "./App";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./context/auth";
import { SearchProvider } from "./context/search";
import {CartProvider} from "./context/cart"
import { WishlistProvider } from "./context/wishlist";
import { AlertsProvider } from "./context/alerts";
import "antd/dist/reset.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <AuthProvider>
    <SearchProvider>
      <CartProvider>
        <WishlistProvider>
          <AlertsProvider>
            <BrowserRouter>
              <App />
            </BrowserRouter>
          </AlertsProvider>
        </WishlistProvider>
      </CartProvider>
    </SearchProvider>
  </AuthProvider>
);

