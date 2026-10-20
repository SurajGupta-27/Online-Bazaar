import React from "react";
import Footer from "./Footer";
import Header from "./Header";
import { Helmet } from "react-helmet";
import { Toaster } from "react-hot-toast";
import { BRAND, pageTitle } from "../../brand";
import ShoppingAssistant from "../Assistant/ShoppingAssistant";
// Defaults live in the parameters: React 19 ignores defaultProps on
// function components.
const Layout = ({
  children,
  title,
  description = `${BRAND.name}: shop electronics, fashion, beauty, home essentials and more, with prices in rupees.`,
  keywords = "online shopping,online bazaar,electronics,fashion,beauty,home",
  author = BRAND.owner,
}) => {
  return (
    <div>
      <Helmet>
        <meta charSet="utf-8" />
        <meta name="description" content={description} />
        <meta name="keywords" content={keywords} />
        <meta name="author" content={author} />
        <title>{pageTitle(title)}</title>
      </Helmet>
      <Header />
      <main className="site-main">
        <Toaster />

        {children}
      </main>
      <Footer />
      <ShoppingAssistant />
    </div>
  );
};

export default Layout;