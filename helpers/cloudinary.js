// Cloudinary image storage, called through its REST API with fetch (no SDK).
// Uploads and deletes are signed with CLOUDINARY_API_SECRET, which never
// leaves the server. CLOUDINARY_API_URL lets tests point this at a mock.
import crypto from "crypto";

export const PRODUCT_FOLDER = "online-bazaar/products";

// Cloudinary re-checks the real file format, whatever type the browser claimed.
const ALLOWED_FORMATS = "jpg,png,webp,gif,avif";

const settings = () => ({
  cloudName: process.env.CLOUDINARY_CLOUD_NAME,
  apiKey: process.env.CLOUDINARY_API_KEY,
  apiSecret: process.env.CLOUDINARY_API_SECRET,
  apiUrl: process.env.CLOUDINARY_API_URL || "https://api.cloudinary.com/v1_1",
});

export const cloudinaryConfigured = () => {
  const { cloudName, apiKey, apiSecret } = settings();
  return Boolean(cloudName && apiKey && apiSecret);
};

export class CloudinaryError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

// Cloudinary's signature: SHA-1 of the sorted "key=value&..." params + secret.
export const signParams = (params, secret) => {
  const toSign = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return crypto.createHash("sha1").update(toSign + secret).digest("hex");
};

const callApi = async (action, params, file) => {
  if (!cloudinaryConfigured()) {
    throw new CloudinaryError("Cloudinary is not configured", 503);
  }
  const { cloudName, apiKey, apiSecret, apiUrl } = settings();
  const signed = Object.fromEntries(
    Object.entries({ ...params, timestamp: Math.floor(Date.now() / 1000) }).filter(
      ([, value]) => value !== undefined && value !== ""
    )
  );
  const form = new FormData();
  Object.entries(signed).forEach(([key, value]) => form.append(key, String(value)));
  form.append("api_key", apiKey);
  form.append("signature", signParams(signed, apiSecret));
  if (file !== undefined) form.append("file", file);

  let res;
  try {
    res = await fetch(`${apiUrl}/${cloudName}/image/${action}`, {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(60000),
    });
  } catch (error) {
    throw new CloudinaryError(`Cloudinary ${action} request failed: ${error.message}`, 502);
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new CloudinaryError(
      `Cloudinary ${action} failed (${res.status}): ${body?.error?.message || "unknown error"}`,
      res.status
    );
  }
  return body;
};

// `file` is a Buffer (with its contentType) or an https URL that Cloudinary
// downloads itself. A fixed publicId makes re-running an import reuse the
// image that is already there instead of uploading a copy.
export const uploadImage = async (file, { contentType, publicId, folder = PRODUCT_FOLDER } = {}) => {
  const payload = Buffer.isBuffer(file) ? new Blob([file], { type: contentType }) : file;
  const result = await callApi(
    "upload",
    {
      folder,
      public_id: publicId,
      overwrite: publicId ? "false" : undefined,
      allowed_formats: ALLOWED_FORMATS,
    },
    payload
  );
  return { url: result.secure_url, publicId: result.public_id };
};

export const deleteImage = (publicId) =>
  callApi("destroy", { public_id: publicId, invalidate: "true" });

// Best-effort cleanup: a leftover image must never fail the request.
export const deleteImages = async (publicIds = []) => {
  await Promise.all(
    publicIds.map((publicId) =>
      deleteImage(publicId).catch((error) =>
        console.log(`Could not delete image ${publicId}: ${error.message}`)
      )
    )
  );
};
