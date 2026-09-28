import React from "react";
import { Link } from "react-router-dom";
import { BiChevronRight } from "react-icons/bi";
import useCategory from "../hooks/useCategory";
import Layout from "../components/Layout/Layout";

const Categories = () => {
  const categories = useCategory();
  return (
    <Layout title={"All Categories"}>
      <div className="container py-4">
        <div className="section-header">
          <h1 className="section-heading">Shop by category</h1>
          <span className="text-muted">{categories.length} categories</span>
        </div>
        <div className="category-grid">
          {categories.map((c) => (
            <Link key={c._id} to={`/category/${c.slug}`} className="category-tile">
              {c.name}
              <BiChevronRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </div>
    </Layout>
  );
};

export default Categories;
