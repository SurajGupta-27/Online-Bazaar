# Online Bazaar

**A full-stack MERN online store with an AI shopping assistant, Razorpay payments, live order tracking and price-drop alerts.**

Built by **Suraj Gupta**. Online Bazaar is a general store in the style of Amazon or Flipkart. Shoppers browse, search and filter products, ask an AI assistant for recommendations, pay online or with cash on delivery, track orders step by step and get an email when something on their wishlist gets cheaper. Admins manage the catalogue, move orders through delivery and follow sales on an analytics dashboard. Everything runs on free tiers.

**Live demo:** _coming soon_ <!-- replace with your Vercel URL, e.g. https://online-bazaar.vercel.app -->

> **Demo data:** the catalogue is imported from [DummyJSON](https://dummyjson.com), a free fake-data API. Products, prices and stock are samples; nothing is actually sold or shipped. Payments run in Razorpay **test mode**.

## Screenshots

<!-- Save screenshots in docs/screenshots/ and replace the placeholders, e.g.
| ![Home](docs/screenshots/home.png) | ![Assistant](docs/screenshots/assistant.png) | -->

| Home | AI shopping assistant | Order tracking | Admin analytics |
| --- | --- | --- | --- |
| _coming soon_ | _coming soon_ | _coming soon_ | _coming soon_ |

## Features

**For shoppers**
- **AI shopping assistant ("Ask Bazaar AI").** Understands requests like _"best rated phone under 20k"_, _"gift for my dad"_ or _"2000 se kam headphones"_ (English, Hindi and Hinglish) and follow-ups like _"show cheaper ones"_. A rule-based parser and MongoDB search choose real in-stock candidates; the AI (Google Gemini or Groq, chosen in `.env`) only ranks and explains them, so it can never invent a product or a price. When the free AI quota runs out, the API is slow or no key is set, the same chat answers with rule-based smart search and says which mode answered.
- Browse, search, filter by category and price, and sort by newest, price or rating.
- Product pages with an image gallery, ratings, verified-purchase reviews and similar products.
- A cart that persists between visits; checkout with **Razorpay** (UPI, cards, netbanking) or **cash on delivery**.
- **Order tracking timeline**: placed, packed, shipped, out for delivery, delivered (or cancelled), with times, tracking notes and an estimated delivery date. Every step is emailed.
- **PDF invoices** with sequential numbers (`INV-2026-000123`), attached to the confirmation email and downloadable from My Orders.
- **Wishlist** with price-drop alerts, and **"Notify me"** emails when an out-of-stock product comes back. One-click unsubscribe links are HMAC-signed.
- Email/password login and **Google Sign-In**.

**For admins**
- Create, edit and delete products with up to 6 images each (stored on Cloudinary).
- Manage categories, users and reviews.
- Move orders one step at a time, add tracking notes, and cancel orders (stock is returned automatically).
- **Analytics dashboard**: 30-day revenue and orders, average order value, top products, sales by category, COD vs online, order status and low stock, computed with MongoDB aggregation and drawn as accessible SVG charts, each with a data table.

**Under the hood**
- **Atomic stock.** Each order reserves stock with one conditional update per product (`findOneAndUpdate` with `quantity >= n`), releasing earlier reservations if a later one fails, so two shoppers can never buy the last unit (tested with 20 simultaneous orders). Admin stock edits are conditional too, so saving the edit form never undoes a sale made while it was open. Every path that returns stock goes through one guarded release, so it happens exactly once.
- **Server-side prices** and Razorpay signature verification; the cart's price is display-only.
- **Security:** Helmet headers and CSP, a CORS allowlist, rate limits on login, Google sign-in, password reset, reviews and the assistant, bcrypt-hashed passwords and security answers, no raw errors in responses, regex-escaped search, plain-text reviews and notes, escaped email templates, and image-only uploads under 1 MB (never SVG).
- **Prompt-injection hardening** for the assistant: shopper text and product data go to the AI as JSON data, personal details are scrubbed, no account data is sent, and the AI's picks are re-checked against the database.
- **Graceful degradation:** without Cloudinary, email, Razorpay, Google or AI keys, that feature switches itself off and everything else keeps working.

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 (Create React App), React Router 7, Bootstrap 5, Ant Design 6, react-hot-toast |
| Backend | Node.js 22, Express 5 (ES modules), Mongoose 9 |
| Database | MongoDB (MongoDB Atlas free M0 cluster in production) |
| Auth | JWT, bcrypt, Google Identity Services with google-auth-library |
| Payments | Razorpay REST API (test mode) |
| Images | Cloudinary (signed REST uploads, automatic format and quality) |
| Email and PDF | Nodemailer (Gmail SMTP locally) or Brevo's HTTPS API (hosting), PDFKit with embedded Noto Sans |
| AI | Google Gemini or Groq (free tiers), swappable through `.env` |
| Testing | Node test scripts against the real server with mongodb-memory-server; Jest and React Testing Library |
| Hosting | Vercel (frontend), Render (API), MongoDB Atlas (database), all free |

Payments, images and AI are called through their REST APIs with `fetch` rather than vendor SDKs, which keeps dependencies few and lets the tests point each one at a local mock.

## Local setup

### Prerequisites

- **Node.js 22** or newer
- **MongoDB**: a local server, or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- Optional free accounts, each switching on one feature: Cloudinary (product images), Razorpay test mode (online payments), a Google Cloud OAuth client (Google Sign-In), a Gmail App Password or Brevo (emails), Google AI Studio or Groq (AI assistant)

### 1. Install

```bash
git clone https://github.com/SurajGupta-27/E-commerce-Web.git online-bazaar
cd online-bazaar
npm install
npm install --prefix client
```

### 2. Configure

```bash
cp .env.example .env                 # Windows: copy .env.example .env
cp client/.env.example client/.env   # optional: Google Sign-In button
```

Set at least `MONGO_URL` and `JWT_SECRET` in `.env`. Every other setting is optional and explained in [`.env.example`](.env.example) and [`client/.env.example`](client/.env.example). Leave `REACT_APP_API_URL` empty locally: the React dev server forwards `/api` to the API.

### 3. Run

```bash
npm run dev
```

- Store: http://localhost:3000
- API: http://localhost:8080 (health check at `/api/health`)

### 4. Make yourself an admin

Register an account, then set `role: 1` on your user document in MongoDB (Atlas Data Explorer, MongoDB Compass or `mongosh`).

### 5. Load the demo catalogue (optional)

```bash
npm run seed:dummyjson                # dry run: shows what would be imported
npm run seed:dummyjson -- --apply     # import (needs the Cloudinary keys for images)
```

## Testing

```bash
npm test                                        # all API tests
npm test -- orders                              # one API test file
npm test --prefix client -- --watchAll=false    # all frontend tests
```

- **API:** 25 test files making **717 assertions**. Each file starts the real `server.js` against a throwaway in-memory MongoDB, with local mocks for Cloudinary, Razorpay, Google, Gemini/Groq, Brevo, DummyJSON and email, so no network access or `.env` is needed. The first run downloads a MongoDB binary.
- **Frontend:** **32 suites, 139 tests** (Jest and React Testing Library).

## Deployment (free): Vercel + Render + MongoDB Atlas

```
Browser ──> Vercel (React build, client/vercel.json)
   │
   └──── /api/v1 calls ──> Render (Express API, render.yaml) ──> MongoDB Atlas
                                │
                                └─> Cloudinary, Razorpay, Brevo, Gemini, Google
```

The frontend is a static build on Vercel. It calls the API on Render directly (`REACT_APP_API_URL`), and the API only accepts browser calls from the origins in `CLIENT_URL` (CORS). All secrets live in the Render and Vercel dashboards, never in git.

### 1. MongoDB Atlas

1. Create a free **M0** cluster.
2. **Database Access**: add a database user with a long random password.
3. **Network Access > Add IP Address > Allow access from anywhere** (`0.0.0.0/0`). Render's free plan has no fixed outgoing IP.
4. **Connect > Drivers**: copy the connection string, put the password in, and add the database name before the `?`, e.g. `mongodb+srv://user:pass@cluster0.xxxx.mongodb.net/online-bazaar?retryWrites=true&w=majority`. This is `MONGO_URL`.

### 2. API on Render

1. Sign up at [render.com](https://render.com) with GitHub, and give Render access to this repository.
2. **New > Blueprint**, pick the repository and `main`. Render reads [`render.yaml`](render.yaml) (build `npm ci`, start `npm start`, health check `/api/health`) and asks for each secret:

   | Variable | Value |
   | --- | --- |
   | `MONGO_URL` | Atlas connection string |
   | `CLIENT_URL` | Your Vercel URL. For the first deploy, use a placeholder such as `https://example.com` and fix it in step 4 |
   | `BREVO_API_KEY`, `EMAIL_FROM` | From Brevo (Render blocks SMTP, so Gmail SMTP doesn't work there) |
   | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Cloudinary dashboard |
   | `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET` | Razorpay **test** keys (`rzp_test_...`) |
   | `GOOGLE_CLIENT_ID` | Your OAuth client ID |
   | `GEMINI_API_KEY` | Google AI Studio key (or set `AI_PROVIDER` to `groq` with `GROQ_API_KEY`, or to `none`) |

   `JWT_SECRET` is generated by Render. Leave any optional key empty to switch that feature off.
3. After the deploy, open `https://<your-api>.onrender.com/api/health`. `database` should be `connected`.

### 3. Frontend on Vercel

1. Sign up at [vercel.com](https://vercel.com) with GitHub. **Add New > Project**, import this repository.
2. Set **Root Directory** to `client`. The framework (Create React App), build command and output folder come from [`client/vercel.json`](client/vercel.json).
3. **Environment Variables:**

   | Variable | Value |
   | --- | --- |
   | `REACT_APP_API_URL` | `https://<your-api>.onrender.com` (no trailing slash) |
   | `REACT_APP_GOOGLE_CLIENT_ID` | The same OAuth client ID as `GOOGLE_CLIENT_ID` |

4. **Deploy**. These values are built into the JavaScript bundle, so after changing one, redeploy (**Deployments > ... > Redeploy**).

### 4. Connect the two

1. On Render, set `CLIENT_URL` to your Vercel URL, e.g. `https://online-bazaar.vercel.app` (no trailing slash; add preview URLs comma-separated if you want them to work). Save; Render redeploys.
2. Check the proxy setting: `/api/health`'s `clientIp` should be your own public IP. If not, raise `TRUST_PROXY` by 1 until it is.
3. In Google Cloud Console, **APIs & Services > Credentials >** your OAuth client (Web application) **> Authorized JavaScript origins**: add your Vercel URL (no path or trailing slash), plus `http://localhost:3000` and `http://localhost` for local use. No redirect URI is needed. While the consent screen is in **Testing**, only its test users can sign in; publish it to open sign-in to everyone.

### Good to know

- **Cold starts:** Render's free service sleeps after 15 idle minutes, and the first request then takes up to about a minute. The Vercel page loads at once and products appear when the API wakes. A free monitor such as UptimeRobot pinging `/api/health` every 5 minutes keeps it awake.
- **Custom API domain:** the CSP in `client/vercel.json` allows API calls to `https://*.onrender.com`. If the API moves to another domain, add it to `connect-src` there.
- **One service instead:** Render can also serve the React build itself on the API's URL (see the comment at the top of `render.yaml`).

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (nodemon, port 8080) and React dev server (port 3000) together |
| `npm run server` / `npm start` | API only, with nodemon / plain Node |
| `npm run client` | React dev server only |
| `npm run build` | Build the React app into `client/build` (for the one-service setup) |
| `npm test` | API tests |
| `npm run seed:dummyjson [-- --apply] [--limit N] [--rate 85] [--images 4]` | Import DummyJSON products and categories, converting USD to INR; re-runs skip products already imported |
| `npm run migrate:photos [-- --apply]` | Move product photos stored in MongoDB by older versions to Cloudinary |
| `npm run merge:categories -- --into Watches --from "Mens Watches" [--apply]` | Move products from one category into another and delete the emptied one |
| `npm run remove:categories -- --category Vehicle [--apply]` | Delete whole categories with their products and images (products that appear in orders are kept) |

Database scripts are dry runs unless given `--apply`, print which database they target, and are safe to run again.

## Project structure

```
├── server.js            Express app, routes, background jobs
├── render.yaml          Render blueprint (API)
├── config/              MongoDB connection
├── routes/              API routes under /api/v1
├── controllers/         Request handlers
├── models/              Mongoose models
├── middlewares/         Auth, rate limiting, uploads
├── helpers/             Payments, images, email, invoices, alerts, assistant, AI providers
├── scripts/             Seeding and maintenance scripts
├── tests/               API tests and mocks
├── assets/fonts/        Noto Sans for PDF invoices (OFL)
└── client/              React app (vercel.json: Vercel settings)
    └── src/
        ├── pages/       Store, user dashboard, admin dashboard
        ├── components/  Layout, product, order, charts, assistant
        ├── context/     Auth, cart, search, wishlist, alerts
        └── utils/       Prices, images, API address, order tracking
```

## License

[MIT](LICENSE) © Suraj Gupta. Product data comes from [DummyJSON](https://dummyjson.com); the Noto Sans fonts are under the SIL Open Font License (`assets/fonts/OFL.txt`).
