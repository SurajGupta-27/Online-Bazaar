import React from "react";
import Layout from "../components/Layout/Layout";
import { BRAND } from "../brand";

const About = () => {
  return (
    <Layout title={"About Us"}>
      <div className="container info-page">
        <img src="/about.jpeg" alt="Shopping bags and parcels" />
        <div>
          <h1>About {BRAND.name}</h1>
          <p>
            {BRAND.name} is an online store for everyday shopping: electronics,
            fashion, beauty, furniture, home and kitchen essentials, and more,
            all in one place with prices in Indian rupees.
          </p>
          <p>
            Browse by category, filter by price, add what you like to your cart
            and pay online through Razorpay or choose Cash on Delivery.
          </p>
          <p>
            {BRAND.name} is designed and built by {BRAND.owner}.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default About;
