import React from "react";
import { formatDateTime, timelineSteps } from "../../utils/orderTracking";

const MARK = { done: "✓", current: "✓", cancelled: "✕", upcoming: "" };

// The order's tracking timeline: each step with the time it was reached and
// the admin's tracking note, the current step highlighted, and cancelled
// orders ending in a red "Cancelled" step.
const OrderTimeline = ({ order }) => (
  <ol className="order-timeline" aria-label="Order tracking">
    {timelineSteps(order).map((step) => (
      <li
        key={step.status}
        className={`order-timeline-step is-${step.state}`}
        aria-current={step.state === "current" || step.state === "cancelled" ? "step" : undefined}
      >
        <span className="order-timeline-marker" aria-hidden="true">
          {MARK[step.state]}
        </span>
        <div className="order-timeline-body">
          <span className="order-timeline-label">{step.label}</span>
          {step.at ? (
            <time className="order-timeline-time" dateTime={new Date(step.at).toISOString()}>
              {formatDateTime(step.at)}
            </time>
          ) : (
            step.state !== "upcoming" && <span className="order-timeline-time">Time not recorded</span>
          )}
          {step.state === "upcoming" && <span className="visually-hidden"> (not yet)</span>}
          {step.note && <p className="order-timeline-note">{step.note}</p>}
        </div>
      </li>
    ))}
  </ol>
);

export default OrderTimeline;
