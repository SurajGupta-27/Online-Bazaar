import { withServer, check, runScript, ObjectId } from "./harness.mjs";
import { PNG } from "./fixtures.mjs";
import { startMockCloudinary, cloudinaryEnv } from "./mockCloudinary.mjs";

const SCRIPT = "scripts/migratePhotosToCloudinary.mjs";
const mock = await startMockCloudinary();

try {
  await withServer(async ({ db, uri, api }) => {
    const products = db.collection("products");
    const cat = new ObjectId();
    const base = { description: "d", price: 1, category: cat, quantity: 1 };
    const [a, b, evil, none, both] = [1, 2, 3, 4, 5].map(() => new ObjectId());
    await products.insertMany([
      { _id: a, name: "A", slug: "a", ...base, photo: { data: PNG, contentType: "image/png" } },
      { _id: b, name: "B", slug: "b", ...base, photo: { data: PNG, contentType: "image/jpeg" } },
      { _id: evil, name: "Evil", slug: "evil", ...base, photo: { data: Buffer.from("<script>"), contentType: "text/html" } },
      { _id: none, name: "None", slug: "none", ...base, images: [] },
      { _id: both, name: "Both", slug: "both", ...base, photo: { data: PNG, contentType: "image/png" }, images: [{ url: "https://res.cloudinary.com/x/extra.png", publicId: "extra" }] },
    ]);
    const env = { MONGO_URL: uri, ...cloudinaryEnv(mock) };

    const dry = await runScript(SCRIPT, [], env);
    check("dry run succeeds and reports what it would move", dry.code === 0 && /Would move 3, skipped 1, failed 0/.test(dry.output), dry.output);
    check("dry run prints the database host but no credentials", /Database: 127\.0\.0\.1:\d+\/shop/.test(dry.output));
    check("dry run uploads nothing", mock.state.uploads.length === 0);
    check("dry run changes nothing", (await products.countDocuments({ "photo.data": { $exists: true } })) === 4);

    const noCloud = await runScript(SCRIPT, ["--apply"], { MONGO_URL: uri });
    check("apply refuses to run without Cloudinary settings", noCloud.code !== 0 && /CLOUDINARY_CLOUD_NAME/.test(noCloud.output), noCloud.output);

    const applied = await runScript(SCRIPT, ["--apply"], env);
    check("apply moves the three real images", applied.code === 0 && /Moved 3, skipped 1, failed 0/.test(applied.output), applied.output);
    const docA = await products.findOne({ _id: a });
    check("photo becomes the main Cloudinary image", docA.images.length === 1 && docA.images[0].publicId === `online-bazaar/products/legacy-${a}`, JSON.stringify(docA.images));
    check("MongoDB photo bytes removed", !docA.photo);
    const docBoth = await products.findOne({ _id: both });
    check("legacy photo goes first, existing images kept", docBoth.images.map((i) => i.publicId).join() === `online-bazaar/products/legacy-${both},extra`, JSON.stringify(docBoth.images));
    const docEvil = await products.findOne({ _id: evil });
    check("non-image legacy photo is left alone, not uploaded", docEvil.photo?.contentType === "text/html" && !mock.state.uploads.some((u) => u.publicId.includes(String(evil))));
    check("uploaded with fixed ids, as bytes", mock.state.uploads.length === 3 && mock.state.uploads.every((u) => u.source === "bytes"));

    const redirect = await api("GET", `/api/v1/product/product-photo/${a}`, null, { redirect: "manual" });
    check("migrated product's photo URL now points at Cloudinary", redirect.status === 302 && redirect.headers.get("location") === docA.images[0].url);

    const again = await runScript(SCRIPT, ["--apply"], env);
    check("second run has nothing left to move", again.code === 0 && /Moved 0, skipped 1, failed 0/.test(again.output), again.output);
    check("second run uploads nothing new", mock.state.uploads.length === 3);
    check("all requests were correctly signed", mock.state.badSignatures === 0);
  });
} finally {
  await mock.close();
}
