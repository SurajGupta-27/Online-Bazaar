// Escape user input so it matches literally inside a MongoDB $regex.
export const escapeRegex = (value) =>
  value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
