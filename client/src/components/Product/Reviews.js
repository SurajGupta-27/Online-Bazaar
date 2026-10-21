import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import axios from "axios";
import toast from "react-hot-toast";
import { useAuth } from "../../context/auth";
import { errorMessage } from "../../utils/errorMessage";
import { RatingSummary, StarInput, StarRating } from "./StarRating";

const MIN_LENGTH = 10;
const MAX_LENGTH = 1000;
const emptySummary = { average: 0, count: 0, breakdown: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 } };
const formatDate = (date) =>
  new Date(date).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

// Bars showing how many reviews gave each number of stars.
const Breakdown = ({ summary }) => (
  <div className="rating-breakdown" aria-label="Rating breakdown">
    {[5, 4, 3, 2, 1].map((star) => {
      const count = summary.breakdown?.[star] || 0;
      const percent = summary.count ? Math.round((count / summary.count) * 100) : 0;
      return (
        <div className="breakdown-row" key={star}>
          <span>{star} star</span>
          <div
            className="breakdown-bar"
            role="progressbar"
            aria-label={`${star} star reviews`}
            aria-valuenow={percent}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div style={{ width: `${percent}%` }} />
          </div>
          <span className="breakdown-count">{count}</span>
        </div>
      );
    })}
  </div>
);

const ReviewForm = ({ initial, onSubmit, onCancel, busy }) => {
  const [rating, setRating] = useState(initial?.rating || 0);
  const [comment, setComment] = useState(initial?.comment || "");
  const length = comment.trim().length;
  const submit = (e) => {
    e.preventDefault();
    if (!rating) return toast.error("Choose a rating from 1 to 5 stars");
    if (length < MIN_LENGTH) return toast.error(`Write at least ${MIN_LENGTH} characters`);
    onSubmit({ rating, comment });
  };
  return (
    <form className="review-form" onSubmit={submit}>
      <StarInput value={rating} onChange={setRating} />
      <label className="form-label" htmlFor="review-comment">
        Your review
      </label>
      <textarea
        id="review-comment"
        className="form-control"
        rows={4}
        maxLength={MAX_LENGTH}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="What did you like or dislike? How did you use it?"
      />
      <small className="text-muted d-block mb-2">
        {length}/{MAX_LENGTH} characters (at least {MIN_LENGTH})
      </small>
      <div className="d-flex gap-2">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {initial ? "Save changes" : "Submit review"}
        </button>
        {onCancel && (
          <button type="button" className="btn btn-outline-secondary" onClick={onCancel}>
            Cancel
          </button>
        )}
      </div>
    </form>
  );
};

const ReviewItem = ({ review, mine, canDelete, onEdit, onDelete }) => (
  <li className={`review-item${mine ? " mine" : ""}`}>
    <div className="review-head">
      <StarRating value={review.rating} />
      <strong>{review.name}</strong>
      {review.verified && <span className="verified-badge">Verified Purchase</span>}
      {mine && <span className="badge text-bg-light">Your review</span>}
    </div>
    <small className="text-muted">
      {formatDate(review.createdAt)}
      {review.edited && " (edited)"}
    </small>
    <p className="review-text">{review.comment}</p>
    {(mine || canDelete) && (
      <div className="d-flex gap-2">
        {mine && (
          <button type="button" className="btn btn-sm btn-outline-primary" onClick={onEdit}>
            Edit
          </button>
        )}
        <button type="button" className="btn btn-sm btn-outline-danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    )}
  </li>
);

// The product page's "Ratings & reviews" section. onSummary(summary) reports
// the latest average and count so the page header can stay in step.
const Reviews = ({ productId, onSummary }) => {
  const [auth] = useAuth();
  const location = useLocation();
  const [summary, setSummary] = useState(emptySummary);
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [mine, setMine] = useState({ canReview: false, review: null });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const signedIn = Boolean(auth?.token);
  const isAdmin = auth?.user?.role === 1;

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/v1/review/product/${productId}`);
      setSummary(data.summary || emptySummary);
      setReviews(data.reviews || []);
      setPage(1);
      setPages(data.pages || 1);
      onSummary?.(data.summary || emptySummary);
    } catch (error) {
      console.error(error);
    }
  }, [productId, onSummary]);

  const loadMine = useCallback(async () => {
    if (!signedIn) return setMine({ canReview: false, review: null });
    try {
      const { data } = await axios.get(`/api/v1/review/product/${productId}/mine`);
      setMine({ canReview: Boolean(data.canReview), review: data.review || null });
    } catch (error) {
      console.error(error);
    }
  }, [productId, signedIn]);

  useEffect(() => {
    setEditing(false);
    load();
  }, [load]);
  useEffect(() => {
    loadMine();
  }, [loadMine]);

  const loadMore = async () => {
    try {
      const { data } = await axios.get(`/api/v1/review/product/${productId}?page=${page + 1}`);
      setReviews((current) => [...current, ...(data.reviews || [])]);
      setPage(page + 1);
      setPages(data.pages || pages);
    } catch (error) {
      console.error(error);
    }
  };

  const save = async (body) => {
    setBusy(true);
    try {
      const { data } = mine.review
        ? await axios.put(`/api/v1/review/${mine.review._id}`, body)
        : await axios.post(`/api/v1/review/product/${productId}`, body);
      toast.success(data.message);
      setEditing(false);
      await Promise.all([load(), loadMine()]);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to save your review"));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (review) => {
    const own = review._id === mine.review?._id;
    if (!window.confirm(own ? "Delete your review?" : `Delete ${review.name}'s review?`)) return;
    try {
      await axios.delete(`/api/v1/review/${review._id}`);
      toast.success("Review deleted");
      await Promise.all([load(), loadMine()]);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to delete the review"));
    }
  };

  // My review is shown on its own, above everyone else's.
  const others = reviews.filter((review) => review._id !== mine.review?._id);

  return (
    <section className="reviews mt-4" id="reviews" aria-labelledby="reviews-heading">
      <div className="section-header">
        <h2 className="section-heading" id="reviews-heading">
          Ratings &amp; reviews
        </h2>
      </div>
      <div className="reviews-layout">
        <div className="reviews-summary">
          <div className="reviews-average">{summary.count ? summary.average.toFixed(1) : "–"}</div>
          <RatingSummary average={summary.average} count={summary.count} />
          <Breakdown summary={summary} />
        </div>
        <div>
          {!signedIn ? (
            <p className="review-hint">
              <Link to="/login" state={location.pathname}>
                Log in
              </Link>{" "}
              to review this product.
            </p>
          ) : mine.review && !editing ? (
            <ul className="review-list">
              <ReviewItem
                review={mine.review}
                mine
                onEdit={() => setEditing(true)}
                onDelete={() => remove(mine.review)}
              />
            </ul>
          ) : mine.review || mine.canReview ? (
            <div className="review-form-wrap">
              <h3 className="h5">{mine.review ? "Edit your review" : "Write a review"}</h3>
              <ReviewForm
                key={mine.review?._id || "new"}
                initial={mine.review}
                busy={busy}
                onSubmit={save}
                onCancel={mine.review ? () => setEditing(false) : undefined}
              />
            </div>
          ) : (
            <p className="review-hint">
              Only customers who have received this product can review it.
            </p>
          )}

          {others.length === 0 && !mine.review ? (
            <p className="text-muted">No reviews yet.</p>
          ) : (
            <ul className="review-list">
              {others.map((review) => (
                <ReviewItem
                  key={review._id}
                  review={review}
                  canDelete={isAdmin}
                  onDelete={() => remove(review)}
                />
              ))}
            </ul>
          )}
          {page < pages && (
            <button type="button" className="btn btn-outline-primary" onClick={loadMore}>
              More reviews
            </button>
          )}
        </div>
      </div>
    </section>
  );
};

export default Reviews;
