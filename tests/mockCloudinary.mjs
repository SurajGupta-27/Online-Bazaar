// A stand-in for Cloudinary's upload API, so tests never reach the real one.
// It checks request signatures, rejects files that aren't images, and keeps
// what was uploaded/deleted for assertions. Point the server at it with
// cloudinaryEnv(mock).
import http from "node:http";
import crypto from "node:crypto";

export const CLOUD = { name: "test-cloud", key: "test-key", secret: "test-secret" };

const sign = (params) =>
  crypto
    .createHash("sha1")
    .update(
      Object.keys(params)
        .sort()
        .map((k) => `${k}=${params[k]}`)
        .join("&") + CLOUD.secret
    )
    .digest("hex");

const IMAGE_MAGIC = [
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x47, 0x49, 0x46], // GIF
  [0x52, 0x49, 0x46, 0x46], // RIFF (WebP)
];
const looksLikeImage = (bytes) =>
  IMAGE_MAGIC.some((magic) => magic.every((b, i) => bytes[i] === b));

export async function startMockCloudinary({ port = 9311 } = {}) {
  const state = {
    uploads: [], // { publicId, folder, source: "bytes" | url, type }
    destroyed: [], // publicIds
    assets: new Map(), // publicId -> url
    failNextUploads: 0,
    badSignatures: 0,
  };
  let counter = 0;

  const server = http.createServer(async (req, res) => {
    const reply = (status, body) => {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    };
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const form = await new Request("http://mock" + req.url, {
      method: "POST",
      headers: req.headers,
      body: Buffer.concat(chunks),
    }).formData();

    const params = {};
    let file;
    for (const [key, value] of form.entries()) {
      if (key === "file") file = value;
      else if (key !== "api_key" && key !== "signature") params[key] = value;
    }
    if (form.get("api_key") !== CLOUD.key || form.get("signature") !== sign(params)) {
      state.badSignatures++;
      return reply(401, { error: { message: "Invalid Signature" } });
    }

    const [, , cloud, , action] = req.url.split("/"); // /v1_1/<cloud>/image/<action>
    if (cloud !== CLOUD.name) return reply(404, { error: { message: "Unknown cloud" } });

    if (action === "destroy") {
      state.destroyed.push(params.public_id);
      const found = state.assets.delete(params.public_id);
      return reply(200, { result: found ? "ok" : "not found" });
    }
    if (action !== "upload") return reply(404, { error: { message: "Unknown action" } });

    if (state.failNextUploads > 0) {
      state.failNextUploads--;
      return reply(500, { error: { message: "Mock failure" } });
    }
    const isUrl = typeof file === "string";
    if (!isUrl) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!looksLikeImage(bytes)) return reply(400, { error: { message: "Invalid image file" } });
    }
    const publicId = params.public_id
      ? `${params.folder}/${params.public_id}`
      : `${params.folder}/img${++counter}`;
    if (params.public_id && params.overwrite === "false" && state.assets.has(publicId)) {
      return reply(200, { public_id: publicId, secure_url: state.assets.get(publicId), existing: true });
    }
    const url = `https://res.cloudinary.com/${CLOUD.name}/image/upload/v1/${publicId}.png`;
    state.assets.set(publicId, url);
    state.uploads.push({
      publicId,
      folder: params.folder,
      source: isUrl ? file : "bytes",
      type: isUrl ? null : file.type,
    });
    reply(200, { public_id: publicId, secure_url: url });
  });

  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));
  return {
    state,
    url: `http://127.0.0.1:${port}/v1_1`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const cloudinaryEnv = (mock) => ({
  CLOUDINARY_CLOUD_NAME: CLOUD.name,
  CLOUDINARY_API_KEY: CLOUD.key,
  CLOUDINARY_API_SECRET: CLOUD.secret,
  CLOUDINARY_API_URL: mock.url,
});
