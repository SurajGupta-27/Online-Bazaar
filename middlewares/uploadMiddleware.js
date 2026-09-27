import fs from "fs";
import formidable from "express-formidable";

export const MAX_PHOTO_BYTES = 1000000;

// formidable aborts (and deletes the partial file) as soon as a limit is
// exceeded, instead of writing the whole upload to disk first.
const parseForm = formidable({
  maxFileSize: MAX_PHOTO_BYTES,
  maxFieldsSize: 200 * 1024,
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
        message: tooLarge ? "Photo must be less than 1MB" : "Invalid form data",
      });
    }
    res.on("close", () => removeUploads(req.files));
    next();
  });
};
