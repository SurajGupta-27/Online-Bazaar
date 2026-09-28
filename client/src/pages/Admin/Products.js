import React, { useState, useEffect } from "react";
import AdminMenu from "../../components/Layout/AdminMenu";
import Layout from "../../components/Layout/Layout";
import axios from "axios";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import { Pagination } from "antd";
import { errorMessage } from "../../utils/errorMessage";
import { productImage } from "../../utils/productImage";

const PER_PAGE = 12;

const Products = () => {
  const [products, setProducts] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  //total count
  useEffect(() => {
    const getTotal = async () => {
      try {
        const { data } = await axios.get("/api/v1/product/product-count");
        setTotal(data?.total || 0);
      } catch (error) {
        console.log(error);
      }
    };
    getTotal();
  }, []);

  //products for the current page
  useEffect(() => {
    const getProducts = async () => {
      try {
        const { data } = await axios.get(
          `/api/v1/product/product-list/${page}?perPage=${PER_PAGE}`
        );
        setProducts(data?.products || []);
      } catch (error) {
        console.log(error);
        toast.error(errorMessage(error, "Unable to load products"));
      }
    };
    getProducts();
  }, [page]);
  return (
    <Layout title={"Dashboard - All Products"}>
      <div className="row">
        <div className="col-md-3">
          <AdminMenu />
        </div>
        <div className="col-md-9 ">
          <h1 className="text-center">All Products List</h1>
          <div className="d-flex flex-wrap">
            {products?.map((p) => (
              <Link
                key={p._id}
                to={`/dashboard/admin/product/${p.slug}`}
                className="product-link"
              >
                <div className="card m-2" style={{ width: "18rem" }}>
                  <img
                    src={productImage(p, 400)}
                    className="card-img-top"
                    alt={p.name}
                  />
                  <div className="card-body">
                    <h5 className="card-title">{p.name}</h5>
                    <p className="card-text">{p.description}</p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {total > PER_PAGE && (
            <div className="d-flex justify-content-center my-3">
              <Pagination
                current={page}
                pageSize={PER_PAGE}
                total={total}
                showSizeChanger={false}
                onChange={setPage}
              />
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default Products;