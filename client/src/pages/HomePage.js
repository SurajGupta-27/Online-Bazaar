import React, { useState, useEffect, useRef } from "react";
import Layout from "./../components/Layout/Layout";
import { Link } from "react-router-dom";
import axios from "axios";
import { Checkbox, Radio } from "antd";
import { Prices } from "../components/Prices";
import ProductCard from "../components/Product/ProductCard";
import { BiCategory, BiPackage, BiShieldQuarter } from "react-icons/bi";
import { BRAND } from "../brand";

// "Sort by" choices; the values are the API's sort names.
export const SORT_OPTIONS = [
  { value: "newest", label: "Newest" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Highest rated" },
];

// The product-list URL for a page; the default sort isn't sent.
const listUrl = (page, sort) =>
  `/api/v1/product/product-list/${page}${sort === "newest" ? "" : `?sort=${sort}`}`;

const HomePage = () => {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [checked, setChecked] = useState([]);
  const [radio, setRadio] = useState([]);
  const [sort, setSort] = useState("newest");
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
      console.error(error);
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
      console.error(error);
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
          ? await axios.post("/api/v1/product/product-filters", {
              checked,
              radio,
              ...(sort === "newest" ? {} : { sort }),
            })
          : await axios.get(listUrl(1, sort));
        if (version !== requestVersion.current) return;
        setProducts(data?.products || []);
        setPage(1);
      } catch (error) {
        if (version !== requestVersion.current) return;
        setError(
          error.response?.data?.message ||
            "Products are unavailable. Check the database connection."
        );
      } finally {
        if (version === requestVersion.current) setLoading(false);
      }
    };
    load();
  }, [checked, radio, filtersActive, sort]);

  //load more (unfiltered list only)
  const loadMore = async () => {
    const version = requestVersion.current;
    const nextPage = page + 1;
    try {
      setLoading(true);
      const { data } = await axios.get(listUrl(nextPage, sort));
      if (version !== requestVersion.current) return;
      setProducts((current) => [...current, ...(data?.products || [])]);
      setPage(nextPage);
    } catch (error) {
      console.error(error);
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
  const shopNow = () =>
    document.getElementById("products")?.scrollIntoView({ behavior: "smooth" });

  return (
    <Layout>
      <div className="container">
        <section className="hero">
          <div className="hero-grid">
            <div>
              <span className="hero-eyebrow">Welcome to {BRAND.name}</span>
              <h1>Everything you love, at prices you'll love more.</h1>
              <p>
                Shop electronics, fashion, beauty, home essentials and more, all
                priced in rupees, with Cash on Delivery or secure online payment.
              </p>
              <div className="hero-actions">
                <button className="btn btn-light" onClick={shopNow}>
                  Shop now
                </button>
                <Link to="/categories" className="btn btn-outline-light">
                  Browse categories
                </Link>
              </div>
            </div>
            {categories.length > 0 && (
              <nav className="hero-categories" aria-label="Popular categories">
                {categories.slice(0, 6).map((c) => (
                  <Link key={c._id} to={`/category/${c.slug}`} className="hero-category">
                    {c.name}
                  </Link>
                ))}
              </nav>
            )}
          </div>
        </section>

        <section className="trust-strip" aria-label="Why shop with us">
          <div className="trust-item">
            <span className="trust-icon" aria-hidden="true"><BiPackage /></span>
            <div>
              <strong>Cash on Delivery</strong>
              <span>Pay when your order arrives</span>
            </div>
          </div>
          <div className="trust-item">
            <span className="trust-icon" aria-hidden="true"><BiShieldQuarter /></span>
            <div>
              <strong>Secure payments</strong>
              <span>UPI, cards and netbanking via Razorpay</span>
            </div>
          </div>
          <div className="trust-item">
            <span className="trust-icon" aria-hidden="true"><BiCategory /></span>
            <div>
              <strong>{total > 0 ? `${total} products` : "Growing catalogue"}</strong>
              <span>
                {categories.length > 0
                  ? `Across ${categories.length} ${categories.length === 1 ? "category" : "categories"}`
                  : "New products added regularly"}
              </span>
            </div>
          </div>
        </section>

        <div className="shop-layout" id="products">
          <aside className="filter-panel">
            <h4>Category</h4>
            <div className="filter-group">
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
            <h4>Price</h4>
            <div className="filter-group">
              <Radio.Group value={radio} onChange={(e) => setRadio(e.target.value)}>
                {Prices?.map((p) => (
                  <div key={p._id}>
                    <Radio value={p.array}>{p.name}</Radio>
                  </div>
                ))}
              </Radio.Group>
            </div>
            <button
              className="btn btn-outline-primary w-100 mt-3"
              onClick={resetFilters}
              disabled={!filtersActive}
            >
              Reset filters
            </button>
          </aside>
          <section>
            <div className="section-header">
              <h2 className="section-heading">
                {filtersActive ? "Filtered products" : "All products"}
              </h2>
              <div className="section-tools">
                {!filtersActive && total > 0 && (
                  <span className="text-muted">{total} items</span>
                )}
                <label className="sort-control">
                  <span>Sort by</span>
                  <select
                    className="form-select form-select-sm"
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    {SORT_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            {error && <div className="alert alert-warning" role="alert">{error}</div>}
            {!loading && !error && products.length === 0 && (
              <div className="empty-state">
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
            <div className="product-grid">
              {products?.map((p) => (
                <ProductCard key={p._id} product={p} />
              ))}
            </div>
            {!filtersActive && products.length < total && (
              <div className="load-more">
                <button
                  className="btn btn-primary px-4"
                  disabled={loading}
                  onClick={(e) => {
                    e.preventDefault();
                    loadMore();
                  }}
                >
                  {loading ? "Loading ..." : "Load more"}
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default HomePage;