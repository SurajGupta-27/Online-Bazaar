import React from "react";
import Layout from "../components/Layout/Layout";
import { BiMailSend, BiPhoneCall, BiSupport } from "react-icons/bi";
import { BRAND } from "../brand";

const Contact = () => {
  return (
    <Layout title={"Contact Us"}>
      <div className="container info-page">
        <img src="/contactus.jpeg" alt="Customer support" />
        <div>
          <h1>Contact us</h1>
          <p>
            Questions about a product or an order? The {BRAND.name} team is
            happy to help.
          </p>
          <p className="contact-line">
            <BiMailSend aria-hidden="true" /> support@onlinebazaar.example
          </p>
          <p className="contact-line">
            <BiPhoneCall aria-hidden="true" /> 012-3456789
          </p>
          <p className="contact-line">
            <BiSupport aria-hidden="true" /> 1800-0000-0000 (toll free)
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;
