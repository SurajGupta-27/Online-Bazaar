import React, { useEffect, useRef } from "react";
import toast from "react-hot-toast";
import { sizedImage } from "../../utils/productImage";

// Must match middlewares/uploadMiddleware.js on the server.
export const MAX_PHOTOS = 6;
export const MAX_PHOTO_BYTES = 1000000;
export const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"];

// Picker items are { existing: { url, publicId } } for saved images and
// { file, preview } for new uploads; their order is the display order and the
// first item is the main image.
export const itemsFromImages = (images = []) => images.map((image) => ({ existing: image }));

// Adds the picked photos to a product form: new files as "photos", and the
// full order as "images" (saved publicIds, "new:<n>" for the n-th new file).
export const appendImages = (formData, items) => {
  let n = 0;
  const order = items.map((item) => {
    if (item.existing) return item.existing.publicId;
    formData.append("photos", item.file);
    return `new:${n++}`;
  });
  formData.append("images", JSON.stringify(order));
};

// Explains why a file can't be added, or returns null when it can.
export const photoProblem = (file) => {
  if (!PHOTO_TYPES.includes(file.type)) return `${file.name}: use a JPEG, PNG, WebP, GIF or AVIF image`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: each photo must be less than 1MB`;
  return null;
};

const ImagePicker = ({ items, onChange }) => {
  // Revoke preview URLs of files that are no longer picked, and all on unmount.
  const previews = useRef(new Set());
  useEffect(() => {
    const current = new Set(items.filter((i) => i.preview).map((i) => i.preview));
    previews.current.forEach((url) => {
      if (!current.has(url)) URL.revokeObjectURL(url);
    });
    previews.current = current;
  }, [items]);
  useEffect(() => () => previews.current.forEach((url) => URL.revokeObjectURL(url)), []);

  const addFiles = (fileList) => {
    const added = [];
    for (const file of fileList) {
      const problem = photoProblem(file);
      if (problem) {
        toast.error(problem);
      } else if (items.length + added.length >= MAX_PHOTOS) {
        toast.error(`A product can have at most ${MAX_PHOTOS} photos`);
        break;
      } else {
        added.push({ file, preview: URL.createObjectURL(file) });
      }
    }
    if (added.length) onChange([...items, ...added]);
  };

  const remove = (index) => onChange(items.filter((_, i) => i !== index));
  const makeMain = (index) =>
    onChange([items[index], ...items.filter((_, i) => i !== index)]);

  return (
    <div className="mb-3">
      <label className="btn btn-outline-primary w-100 mb-2">
        {items.length ? "Add more photos" : "Upload photos"} ({items.length}/{MAX_PHOTOS})
        <input
          type="file"
          name="photos"
          multiple
          accept={PHOTO_TYPES.join(",")}
          onChange={(e) => {
            addFiles(Array.from(e.target.files || []));
            e.target.value = "";
          }}
          disabled={items.length >= MAX_PHOTOS}
          hidden
        />
      </label>
      <p className="text-muted small mb-2">
        Up to {MAX_PHOTOS} photos, each under 1MB (JPEG, PNG, WebP, GIF or AVIF).
        The first photo is the main image.
      </p>
      {items.length > 0 && (
        <div className="image-picker">
          {items.map((item, index) => {
            const src = item.existing ? sizedImage(item.existing.url, 300) : item.preview;
            const label = item.existing ? `Photo ${index + 1}` : item.file.name;
            return (
              <div
                key={item.existing ? item.existing.publicId : item.preview}
                className={`image-picker-item${index === 0 ? " main" : ""}`}
              >
                {index === 0 && <span className="image-picker-badge">Main</span>}
                <img src={src} alt={label} />
                <div className="image-picker-actions">
                  {index > 0 && (
                    <button
                      type="button"
                      className="btn btn-outline-primary"
                      onClick={() => makeMain(index)}
                      aria-label={`Make ${label} the main image`}
                    >
                      Make main
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn btn-outline-danger"
                    onClick={() => remove(index)}
                    aria-label={`Remove ${label}`}
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ImagePicker;
