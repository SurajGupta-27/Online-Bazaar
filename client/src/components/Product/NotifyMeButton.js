import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AiOutlineBell } from "react-icons/ai";
import toast from "react-hot-toast";
import { useAuth } from "../../context/auth";
import { alertSettings, awaitingRestock, useAlerts } from "../../context/alerts";
import AlertsOn from "./AlertsOn";

// "Notify me when available" on an out-of-stock product page. Once asked, it
// shows "Alerts on" and a way to cancel. Logged-out shoppers are sent to log
// in, then brought back here.
const NotifyMeButton = ({ product }) => {
  const [auth] = useAuth();
  const [restock, requestRestock, cancelRestock] = useAlerts();
  const navigate = useNavigate();
  const location = useLocation();
  const [busy, setBusy] = useState(false);
  const waiting = awaitingRestock(restock, product._id);
  const emailsOff = auth?.token && !alertSettings(auth.user).backInStock;

  const run = async (action, message) => {
    setBusy(true);
    try {
      await action(product._id);
      toast.success(message);
    } catch (error) {
      // The context has already shown the error.
    } finally {
      setBusy(false);
    }
  };

  const ask = () => {
    if (!auth?.token) {
      toast("Log in to get an email when it's back", { icon: "🔔" });
      navigate("/login", { state: location.pathname });
      return;
    }
    run(requestRestock, "We'll email you when it's back in stock");
  };

  return (
    <div className="notify-me">
      {waiting ? (
        <div className="notify-me-on">
          <AlertsOn title="We'll email you when it's back in stock" />
          <button
            type="button"
            className="btn btn-link btn-sm"
            disabled={busy}
            onClick={() => run(cancelRestock, "Alert cancelled")}
          >
            Cancel alert
          </button>
        </div>
      ) : (
        <button type="button" className="btn btn-primary btn-lg px-4" disabled={busy} onClick={ask}>
          <AiOutlineBell aria-hidden="true" className="me-2" />
          Notify me when available
        </button>
      )}
      {emailsOff && (
        <p className="notify-me-hint">
          Back-in-stock emails are turned off.{" "}
          <Link to="/dashboard/user/profile">Turn them on in your profile</Link>
        </p>
      )}
    </div>
  );
};

export default NotifyMeButton;
