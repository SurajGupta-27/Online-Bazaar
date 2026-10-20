import React, { useEffect, useState } from "react";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../../context/auth";
import { alertSettings } from "../../context/alerts";
import { errorMessage } from "../../utils/errorMessage";

const OPTIONS = [
  {
    key: "priceDrop",
    label: "Price-drop alerts",
    help: "Email me when something on my wishlist gets cheaper than when I saved it.",
  },
  {
    key: "backInStock",
    label: "Back-in-stock alerts",
    help: "Email me when a product I'm waiting for, or one on my wishlist, is available again.",
  },
];

// The profile's "Email alerts" switches. Each change saves at once. Loads the
// settings from the API too, since an unsubscribe link may have changed them.
const AlertSettings = () => {
  const [auth, setAuth] = useAuth();
  const [busy, setBusy] = useState(false);
  const settings = alertSettings(auth?.user);

  // Keeps the signed-in user (and localStorage) in step with the API.
  const store = (alerts) => {
    setAuth((current) => {
      const next = { ...current, user: { ...current.user, alerts } };
      try {
        const saved = JSON.parse(localStorage.getItem("auth"));
        if (saved) localStorage.setItem("auth", JSON.stringify({ ...saved, user: next.user }));
      } catch (error) {
        // Nothing saved to update.
      }
      return next;
    });
  };

  useEffect(() => {
    if (!auth?.token) return;
    let current = true;
    axios
      .get("/api/v1/alerts/preferences")
      .then(({ data }) => current && data?.alerts && store(data.alerts))
      .catch((error) => console.log(error));
    return () => {
      current = false;
    };
    // Load once per sign-in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token]);

  const toggle = async (key, value) => {
    const previous = settings;
    store({ ...settings, [key]: value });
    setBusy(true);
    try {
      const { data } = await axios.put("/api/v1/alerts/preferences", { [key]: value });
      store(data.alerts);
      toast.success(data.message || "Alert settings saved");
    } catch (error) {
      store(previous);
      toast.error(errorMessage(error, "Couldn't save your alert settings"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="alert-settings" aria-labelledby="alert-settings-title">
      <h4 id="alert-settings-title" className="title">
        EMAIL ALERTS
      </h4>
      {OPTIONS.map(({ key, label, help }) => (
        <div className="form-check form-switch mb-3" key={key}>
          <input
            className="form-check-input"
            type="checkbox"
            role="switch"
            id={`alert-${key}`}
            checked={settings[key]}
            disabled={busy}
            onChange={(e) => toggle(key, e.target.checked)}
            aria-describedby={`alert-${key}-help`}
          />
          <label className="form-check-label" htmlFor={`alert-${key}`}>
            {label}
          </label>
          <small id={`alert-${key}-help`} className="form-text text-muted d-block">
            {help}
          </small>
        </div>
      ))}
    </section>
  );
};

export default AlertSettings;
