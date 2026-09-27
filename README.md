# 🛒 E-Commerce Web Application

A full-stack e-commerce web application built using the MERN stack. The project allows users to browse products, manage their shopping cart, place orders, and securely authenticate their accounts. It also provides an admin panel for managing products and customer orders.


## Features

### User Side

### Admin Side


## Tech Stack

### Frontend

### Backend

### Database

### Other Tools


## Project Structure

## Installation

Clone the repository

```bash
git clone https://github.com/Suraj-harry/E-commerce-Web.git

 # E-Commerce Web

 A MERN e-commerce application with product discovery, categories, search, cart persistence, JWT authentication, and an admin product/category dashboard.

 ## Requirements

 - Node.js 18 or newer
 - MongoDB running locally or a MongoDB Atlas connection string

 ## Setup

 From the project root:

 ```bash
 npm install
 cd client
 npm install
 cd ..
 copy .env.example .env
 ```

 Update `.env` with a real `MONGO_URL` and a long `JWT_SECRET`.

 ## Run

 Start the API and React development server together:

 ```bash
 npm run dev
 ```

 - Frontend: `http://localhost:3000`
 - API: `http://localhost:8080`
 - Health check: `http://localhost:8080/api/health`

 For separate processes:

 ```bash
 npm run server
 npm run client
 ```

 ## Features

 - Browse products with pagination, category filters, price filters, and search
 - Product details and related products
 - Persistent cart with duplicate prevention and remove actions
 - Register, login, profile updates, password recovery, and protected routes
 - Admin category management and product create/update/delete flows
 - Responsive layout with accessible focus states and mobile-friendly controls

 ## Production build

 ```bash
 cd client
 npm run build
 ```

 The build output is generated in `client/build`.
