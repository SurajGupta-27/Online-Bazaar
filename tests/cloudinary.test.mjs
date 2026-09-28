// Unit checks for helpers/cloudinary.js that need no server or database.
import { signParams, cloudinaryConfigured } from "../helpers/cloudinary.js";

let failures = 0;
const check = (label, cond, extra = "") => {
  if (!cond) failures++;
  console.log(`${cond ? "PASS" : "FAIL"}  ${label}${extra ? "  -- " + extra : ""}`);
};

// The worked example from Cloudinary's "Generating authentication signatures"
// docs, so the mock server and the real API agree with our signing.
const signature = signParams(
  { eager: "w_400,h_300,c_pad|w_260,h_200,c_crop", public_id: "sample_image", timestamp: 1315060510 },
  "abcd"
);
check("signature matches Cloudinary's documented example", signature === "bfd09f95f331f558cbd1320e67aa8d488770583e", signature);

const saved = { ...process.env };
Object.assign(process.env, { CLOUDINARY_CLOUD_NAME: "c", CLOUDINARY_API_KEY: "k", CLOUDINARY_API_SECRET: "" });
check("not configured without the API secret", cloudinaryConfigured() === false);
process.env.CLOUDINARY_API_SECRET = "s";
check("configured with all three settings", cloudinaryConfigured() === true);
Object.keys(process.env).forEach((k) => { if (!(k in saved)) delete process.env[k]; });
Object.assign(process.env, saved);

console.log(failures ? `\n${failures} FAILED` : "\nALL PASSED");
if (failures) process.exitCode = 1;
