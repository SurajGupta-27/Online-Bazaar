import React from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useCart } from "../../context/cart";
import { formatPrice } from "../../utils/formatPrice";
import { productImage } from "../../utils/productImage";

// The product tile used by every product listing (home, category, search,
// similar products), so they all look and behave the same.
const ProductCard = ({ product }) => {
  const navigate = useNavigate();
  const [, , addToCart] = useCart();
  const open = () => navigate(`/product/${product.slug}`);
  const outOfStock = Number(product.quantity) === 0;
  return (
    <div className="product-card">
      <button type="button" className="product-card-media" onClick={open} aria-label={product.name}>
        <img
          src={productImage(product, 400)}
          alt={product.name}
          loading="lazy"
        />
      </button>
      <div className="product-card-body">
        {product.category?.name && (
          <span className="product-card-category">{product.category.name}</span>
        )}
        <h5 className="product-card-title">{product.name}</h5>
        <p className="product-card-text">
          {product.description?.length > 60
            ? `${product.description.substring(0, 60)}...`
            : product.description}
        </p>
        <div className="product-card-footer">
          <span className="price">{formatPrice(product.price)}</span>
          {outOfStock && <span className="stock-badge">Out of stock</span>}
        </div>
        <div className="product-card-actions">
          <button className="btn btn-outline-primary btn-sm" onClick={open}>
            More Details
          </button>
          <button
            className="btn btn-secondary btn-sm"
            disabled={outOfStock}
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
    </div>
  );
};

export default ProductCard;
