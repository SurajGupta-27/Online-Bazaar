import React from "react";
import { BsStar, BsStarFill, BsStarHalf } from "react-icons/bs";

// Read-only stars for an average such as 4.3 (shown to the nearest half star).
export const StarRating = ({ value = 0, className = "" }) => {
  const halves = Math.round(Number(value) * 2);
  return (
    <span
      className={`star-rating ${className}`}
      role="img"
      aria-label={`Rated ${Number(value).toFixed(1)} out of 5`}
    >
      {[1, 2, 3, 4, 5].map((star) =>
        halves >= star * 2 ? (
          <BsStarFill key={star} aria-hidden="true" />
        ) : halves === star * 2 - 1 ? (
          <BsStarHalf key={star} aria-hidden="true" />
        ) : (
          <BsStar key={star} aria-hidden="true" />
        )
      )}
    </span>
  );
};

// Five radio buttons drawn as stars, for choosing a rating in a form.
export const StarInput = ({ value, onChange, name = "rating" }) => (
  <fieldset className="star-input">
    <legend className="form-label">Your rating</legend>
    {[1, 2, 3, 4, 5].map((star) => (
      <label key={star} className={star <= value ? "on" : ""}>
        <input
          type="radio"
          name={name}
          value={star}
          checked={value === star}
          onChange={() => onChange(star)}
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
        />
        {star <= value ? <BsStarFill aria-hidden="true" /> : <BsStar aria-hidden="true" />}
      </label>
    ))}
  </fieldset>
);

// "4.3 (12)" with stars, for product cards and the product page header.
export const RatingSummary = ({ average, count, className = "" }) =>
  count > 0 ? (
    <span className={`rating-summary ${className}`}>
      <StarRating value={average} />
      <span className="rating-average">{Number(average).toFixed(1)}</span>
      <span className="rating-count">
        ({count} {count === 1 ? "review" : "reviews"})
      </span>
    </span>
  ) : (
    <span className={`rating-summary no-reviews ${className}`}>No reviews yet</span>
  );
