import React, { useState, useEffect, useRef } from "react";
import Layout from "./../components/Layout/Layout";
import { formatPrice } from "../utils/formatPrice";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { Checkbox, Radio } from "antd";
import { Prices } from "../components/Prices";
import { useCart } from "../context/cart";
import toast from "react-hot-toast";
const HomePage = () => {
  const navigate = useNavigate();
  const [, , addToCart] = useCart();
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [checked, setChecked] = useState([]);
  const [radio, setRadio] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Bumped whenever the filters change, so responses for old filters are ignored.
  const requestVersion = useRef(0);
  const filtersActive = checked.length > 0 || radio.length > 0;

  //get all cat
  const getAllCategory = async () => {
    try {
      const { data } = await axios.get("/api/v1/category/get-category");
      if (data?.success) {
        setCategories(data?.category);
      }
    } catch (error) {
      console.log(error);
    }
  };

  useEffect(() => {
    getAllCategory();
    getTotal();
  }, []);

  //getTOtal COunt
  const getTotal = async () => {
    try {
      const { data } = await axios.get("/api/v1/product/product-count");
      setTotal(data?.total);
    } catch (error) {
      console.log(error);
    }
  };

  // Show the filtered results, or the first page when no filter is set.
  useEffect(() => {
    const version = ++requestVersion.current;
    const load = async () => {
      try {
        setLoading(true);
        setError("");
        const { data } = filtersActive
          ? await axios.post("/api/v1/product/product-filters", { checked, radio })
          : await axios.get("/api/v1/product/product-list/1");
        if (version !== requestVersion.current) return;
        setProducts(data?.products || []);
        setPage(1);
      } catch (error) {
        if (version !== requestVersion.current) return;
        console.log(error);
        setError(
          error.response?.data?.message ||
            "Products are unavailable. Check the database connection."
        );
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    };
    load();
  }, [checked, radio, filtersActive]);

  //load more (unfiltered list only)
  const loadMore = async () => {
    const version = requestVersion.current;
    const nextPage = page + 1;
    try {
      setLoading(true);
      const { data } = await axios.get(`/api/v1/product/product-list/${nextPage}`);
      if (version !== requestVersion.current) return;
      setProducts((current) => [...current, ...(data?.products || [])]);
      setPage(nextPage);
    } catch (error) {
      console.log(error);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  };

  // filter by cat
  const handleFilter = (value, id) => {
    setChecked((current) =>
      value ? [...current, id] : current.filter((c) => c !== id)
    );
  };

  const resetFilters = () => {
    setChecked([]);
    setRadio([]);
  };
  return (
    <Layout title={"ALl Products - Best offers "}>
      <div className="container-fluid row mt-3">
        <div className="col-md-2">
          <h4 className="text-center">Filter By Category</h4>
          <div className="d-flex flex-column">
            {categories?.map((c) => (
              <Checkbox
                key={c._id}
                checked={checked.includes(c._id)}
                onChange={(e) => handleFilter(e.target.checked, c._id)}
              >
                {c.name}
              </Checkbox>
            ))}
          </div>
          {/* price filter */}
          <h4 className="text-center mt-4">Filter By Price</h4>
          <div className="d-flex flex-column">
            <Radio.Group value={radio} onChange={(e) => setRadio(e.target.value)}>
              {Prices?.map((p) => (
                <div key={p._id}>
                  <Radio value={p.array}>{p.name}</Radio>
                </div>
              ))}
            </Radio.Group>
          </div>
          <div className="d-flex flex-column">
            <button
              className="btn btn-danger"
              onClick={resetFilters}
            >
              RESET FILTERS
            </button>
          </div>
        </div>
        <div className="col-md-9 offset-1">
          <h1 className="text-center">All Products</h1>
          {error && <div className="alert alert-warning" role="alert">{error}</div>}
          {!loading && !error && products.length === 0 && (
            <div className="empty-state text-center p-5">
              {filtersActive ? (
                <h3>No products match these filters</h3>
              ) : (
                <>
                  <h3>No products yet</h3>
                  <p className="text-muted">Add products from the admin dashboard once MongoDB is connected.</p>
                </>
              )}
            </div>
          )}
          <div className="d-flex flex-wrap">
            {products?.map((p) => (
              <div className="card m-2" style={{ width: "18rem" }} key={p._id}>
                <img
                  src={`/api/v1/product/product-photo/${p._id}`}
                  className="card-img-top"
                  alt={p.name}
                />
                <div className="card-body">
                  <h5 className="card-title">{p.name}</h5>
                  <p className="card-text">
                    {p.description.substring(0, 30)}...
                  </p>
                  <p className="card-text">{formatPrice(p.price)}</p>
                  <button
                    className="btn btn-primary ms-1"
                    onClick={() => navigate(`/product/${p.slug}`)}
                  >
                    More Details
                  </button>
                  <button
                    className="btn btn-secondary ms-1"
                    onClick={() => {
                      const added = addToCart(p);
                      toast[added ? "success" : "error"](
                        added ? "Item added to cart" : "Item is already in cart"
                      );
                    }}
                  >
                    ADD TO CART
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="m-2 p-3">
            {!filtersActive && products.length < total && (
              <button
                className="btn btn-warning"
                disabled={loading}
                onClick={(e) => {
                  e.preventDefault();
                  loadMore();
                }}
              >
                {loading ? "Loading ..." : "Loadmore"}
              </button>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default HomePage;