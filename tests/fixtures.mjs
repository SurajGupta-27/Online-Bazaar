import { ObjectId } from "./harness.mjs";
export async function adminSetup(api, db) {
  await api("POST", "/api/v1/auth/register", { name: "Admin", email: "admin@x.com", password: "secret1", phone: "1", address: "a", answer: "a" });
  await db.collection("users").updateOne({ email: "admin@x.com" }, { $set: { role: 1 } });
  const { json } = await api("POST", "/api/v1/auth/login", { email: "admin@x.com", password: "secret1" });
  const cat = await api("POST", "/api/v1/category/create-category", { name: "Books" }, { token: json.token });
  return { token: json.token, categoryId: cat.json.category._id };
}
// 1x1 PNG
export const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
export function productForm(categoryId, { name = "Book", photo, type = "image/png", filename = "p.png" } = {}) {
  const fd = new FormData();
  if (name) fd.append("name", name);
  fd.append("description", "desc");
  fd.append("price", "12");
  fd.append("quantity", "3");
  fd.append("category", categoryId);
  fd.append("shipping", "1");
  if (photo) fd.append("photo", new Blob([photo], { type }), filename);
  return fd;
}
export { ObjectId };
