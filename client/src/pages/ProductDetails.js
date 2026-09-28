import React, { useState, useEffect } from "react";
import Layout from "../components/Layout/Layout";
import { formatPrice } from "../utils/formatPrice";
import axios from "axios";
import { useParams, Link } from "react-router-dom";
import { useCart } from "../context/cart";
import toast from "react-hot-toast";
import ProductCard from "../components/Product/ProductCard";
const ProductDetails = () => {
  const params = useParams();
  const [, , addToCart] = useCart();
  const [product, setProduct] = useState({});
  const [relatedProducts, setRelatedProducts] = useState([]);

  //initalp details
  useEffect(() => {
    if (params?.slug) getProduct();
  }, [params?.slug]);
  //getProduct
  const getProduct = async () => {
    try {
      const { data } = await axios.get(
        `/api/v1/product/get-product/${params.slug}`
      );
      setProduct(data?.product || {});
      if (data?.product?.category?._id) {
        getSimilarProduct(data.product._id, data.product.category._id);
      }
    } catch (error) {
      console.log(error);
    }
  };
  //get similar product
  const getSimilarProduct = async (pid, cid) => {
    try {
      const { data } = await axios.get(
        `/api/v1/product/related-product/${pid}/${cid}`
      );
      setRelatedProducts(data?.products || []);
    } catch (error) {
      console.log(error);
    }
  };
  const inStock = Number(product.quantity) > 0;
  return (
    <Layout title={product.name}>
      <div className="container">
        {!product._id ? (
          <div className="empty-state my-4">
            <h3>Product Details</h3>
            <p className="text-muted">Loading, or this product is no longer available.</p>
          </div>
        ) : (
          <div className="product-detail">
            <div className="product-detail-media">
              <img
                src={`/api/v1/product/product-photo/${product._id}`}
                className="main-image"
                alt={product.name}
              />
            </div>
            <div className="product-detail-info">
              {product.category?.name && (
                <Link
                  to={`/category/${product.category.slug}`}
                  className="product-card-category text-decoration-none"
                >
                  {product.category.name}
                </Link>
              )}
              <h1>{product.name}</h1>
              <span className="price">{formatPrice(product.price)}</span>
              <p>{product.description}</p>
              <dl>
                <dt>Availability</dt>
                <dd className={inStock ? "text-success" : "text-danger"}>
                  {inStock ? "In stock" : "Out of stock"}
                </dd>
                <dt>Delivery</dt>
                <dd>{product.shipping ? "Ships to your address" : "Store pickup only"}</dd>
              </dl>
              <button
                className="btn btn-secondary btn-lg px-4"
                disabled={!inStock}
                onClick={() => {
                  const added = addToCart(product);
                  toast[added ? "success" : "error"](
                    added ? "Item added to cart" : "Item is already in cart"
                  );
                }}
              >
                Add to Cart
              </button>
            </div>
          </div>
        )}
        <section className="mt-4">
          <div className="section-header">
            <h2 className="section-heading">Similar products</h2>
          </div>
          {relatedProducts.length < 1 && (
            <p className="text-muted">No similar products found</p>
          )}
          <div className="product-grid">
            {relatedProducts?.map((p) => (
              <ProductCard key={p._id} product={p} />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  );
};

export default ProductDetails;