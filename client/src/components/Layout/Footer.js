import React from "react";
import { Link } from "react-router-dom";
import { BRAND } from "../../brand";

const Footer = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="footer">
      <div className="container footer-inner">
        <div>
          <p className="footer-brand">{BRAND.name}</p>
          <p className="footer-tagline">{BRAND.tagline}</p>
        </div>
        <nav className="footer-links" aria-label="Footer">
          <Link to="/about">About</Link>
          <Link to="/contact">Contact</Link>
          <Link to="/policy">Privacy Policy</Link>
        </nav>
      </div>
      <p className="footer-copy">
        &copy; {year} {BRAND.name}. All rights reserved. Built by {BRAND.owner}.
      </p>
    </footer>
  );
};

export default Footer;
