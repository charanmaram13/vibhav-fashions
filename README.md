# Sri Vaibhav Fashions showroom

A mobile-first clothing catalog for Sri Vaibhav Fashions in Addanki, focused on men's and kids' wear.

## Run locally

Requires Node.js 20 or newer.

```sh
npm install
npm run server
```

In a second terminal, start the storefront:

```sh
npm run dev
```

Open `http://localhost:5173`. Vite proxies `/api` requests to the Express server on port 4000.

## Storefront and admin

- Editorial men's fashion hero, Men’s and Kids’ category panels, and a responsive 3:4 product grid.
- Product details include sizes and WhatsApp enquiry. The Instagram account is `@sri_vaibhav_fashions_`.
- The admin panel requires the configured username and password. Product writes are protected by an HttpOnly session cookie.
- Product records are stored in MongoDB. Product photos uploaded through admin are compressed in the browser and stored in MongoDB GridFS.
- Admin credentials are loaded from `.env`, which is excluded from Git. The password is stored as a salted scrypt hash.

For deployment, configure `ADMIN_USERNAME`, `ADMIN_PASSWORD_SALT`, `ADMIN_PASSWORD_HASH`, `ADMIN_SESSION_SECRET`, and `MONGODB_URI` as Vercel environment variables. Optionally set `MONGODB_DB`; it defaults to `sri_vaibhav_fashions`. Do not publish or share `.env`.

The catalog starts with sample products and photos and seeds them into MongoDB when its `products` collection is empty. Cloudinary uploads, AI image enhancement, and Instagram post generation are not connected.
