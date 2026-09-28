// Store identity, used for page titles, the header/footer and payment popups.
export const BRAND = {
  name: "Online Bazaar",
  owner: "Suraj Gupta",
  tagline: "Everything you need, delivered to your door",
};

// "Login" -> "Login | Online Bazaar"; the home page uses the brand alone.
export const pageTitle = (title) =>
  !title || title === BRAND.name || title.includes(BRAND.name)
    ? title || `${BRAND.name} | ${BRAND.tagline}`
    : `${title} | ${BRAND.name}`;
