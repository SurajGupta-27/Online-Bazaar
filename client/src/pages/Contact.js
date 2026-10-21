import React from "react";
import Layout from "../components/Layout/Layout";
import { BiMailSend, BiTime } from "react-icons/bi";
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
            <BiMailSend aria-hidden="true" />{" "}
            <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
          </p>
          <p className="contact-line">
            <BiTime aria-hidden="true" /> We usually reply within one working day.
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default Contact;
