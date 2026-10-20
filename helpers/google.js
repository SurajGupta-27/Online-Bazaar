import { OAuth2Client } from "google-auth-library";
import { normalizeEmail } from "./authHelper.js";

export const googleConfigured = () => Boolean(process.env.GOOGLE_CLIENT_ID);

// The ID token was missing, forged, expired, for another app, or its email
// isn't verified. Anything else (e.g. Google's keys couldn't be fetched) is a
// server-side failure.
export class GoogleTokenError extends Error {}

let client;
// One client per process, so Google's signing keys are cached between logins.
// GOOGLE_CERTS_URL lets tests serve their own keys instead of Google's.
const getClient = () => {
  client ??= new OAuth2Client({
    endpoints: process.env.GOOGLE_CERTS_URL
      ? { oauth2FederatedSignonPemCertsUrl: process.env.GOOGLE_CERTS_URL }
      : {},
  });
  return client;
};

// Checks a Google Sign-In ID token (signature, issuer, expiry, and that it was
// issued to our client ID) and returns the account it proves. Nothing else the
// browser sends is trusted.
export const verifyGoogleCredential = async (credential) => {
  let payload;
  try {
    const ticket = await getClient().verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (error) {
    if (/Failed to retrieve verification certificates/.test(error.message)) throw error;
    throw new GoogleTokenError(error.message);
  }
  if (!payload?.sub || !payload.email) {
    throw new GoogleTokenError("ID token has no account id or email");
  }
  if (payload.email_verified !== true) {
    throw new GoogleTokenError("Google has not verified this email address");
  }
  const email = normalizeEmail(payload.email);
  return {
    googleId: payload.sub,
    email,
    name: payload.name?.trim() || email.split("@")[0],
  };
};
