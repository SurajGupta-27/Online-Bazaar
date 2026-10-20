import React from "react";
import { AiFillBell } from "react-icons/ai";

// The small "Alerts on" pill on wishlist items and on products the user asked
// to be notified about. `title` says which emails they'll get.
const AlertsOn = ({ title, className = "" }) => (
  <span className={`alerts-on ${className}`} title={title}>
    <AiFillBell aria-hidden="true" />
    Alerts on
    {title && <span className="visually-hidden">: {title}</span>}
  </span>
);

export default AlertsOn;
