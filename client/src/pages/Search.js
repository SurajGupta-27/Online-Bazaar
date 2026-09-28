import React from "react";
import Layout from "../components/Layout/Layout";
import { useSearch } from "../context/search";
import ProductCard from "../components/Product/ProductCard";

const Search = () => {
  const [values] = useSearch();
  const count = values?.results.length || 0;
  return (
    <Layout title={"Search results"}>
      <div className="container py-4">
        <div className="section-header">
          <h1 className="section-heading">Search results</h1>
          <span className="text-muted">
            {count < 1 ? "No products found" : `${count} ${count === 1 ? "product" : "products"} found`}
          </span>
        </div>
        <div className="product-grid">
          {values?.results.map((p) => (
            <ProductCard key={p._id} product={p} />
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Search;
