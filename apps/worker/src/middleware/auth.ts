import type { Context, Next } from 'hono';
import type { Env } from '../index.js';

/**
 * Extract seller from API key (Bearer token).
 * Uses dedicated api_key column, not the seller UUID.
 */
export async function sellerAuth(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing Authorization header' }, 401);
  }
  const apiKey = authHeader.slice(7);
  const seller = await c.env.DB.prepare('SELECT * FROM sellers WHERE api_key = ?')
    .bind(apiKey)
    .first();
  if (!seller) {
    return c.json({ success: false, error: 'Invalid seller API key' }, 401);
  }
  c.set('seller', seller);
  c.set('sellerId', (seller as { id: string }).id);
  await next();
}

/**
 * Admin auth via ADMIN_API_KEY.
 */
export async function adminAuth(c: Context<Env>, next: Next) {
  const authHeader = c.req.header('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing Authorization header' }, 401);
  }
  const key = authHeader.slice(7);
  if (key !== c.env.ADMIN_API_KEY) {
    return c.json({ success: false, error: 'Invalid admin API key' }, 403);
  }
  await next();
}
