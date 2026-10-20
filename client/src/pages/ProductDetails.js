import React, { useState, useEffect, useCallback } from "react";
import Layout from "../components/Layout/Layout";
import { formatPrice } from "../utils/formatPrice";
import axios from "axios";
import { useParams, Link } from "react-router-dom";
import { useCart } from "../context/cart";
import toast from "react-hot-toast";
import ProductCard from "../components/Product/ProductCard";
import Reviews from "../components/Product/Reviews";
import { RatingSummary } from "../components/Product/StarRating";
import { productImages } from "../utils/productImage";
const ProductDetails = () => {
  const { slug } = useParams();
  const [, , addToCart] = useCart();
  const [product, setProduct] = useState({});
  const [relatedProducts, setRelatedProducts] = useState([]);
  const [activeImage, setActiveImage] = useState(0);

  // The product, then products from the same category.
  useEffect(() => {
    if (!slug) return;
    const load = async () => {
      try {
        const { data } = await axios.get(`/api/v1/product/get-product/${slug}`);
        setProduct(data?.product || {});
        setActiveImage(0);
        const { _id: pid, category } = data?.product || {};
        if (category?._id) {
          const related = await axios.get(`/api/v1/product/related-product/${pid}/${category._id}`);
          setRelatedProducts(related.data?.products || []);
        }
      } catch (error) {
        console.log(error);
      }
    };
    load();
  }, [slug]);

  // Keeps the header's rating in step after a review is added or changed.
  const updateRating = useCallback(
    (summary) =>
      setProduct((current) => ({
        ...current,
        ratingAverage: summary.average,
        ratingCount: summary.count,
      })),
    []
  );
  const inStock = Number(product.quantity) > 0;
  const images = productImages(product, 900);
  const thumbnails = productImages(product, 160);
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
                src={images[activeImage] || images[0]}
                className="main-image"
                alt={product.name}
              />
              {images.length > 1 && (
                <div className="gallery-thumbs" role="group" aria-label="Product photos">
                  {thumbnails.map((src, index) => (
                    <button
                      type="button"
                      key={src}
                      className={`gallery-thumb${index === activeImage ? " selected" : ""}`}
                      aria-label={`Show photo ${index + 1} of ${images.length}`}
                      aria-pressed={index === activeImage}
                      onClick={() => setActiveImage(index)}
                    >
                      <img src={src} alt="" />
                    </button>
                  ))}
                </div>
              )}
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
              <a href="#reviews" className="rating-link">
                <RatingSummary average={product.ratingAverage} count={product.ratingCount} />
              </a>
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
        {product._id && <Reviews productId={product._id} onSummary={updateRating} />}
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