import React, { useState, useEffect, useRef } from "react";
import Layout from "../components/Layout/Layout";
import { useParams } from "react-router-dom";
import axios from "axios";
import ProductCard from "../components/Product/ProductCard";
const CategoryProduct = () => {
  const params = useParams();
  const [products, setProducts] = useState([]);
  const [category, setCategory] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  // The slug the latest request was for, so a late response for a previously
  // viewed category is ignored.
  const currentSlug = useRef(params?.slug);

  const getPrductsByCat = async (slug, pageToLoad) => {
    try {
      setLoading(true);
      const { data } = await axios.get(
        `/api/v1/product/product-category/${slug}?page=${pageToLoad}`
      );
      if (slug !== currentSlug.current) return;
      setProducts((current) =>
        pageToLoad === 1 ? data?.products || [] : [...current, ...(data?.products || [])]
      );
      setCategory(data?.category);
      setTotal(data?.total || 0);
      setPage(pageToLoad);
    } catch (error) {
      console.error(error);
    } finally {
      if (slug === currentSlug.current) setLoading(false);
    }
  };

  // Start again from page 1 whenever the category changes.
  useEffect(() => {
    currentSlug.current = params?.slug;
    setProducts([]);
    setTotal(0);
    if (params?.slug) getPrductsByCat(params.slug, 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.slug]);

  return (
    <Layout title={category?.name}>
      <div className="container py-4">
        <div className="section-header">
          <h1 className="section-heading">{category?.name}</h1>
          <span className="text-muted">
            {total} {total === 1 ? "product" : "products"}
          </span>
        </div>
        {!loading && products.length === 0 && (
          <div className="empty-state">
            <h3>No products in this category yet</h3>
          </div>
        )}
        <div className="product-grid">
          {products?.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
        {products.length < total && (
          <div className="load-more">
            <button
              className="btn btn-primary px-4"
              disabled={loading}
              onClick={(e) => {
                e.preventDefault();
                getPrductsByCat(params.slug, page + 1);
              }}
            >
              {loading ? "Loading ..." : "Load more"}
            </button>
          </div>
        )}
      </div>
    </Layout>
  );
};

export default CategoryProduct;