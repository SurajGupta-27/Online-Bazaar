import React from "react";
import Layout from "../components/Layout/Layout";

const Policy = () => {
  return (
    <Layout title={'Privacy Policy of - Ecommerce App'}>
      <div className="row contactus ">
        <div className="col-md-6 ">
          <img
            src="/image/contactus.jpeg"
            alt="contactus"
            style={{ width: "100%" }}
          />
        </div>
        <div className="col-md-4">
          <p>Compliance policy</p>
          <p>Framework  policy</p>
          <p>Placeholder policy</p>
          <p>Testing policy</p>
        </div>
      </div>
    </Layout>
  );
};

Layout.defaultProps = {
  title: "Ecommerce app - shop now",
  description: "mern stack project",
  keywords: "mern,react,node,mongodb",
  author: "TechInfo",
};

export default Policy;