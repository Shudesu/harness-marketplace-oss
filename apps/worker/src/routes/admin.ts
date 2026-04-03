import { Hono } from 'hono';
import type { Env } from '../index.js';
import type { Listing } from '@harness-marketplace/shared';
import { adminAuth } from '../middleware/auth.js';

const admin = new Hono<Env>();

// ========== Pending Listings ==========

admin.get('/api/admin/listings/pending', adminAuth, async (c) => {
  try {
    const rows = await c.env.DB.prepare(
      "SELECT l.*, s.display_name as seller_name, s.email as seller_email FROM listings l JOIN sellers s ON s.id = l.seller_id WHERE l.status = 'pending' ORDER BY l.updated_at ASC",
    )
      .all();

    return c.json({ success: true, data: rows.results });
  } catch (err) {
    console.error('GET /api/admin/listings/pending error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Approve Listing ==========

admin.put('/api/admin/listings/:id/approve', adminAuth, async (c) => {
  try {
    const listingId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      "SELECT id FROM listings WHERE id = ? AND status = 'pending'",
    )
      .bind(listingId)
      .first();
    if (!existing) {
      return c.json({ success: false, error: 'Pending listing not found' }, 404);
    }

    await c.env.DB.prepare(
      "UPDATE listings SET status = 'published', published_at = strftime('%Y-%m-%dT%H:%M:%f', 'now'), updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?",
    )
      .bind(listingId)
      .run();

    const listing = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?')
      .bind(listingId)
      .first<Listing>();

    return c.json({ success: true, data: listing });
  } catch (err) {
    console.error('PUT /api/admin/listings/:id/approve error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Reject Listing ==========

admin.put('/api/admin/listings/:id/reject', adminAuth, async (c) => {
  try {
    const listingId = c.req.param('id');
    const body = await c.req.json<{ reason?: string }>().catch(() => ({ reason: undefined }));

    const existing = await c.env.DB.prepare(
      "SELECT id FROM listings WHERE id = ? AND status = 'pending'",
    )
      .bind(listingId)
      .first();
    if (!existing) {
      return c.json({ success: false, error: 'Pending listing not found' }, 404);
    }

    await c.env.DB.prepare(
      "UPDATE listings SET status = 'rejected', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?",
    )
      .bind(listingId)
      .run();

    return c.json({
      success: true,
      data: { message: 'Listing rejected', reason: body.reason ?? null },
    });
  } catch (err) {
    console.error('PUT /api/admin/listings/:id/reject error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { admin };
