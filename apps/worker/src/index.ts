import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { listings } from './routes/listings.js';
import { purchases } from './routes/purchases.js';
import { partners } from './routes/partners.js';
import { stripeRoutes } from './routes/stripe.js';
import { sellers } from './routes/sellers.js';
import { admin } from './routes/admin.js';
import { health } from './routes/health.js';

export type Env = {
  Bindings: {
    DB: D1Database;
    STORAGE: R2Bucket;
    ADMIN_API_KEY: string;
    STRIPE_SECRET_KEY: string;
    STRIPE_WEBHOOK_SECRET: string;
    STRIPE_PUBLISHABLE_KEY: string;
    PLATFORM_URL: string;
  };
  Variables: {
    seller: Record<string, unknown>;
    sellerId: string;
  };
};

const app = new Hono<Env>();

app.use('*', cors({ origin: '*' }));

app.route('/', health);
app.route('/', listings);
app.route('/', purchases);
app.route('/', partners);
app.route('/', stripeRoutes);
app.route('/', sellers);
app.route('/', admin);

app.notFound((c) => c.json({ success: false, error: 'Not found' }, 404));

export default {
  fetch: app.fetch,
};
