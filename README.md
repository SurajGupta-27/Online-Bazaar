# Online Bazaar

**A full-stack MERN online store with an AI shopping assistant, live order tracking and price-drop alerts.**

Built by **Suraj Gupta**. Online Bazaar is a general store in the style of Amazon or Flipkart: shoppers browse, search and filter products, pay online or with cash on delivery, track their orders step by step and get emailed when something on their wishlist gets cheaper. Admins manage the catalogue, move orders through delivery and watch sales on an analytics dashboard. Everything runs on free tiers.

**Live demo:** _coming soon_ <!-- replace with the deployed URL -->

> **Demo data:** the product catalogue is imported from [DummyJSON](https://dummyjson.com), a free fake-data API. Products, prices and stock are sample data, and nothing is actually sold or shipped.

## Screenshots

<!-- Add screenshots to docs/screenshots/ and link them here, for example:
![Home page](docs/screenshots/home.png)
-->

| Home | Shopping assistant | Order tracking | Admin analytics |
| --- | --- | --- | --- |
| _coming soon_ | _coming soon_ | _coming soon_ | _coming soon_ |

## Highlights

- **AI shopping assistant with automatic fallback.** "Ask Bazaar AI" understands requests like _"best rated phone under 20k"_, _"gift for my dad"_ or _"2000 se kam headphones"_ (English, Hindi and Hinglish), then follows up with _"show cheaper ones"_. A rule-based parser and MongoDB search pick real in-stock candidates, and the AI (Google Gemini or Groq, chosen in `.env`) only ranks and explains them. It can never invent a product or a price. When the free AI quota runs out, the API is slow or no key is set, the same chat answers with rule-based smart search, and the reply says which mode answered.
- **Order tracking timeline.** Placed, packed, shipped, out for delivery, delivered (or cancelled), with timestamps, admin tracking notes and an estimated delivery date. Every step is emailed to the customer.
- **Price-drop and back-in-stock alerts.** Wishlist items that get cheaper and out-of-stock products a shopper asked about ("Notify me") trigger emails from a queue that batches sends, stays under Gmail's daily limit, sends at most one alert per product per day, retries failures and never sends duplicates. One-click unsubscribe links are HMAC-signed.
- **Verified-purchase reviews.** Only customers with a delivered order for the product can review it, so every review is verified. Ratings are always recomputed from the reviews, and admins can moderate.
- **PDF invoices.** Sequentially numbered invoices (`INV-2026-000123`), attached to the confirmation email and downloadable from My Orders.
- **Admin analytics dashboard.** Revenue and orders for the last 30 days, average order value, top products, sales by category, COD vs online, order status and low stock, computed with MongoDB aggregation and drawn with dependency-free, accessible SVG charts (each with a data table).
- **Google Sign-In** alongside email and password login.
- **Razorpay and cash on delivery.** Online orders reserve stock before the payment window opens, release it if the shopper gives up, and verify Razorpay's payment signature on the server.

## Features

**Shoppers**
- Browse, search, filter by category and price, and sort by newest, price or rating
- Product pages with image gallery, ratings, reviews and related products
- Cart that persists between visits; checkout with Razorpay (UPI, cards, netbanking in test mode) or COD
- Wishlist with the price when added, plus "Notify me" for out-of-stock products
- My Orders with tracking timeline, estimated delivery and invoice download
- Profile with alert settings (Google sign-ups can add a password later)
- Order, tracking and alert emails, with plain-text versions

**Admins**
- Create, edit and delete products with up to 6 images each (stored on Cloudinary)
- Manage categories, users and reviews
- Move orders one step at a time, add tracking notes, cancel (stock is returned automatically)
- Analytics dashboard

## Tech stack

| Layer | Technology |
| --- | --- |
| Frontend | React 19 (Create React App), React Router 7, Bootstrap 5, Ant Design 6, react-hot-toast |
| Backend | Node.js, Express 5 (ES modules), Mongoose 9 |
| Database | MongoDB (MongoDB Atlas free tier works) |
| Auth | JWT, bcrypt, Google Identity Services with google-auth-library |
| Payments | Razorpay REST API (test mode) |
| Images | Cloudinary (signed REST uploads, automatic format and quality) |
| Email and PDF | Nodemailer with Gmail SMTP, PDFKit with embedded Noto Sans |
| AI | Google Gemini or Groq (free tiers), swappable through `.env` |
| Testing | Node test scripts with mongodb-memory-server; Jest and React Testing Library |

Payments, images and AI are called through their REST APIs with `fetch` rather than vendor SDKs, which keeps the dependency list short and lets the tests point each one at a local mock.

## Security and reliability

- **Atomic stock.** Each order reserves stock with a single conditional update per product (`quantity >= n`), releasing earlier reservations if a later one fails, so two shoppers can never buy the last unit. Every path that returns stock goes through one guarded release, so it happens exactly once.
- **Server-side prices.** Order totals are recomputed on the server; the cart's price is display-only. Razorpay payments are verified with an HMAC signature.
- **Rate limiting** on login, Google sign-in, forgot password, review writes and the shopping assistant (per account or IP, per minute and per day).
- **Helmet** security headers and a CORS allowlist.
- **No leaked internals.** Responses never include raw errors or stack traces; passwords and security answers are bcrypt-hashed and never sent back.
- **Input hygiene.** Search input is escaped before use in regular expressions; review text and tracking notes are reduced to plain text; email templates escape every database value; uploads accept only real images under 1 MB (never SVG).
- **Prompt-injection hardening** for the assistant: shopper text and product data go to the AI as JSON data, personal details (emails, phone and card numbers) are scrubbed, no account data is ever sent, and the AI's picks are re-checked against the database.
- **Graceful degradation.** Without Cloudinary, email, Razorpay, Google or AI keys, the matching feature switches itself off and everything else keeps working.

## Testing

- **API:** 24 test files with **673 checks**. Each file starts the real `server.js` against a throwaway in-memory MongoDB, with local mocks for Cloudinary, Razorpay, Google, Gemini/Groq, DummyJSON and email. No network access or `.env` is needed.
- **Frontend:** 31 test suites with **136 tests** (Jest and React Testing Library).

```bash
npm test                                  # all API tests
npm test -- orders                        # one API test file
npm test --prefix client -- --watchAll=false   # all frontend tests
```

The first API run downloads a MongoDB binary for mongodb-memory-server.

## Getting started

### Prerequisites

- Node.js 22 or newer
- MongoDB: a local server or a free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster
- Optional free accounts: Cloudinary (images), Razorpay test mode (online payments), Google Cloud OAuth client (Google Sign-In), a Gmail App Password (emails), Google AI Studio or Groq (AI assistant)

### Install

```bash
git clone https://github.com/SurajGupta-27/E-commerce-Web.git online-bazaar
cd online-bazaar
npm install
npm install --prefix client
```

### Configure

```bash
cp .env.example .env                 # Windows: copy .env.example .env
cp client/.env.example client/.env   # optional, for Google Sign-In
```

Set at least `MONGO_URL` and `JWT_SECRET` in `.env`. Every other setting is optional and explained in [`.env.example`](.env.example).

### Run

```bash
npm run dev
```

- Store: http://localhost:3000
- API: http://localhost:8080 (health check at `/api/health`)

To make yourself an admin, register an account, then set `role: 1` on your user document in MongoDB (for example in Atlas's Data Explorer or `mongosh`).

### Load the demo catalogue

```bash
npm run seed:dummyjson                # dry run: shows what would be imported
npm run seed:dummyjson -- --apply     # import (needs the Cloudinary keys for images)
```

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API (nodemon, port 8080) and React dev server (port 3000) together |
| `npm run server` / `npm start` | API only, with nodemon / plain Node |
| `npm run client` | React dev server only |
| `npm run build --prefix client` | Production build into `client/build` |
| `npm test` | API tests |
| `npm run seed:dummyjson [-- --apply] [--limit N] [--rate 85] [--images 4]` | Import DummyJSON products and categories, converting USD to INR; re-runs skip products already imported |
| `npm run migrate:photos [-- --apply]` | Move product photos stored in MongoDB by older versions to Cloudinary |
| `npm run merge:categories -- --into Watches --from "Mens Watches" [--apply]` | Move products from one category into another and delete the emptied one |
| `npm run remove:categories -- --category Vehicle [--apply]` | Delete whole categories with their products and images (products that appear in orders are kept) |

The database scripts are dry runs unless given `--apply`, print which database they target, and are safe to run again.

## Project structure

```
├── server.js            Express app, routes, background sweeps
├── config/              MongoDB connection
├── routes/              API routes under /api/v1
├── controllers/         Request handlers
├── models/              Mongoose models
├── middlewares/         Auth, rate limiting, uploads
├── helpers/             Payments, images, email, invoices, alerts, assistant, AI providers
├── scripts/             Seeding and maintenance scripts
├── tests/               API tests and mocks
├── assets/fonts/        Noto Sans for PDF invoices (OFL)
└── client/              React app
    └── src/
        ├── pages/       Store, user dashboard, admin dashboard
        ├── components/  Layout, product, order, charts, assistant
        ├── context/     Auth, cart, search, wishlist, alerts
        └── utils/       Prices, images, order tracking
```

## License

[MIT](LICENSE) © Suraj Gupta. Product data comes from [DummyJSON](https://dummyjson.com); the Noto Sans fonts are under the SIL Open Font License (`assets/fonts/OFL.txt`).
