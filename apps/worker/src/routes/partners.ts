import { Hono } from 'hono';
import type { Env } from '../index.js';

const partners = new Hono<Env>();

// ========== Partner Inquiry ==========

partners.post('/api/partners/:slug/inquire', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json<{
      name: string;
      email: string;
      company?: string;
      message: string;
    }>();

    if (!body.name || !body.email || !body.message) {
      return c.json({ success: false, error: 'name, email, and message are required' }, 400);
    }

    const listing = await c.env.DB.prepare(
      "SELECT id FROM listings WHERE slug = ? AND type = 'partner' AND status = 'published'",
    )
      .bind(slug)
      .first<{ id: string }>();

    if (!listing) {
      return c.json({ success: false, error: 'Partner listing not found' }, 404);
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO partner_inquiries (id, listing_id, name, email, company, message)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
      .bind(id, listing.id, body.name, body.email, body.company ?? null, body.message)
      .run();

    return c.json({ success: true, data: { id } }, 201);
  } catch (err) {
    console.error('POST /api/partners/:slug/inquire error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { partners };
