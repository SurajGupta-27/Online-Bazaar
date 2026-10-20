import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import AdminMenu from "../../components/Layout/AdminMenu";
import Layout from "../../components/Layout/Layout";
import { StarRating } from "../../components/Product/StarRating";
import axios from "axios";
import toast from "react-hot-toast";
import { errorMessage } from "../../utils/errorMessage";

// Every review in the store, newest first, so inappropriate ones can be removed.
const Reviews = () => {
  const [reviews, setReviews] = useState([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);

  const load = useCallback(async (pageToLoad) => {
    try {
      const { data } = await axios.get(`/api/v1/review/all?page=${pageToLoad}`);
      setReviews(data.reviews || []);
      setPages(data.pages || 1);
      setTotal(data.total || 0);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to load reviews"));
    }
  }, []);

  useEffect(() => {
    load(page);
  }, [load, page]);

  const remove = async (review) => {
    if (!window.confirm(`Delete ${review.name}'s review of ${review.product?.name || "this product"}?`)) {
      return;
    }
    try {
      await axios.delete(`/api/v1/review/${review._id}`);
      toast.success("Review deleted");
      load(page);
    } catch (error) {
      toast.error(errorMessage(error, "Unable to delete the review"));
    }
  };

  return (
    <Layout title={"Dashboard - Reviews"}>
      <div className="container-fluid m-3 p-3">
        <div className="row">
          <div className="col-md-3">
            <AdminMenu />
          </div>
          <div className="col-md-9">
            <h1>Reviews</h1>
            <p className="text-muted">{total} in total, newest first</p>
            {reviews.length === 0 ? (
              <p>No reviews yet.</p>
            ) : (
              <div className="table-responsive">
                <table className="table align-middle">
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Customer</th>
                      <th scope="col">Rating</th>
                      <th scope="col">Review</th>
                      <th scope="col">Date</th>
                      <th scope="col">
                        <span className="visually-hidden">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviews.map((review) => (
                      <tr key={review._id}>
                        <td>
                          {review.product ? (
                            <Link to={`/product/${review.product.slug}`}>{review.product.name}</Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td>
                          {review.name}
                          <small className="d-block text-muted">{review.email}</small>
                        </td>
                        <td>
                          <StarRating value={review.rating} />
                        </td>
                        <td className="review-text">{review.comment}</td>
                        <td>{new Date(review.createdAt).toLocaleDateString("en-IN")}</td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            onClick={() => remove(review)}
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <div className="d-flex gap-2 align-items-center">
                <button
                  className="btn btn-outline-primary btn-sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </button>
                <span>
                  Page {page} of {pages}
                </span>
                <button
                  className="btn btn-outline-primary btn-sm"
                  disabled={page >= pages}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default Reviews;
