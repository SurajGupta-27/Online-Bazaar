import { withServer, check, ObjectId } from "./harness.mjs";
import { adminSetup, PNG, productForm } from "./fixtures.mjs";
import { startMockCloudinary, cloudinaryEnv } from "./mockCloudinary.mjs";

const mock = await startMockCloudinary();
const env = cloudinaryEnv(mock);
const html = Buffer.from("<script>alert(document.cookie)</script>");
const productIn = (db, id) => db.collection("products").findOne({ _id: new ObjectId(id) });

try {
  // Upload rules: image types only, 1MB each, at most 6 per product.
  await withServer(async ({ api, db }) => {
    const { token, categoryId } = await adminSetup(api, db);
    const h = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Evil", photo: html, type: "text/html", filename: "x.html" }), { token });
    check("text/html upload rejected (400)", h.status === 400 && /JPEG, PNG/.test(h.json?.message), h.text);
    const svg = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Svg", photos: [{ bytes: Buffer.from("<svg/>"), type: "image/svg+xml", filename: "x.svg" }] }), { token });
    check("SVG upload rejected (400)", svg.status === 400, svg.text);
    const forged = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Forged", photos: [{ bytes: html, type: "image/png" }] }), { token });
    check("HTML disguised as image/png rejected by Cloudinary (400)", forged.status === 400 && /could not be read/.test(forged.json?.message), forged.text);
    const seven = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Seven", photos: Array(7).fill({}) }), { token });
    check("7 photos rejected (400)", seven.status === 400 && /at most 6/.test(seven.json?.message), seven.text);
    const bigOne = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Big", photos: [{}, { bytes: Buffer.concat([PNG, Buffer.alloc(1_100_000)]) }] }), { token });
    check("one photo over 1MB among several rejected (413)", bigOne.status === 413 && bigOne.json?.message === "Photo must be less than 1MB", bigOne.text);
    check("rejected products not saved", (await db.collection("products").countDocuments()) === 0);
    check("nothing uploaded for rejected products", mock.state.uploads.length === 0, JSON.stringify(mock.state.uploads));
  }, { env });

  // Create, reorder, remove, add and delete images.
  mock.state.uploads.length = 0;
  await withServer(async ({ api, db }) => {
    const { token, categoryId } = await adminSetup(api, db);
    const one = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { photo: PNG }), { token });
    const p1 = one.json?.products;
    check("single photo (old field) goes to Cloudinary", one.status === 201 && p1.images.length === 1 && p1.images[0].url.startsWith("https://res.cloudinary.com/"), one.text);
    check("create response has no photo bytes and is small", !("photo" in p1) && one.text.length < 1000, `${one.text.length} bytes`);
    check("images stored in the product folder", mock.state.uploads.every((u) => u.folder === "online-bazaar/products" && u.source === "bytes"));
    const stored = await productIn(db, p1._id);
    check("no photo bytes stored in MongoDB", !stored.photo?.data, JSON.stringify(stored.photo));

    const three = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Gallery", photos: [{}, {}, {}] }), { token });
    const gallery = three.json?.products;
    check("three photos -> three images", three.status === 201 && gallery.images.length === 3, three.text);
    const ids = gallery.images.map((i) => i.publicId);

    const list = await api("GET", "/api/v1/product/product-list/1");
    const listed = list.json.products.find((p) => p._id === gallery._id);
    check("product lists include image urls", listed?.images?.length === 3);
    const one2 = await api("GET", `/api/v1/product/get-product/${gallery.slug}`);
    check("product details include images in order", JSON.stringify(one2.json.product.images.map((i) => i.publicId)) === JSON.stringify(ids));

    const redirect = await api("GET", `/api/v1/product/product-photo/${gallery._id}`, null, { redirect: "manual" });
    check("photo endpoint redirects to the main Cloudinary image", redirect.status === 302 && redirect.headers.get("location") === gallery.images[0].url, `${redirect.status} ${redirect.headers.get("location")}`);

    // Reorder: make the third image main, drop the second.
    const re = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, productForm(categoryId, { name: "Gallery", images: [ids[2], ids[0]] }), { token });
    check("update keeps chosen images in the chosen order", re.status === 201 && JSON.stringify(re.json.products.images.map((i) => i.publicId)) === JSON.stringify([ids[2], ids[0]]), re.text);
    check("removed image deleted from Cloudinary", mock.state.destroyed.includes(ids[1]) && mock.state.destroyed.length === 1, JSON.stringify(mock.state.destroyed));

    const add = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, productForm(categoryId, { name: "Gallery", photos: [{}] }), { token });
    check("update without an image list keeps images and appends new ones", add.status === 201 && add.json.products.images.length === 3 && add.json.products.images[0].publicId === ids[2], add.text);

    const tooMany = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, productForm(categoryId, { name: "Gallery", photos: [{}, {}, {}, {}] }), { token });
    check("update past 6 images in total rejected", tooMany.status === 400 && /at most 6/.test(tooMany.json?.message), tooMany.text);

    const foreign = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, productForm(categoryId, { name: "Gallery", images: [p1.images[0].publicId] }), { token });
    check("cannot attach another product's image", foreign.status === 400 && foreign.json?.message === "Invalid image list", foreign.text);
    const junk = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, (() => { const f = productForm(categoryId, { name: "Gallery" }); f.append("images", "{not json"); return f; })(), { token });
    check("malformed image list rejected", junk.status === 400, junk.text);
    check("rejected updates changed nothing", (await productIn(db, gallery._id)).images.length === 3);

    // A new upload can become the main image: "new:0" places it in the order.
    const cur = (await productIn(db, gallery._id)).images.map((i) => i.publicId);
    const newMain = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, productForm(categoryId, { name: "Gallery", photos: [{}], images: ["new:0", cur[0], cur[2]] }), { token });
    const order = newMain.json?.products?.images.map((i) => i.publicId) || [];
    check("new upload placed first with new:0", newMain.status === 201 && order.length === 3 && !cur.includes(order[0]) && order[1] === cur[0] && order[2] === cur[2], newMain.text);
    check("image left out of the order is deleted", mock.state.destroyed.includes(cur[1]));
    const badNew = await api("PUT", `/api/v1/product/update-product/${gallery._id}`, productForm(categoryId, { name: "Gallery", photos: [{}], images: ["new:1"] }), { token });
    check("new:<n> past the uploaded photos rejected", badNew.status === 400 && badNew.json?.message === "Invalid image list", badNew.text);

    const before = mock.state.destroyed.length;
    const current = (await productIn(db, gallery._id)).images.map((i) => i.publicId);
    const del = await api("DELETE", `/api/v1/product/delete-product/${gallery._id}`, null, { token });
    const destroyed = mock.state.destroyed.slice(before);
    check("deleting a product deletes its images", del.status === 200 && current.every((id) => destroyed.includes(id)), JSON.stringify(destroyed));
    check("all requests were correctly signed", mock.state.badSignatures === 0);
  }, { env });

  // A failed upload leaves nothing behind.
  await withServer(async ({ api, db }) => {
    const { token, categoryId } = await adminSetup(api, db);
    const before = mock.state.assets.size;
    mock.state.failNextUploads = 1;
    const r = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Flaky", photos: [{}, {}] }), { token });
    mock.state.failNextUploads = 0;
    check("Cloudinary failure -> 502 with a friendly message", r.status === 502 && /try again/.test(r.json?.message), r.text);
    check("product not saved after failed upload", (await db.collection("products").countDocuments({ name: "Flaky" })) === 0);
    check("images that did upload are deleted again", mock.state.assets.size === before, `${mock.state.assets.size} vs ${before}`);
  }, { env });

  // Legacy photos stored in MongoDB still work until they are migrated.
  await withServer(async ({ api, db }) => {
    const { token, categoryId } = await adminSetup(api, db);
    const legacy = new ObjectId();
    await db.collection("products").insertOne({ _id: legacy, name: "Old", slug: "old", description: "d", price: 1, category: new ObjectId(categoryId), quantity: 1, photo: { data: PNG, contentType: "image/png" } });
    const img = await api("GET", `/api/v1/product/product-photo/${legacy}`);
    check("legacy PNG served as image/png with nosniff", img.status === 200 && img.headers.get("content-type").startsWith("image/png") && img.headers.get("x-content-type-options") === "nosniff");
    const evil = new ObjectId();
    await db.collection("products").insertOne({ _id: evil, name: "Evil", slug: "evil", description: "d", price: 1, category: new ObjectId(categoryId), quantity: 1, photo: { data: html, contentType: "text/html" } });
    const lh = await api("GET", `/api/v1/product/product-photo/${evil}`);
    check("legacy text/html photo not served", lh.status === 404 && !lh.text.includes("<script>"), `${lh.status} ${lh.headers.get("content-type")}`);

    const upd = await api("PUT", `/api/v1/product/update-product/${legacy}`, productForm(categoryId, { name: "Old", photos: [{}] }), { token });
    const after = await productIn(db, legacy);
    check("uploading images to a legacy product drops its MongoDB photo", upd.status === 201 && after.images.length === 1 && !after.photo, JSON.stringify(after.photo));
  }, { env });

  // Without Cloudinary settings, products without photos still work.
  await withServer(async ({ api, db }) => {
    const { token, categoryId } = await adminSetup(api, db);
    const plain = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Plain" }), { token });
    check("product without photos created when Cloudinary is not configured", plain.status === 201 && plain.json.products.images.length === 0, plain.text);
    const withPhoto = await api("POST", "/api/v1/product/create-product", productForm(categoryId, { name: "Pic", photo: PNG }), { token });
    check("photo upload without Cloudinary -> 503", withPhoto.status === 503 && /not configured/.test(withPhoto.json?.message), withPhoto.text);
    for (const id of ["undefined", "not-an-id", String(new ObjectId()), plain.json.products._id]) {
      const r = await api("GET", `/api/v1/product/product-photo/${id}`);
      check(`photo for "${id}" -> 404`, r.status === 404, `${r.status} ${r.text}`);
    }
  });
} finally {
  await mock.close();
}
