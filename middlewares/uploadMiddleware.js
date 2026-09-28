import fs from "fs";
import formidable from "express-formidable";

// Each image must be under MAX_PHOTO_BYTES, and a product can have up to
// MAX_PHOTOS of them.
export const MAX_PHOTO_BYTES = 1000000;
export const MAX_PHOTOS = 6;

// Raster formats only: SVG can carry scripts, so it is deliberately excluded.
export const ALLOWED_PHOTO_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
];

// formidable aborts (and deletes the partial file) as soon as a limit is
// exceeded, instead of writing the whole upload to disk first. Its
// maxFileSize counts all files in the request together, so the per-image
// limit is checked again in the product controller.
const parseForm = formidable({
  maxFileSize: MAX_PHOTO_BYTES * MAX_PHOTOS,
  maxFieldsSize: 200 * 1024,
  multiples: true,
});

const removeUploads = (files = {}) =>
  Object.values(files)
    .flat()
    .forEach((file) => fs.unlink(file.path, () => {}));

// Parses multipart product forms into req.fields / req.files and always
// deletes the temp files once the response has been sent.
export const productUpload = (req, res, next) => {
  let done = false;
  parseForm(req, res, (err) => {
    // express-formidable can report the same error twice.
    if (done) return;
    done = true;
    if (err) {
      const tooLarge = /maxFileSize|maxFieldsSize/.test(err.message);
      return res.status(tooLarge ? 413 : 400).send({
        success: false,
        message: tooLarge
          ? `Each photo must be less than 1MB (at most ${MAX_PHOTOS} photos)`
          : "Invalid form data",
      });
    }
    res.on("close", () => removeUploads(req.files));
    next();
  });
};
