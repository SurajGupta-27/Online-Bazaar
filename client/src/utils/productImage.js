// Product images live on Cloudinary (product.images, first = main). Products
// not yet migrated, and cart items saved before images existed, fall back to
// the API's photo endpoint, which also redirects to the main image.
const legacyPhoto = (product) =>
  product?._id ? `/api/v1/product/product-photo/${product._id}` : "";

// Asks Cloudinary for a resized, best-format copy (WebP/AVIF where the browser
// supports it) instead of the full original, to save bandwidth.
export const sizedImage = (url, width) => {
  if (!url || !url.includes("res.cloudinary.com/") || !url.includes("/image/upload/")) {
    return url;
  }
  const transform = ["f_auto", "q_auto", width && `c_limit,w_${width}`].filter(Boolean).join(",");
  return url.replace("/image/upload/", `/image/upload/${transform}/`);
};

// Every image URL for a product, main image first.
export const productImages = (product, width) => {
  if (product?.images?.length) {
    return product.images.map((image) => sizedImage(image.url, width));
  }
  const legacy = legacyPhoto(product);
  return legacy ? [legacy] : [];
};

export const productImage = (product, width) => productImages(product, width)[0] || "";
