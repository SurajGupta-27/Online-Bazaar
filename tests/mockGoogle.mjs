// A stand-in for Google's sign-in keys, so tests never reach Google. It serves
// a public key in the format of https://www.googleapis.com/oauth2/v1/certs and
// signs ID tokens with the matching private key, so the server's real
// verification (google-auth-library) runs against them. Point the server at it
// with googleEnv(mock).
import http from "node:http";
import crypto from "node:crypto";
import JWT from "jsonwebtoken";

export const CLIENT_ID = "test-client.apps.googleusercontent.com";
const KID = "test-key-1";

const keyPair = () =>
  crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

export async function startMockGoogle({ port = 9411 } = {}) {
  const keys = keyPair();
  const state = { certRequests: 0 };

  const server = http.createServer((req, res) => {
    if (req.url !== "/oauth2/v1/certs") {
      res.writeHead(404);
      return res.end();
    }
    state.certRequests++;
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "public, max-age=3600" });
    res.end(JSON.stringify({ [KID]: keys.publicKey }));
  });
  await new Promise((resolve) => server.listen(port, "127.0.0.1", resolve));

  // A Google ID token for this account; override any claim to test failures.
  // privateKey signs with a key Google never published (a forgery).
  const idToken = ({ sub = "g-1", email = "user@gmail.com", privateKey = keys.privateKey, ...claims } = {}) => {
    const now = Math.floor(Date.now() / 1000);
    return JWT.sign(
      {
        iss: "https://accounts.google.com",
        aud: CLIENT_ID,
        sub,
        email,
        email_verified: true,
        name: "Test User",
        iat: now,
        exp: now + 3600,
        ...claims,
      },
      privateKey,
      { algorithm: "RS256", keyid: KID }
    );
  };

  return {
    state,
    idToken,
    forgedKey: keyPair().privateKey,
    certsUrl: `http://127.0.0.1:${port}/oauth2/v1/certs`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

export const googleEnv = (mock) => ({ GOOGLE_CLIENT_ID: CLIENT_ID, GOOGLE_CERTS_URL: mock.certsUrl });
