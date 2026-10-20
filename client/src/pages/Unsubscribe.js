import React, { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import axios from "axios";
import Layout from "../components/Layout/Layout";
import { errorMessage } from "../utils/errorMessage";

// The unsubscribe link in alert emails: /unsubscribe?u=&k=&t= (signed by the
// API, so no login is needed). It unsubscribes as soon as the page opens and
// offers to undo it.
const Unsubscribe = () => {
  const [params] = useSearchParams();
  const link = { u: params.get("u"), k: params.get("k"), t: params.get("t") };
  const [state, setState] = useState({ status: "working" });
  const started = useRef(false);

  const send = async (path) => {
    setState((current) => ({ ...current, status: "working" }));
    try {
      const { data } = await axios.post(`/api/v1/alerts/${path}`, link);
      setState({ status: data.subscribed ? "resubscribed" : "unsubscribed", label: data.label });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error, "Something went wrong. Please try again.") });
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    send("unsubscribe");
    // Runs once, when the page opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Layout title="Email alerts">
      <div className="container">
        <div className="empty-state my-4 unsubscribe-page" aria-live="polite">
          {state.status === "working" && <p className="text-muted">Updating your email settings…</p>}
          {state.status === "unsubscribed" && (
            <>
              <h1>You're unsubscribed</h1>
              <p>You won't get {state.label} from us any more.</p>
              <button type="button" className="btn btn-outline-primary" onClick={() => send("resubscribe")}>
                Undo: keep getting {state.label}
              </button>
            </>
          )}
          {state.status === "resubscribed" && (
            <>
              <h1>You're subscribed again</h1>
              <p>You'll keep getting {state.label}.</p>
            </>
          )}
          {state.status === "error" && (
            <>
              <h1>We couldn't update your settings</h1>
              <p>{state.message}</p>
            </>
          )}
          {state.status !== "working" && (
            <p className="text-muted mt-3 mb-0">
              You can change all your email alerts in <Link to="/dashboard/user/profile">your profile</Link>.
            </p>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Unsubscribe;
