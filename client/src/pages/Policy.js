import React from "react";
import Layout from "../components/Layout/Layout";
import { BRAND } from "../brand";

const Policy = () => {
  return (
    <Layout title={"Privacy Policy"}>
      <div className="container info-page">
        <img src="/contactus.jpeg" alt="" />
        <div>
          <h1>Privacy policy</h1>
          <p>
            {BRAND.name} collects only what it needs to run your account and
            deliver your orders: your name, email, phone number and address.
          </p>
          <p>
            Passwords and security answers are stored hashed. Online payments
            are handled by Razorpay; card and UPI details never reach our
            servers.
          </p>
          <p>We do not sell or share your personal details with third parties.</p>
        </div>
      </div>
    </Layout>
  );
};

export default Policy;
