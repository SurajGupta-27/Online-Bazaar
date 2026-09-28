// Loads Razorpay Checkout on first use and resolves to the Razorpay
// constructor, or null if the script can't be loaded (offline, blocked).
const CHECKOUT_URL = "https://checkout.razorpay.com/v1/checkout.js";
let loading;

export const loadRazorpay = () => {
  if (window.Razorpay) return Promise.resolve(window.Razorpay);
  if (!loading) {
    loading = new Promise((resolve) => {
      const script = document.createElement("script");
      script.src = CHECKOUT_URL;
      script.async = true;
      script.onload = () => resolve(window.Razorpay || null);
      script.onerror = () => {
        loading = undefined; // allow a retry next time
        script.remove();
        resolve(null);
      };
      document.body.appendChild(script);
    });
  }
  return loading;
};
