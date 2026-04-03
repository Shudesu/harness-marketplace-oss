import { Hono } from 'hono';
import type { Env } from '../index.js';
import type { Listing, Review } from '@harness-marketplace/shared';

const listings = new Hono<Env>();

// ========== Browse / Search ==========

listings.get('/api/listings', async (c) => {
  try {
    const type = c.req.query('type');
    const category = c.req.query('category');
    const harness = c.req.query('harness');
    const q = c.req.query('q');
    const sort = c.req.query('sort') ?? 'recent';
    const page = Math.max(1, Number(c.req.query('page') ?? '1'));
    const limit = 20;
    const offset = (page - 1) * limit;

    const conditions: string[] = ["status = 'published'"];
    const binds: unknown[] = [];

    if (type) {
      conditions.push('type = ?');
      binds.push(type);
    }
    if (category) {
      conditions.push('category = ?');
      binds.push(category);
    }
    if (harness) {
      conditions.push('harness_type = ?');
      binds.push(harness);
    }
    if (q) {
      conditions.push('(title LIKE ? OR summary LIKE ? OR tags LIKE ?)');
      const pattern = `%${q}%`;
      binds.push(pattern, pattern, pattern);
    }

    let orderBy: string;
    switch (sort) {
      case 'popular':
        orderBy = 'install_count DESC';
        break;
      case 'rating':
        orderBy = 'avg_rating DESC';
        break;
      default:
        orderBy = 'published_at DESC';
    }

    const where = conditions.join(' AND ');
    const sql = `SELECT * FROM listings WHERE ${where} ORDER BY ${orderBy} LIMIT ? OFFSET ?`;
    binds.push(limit, offset);

    const countSql = `SELECT COUNT(*) as total FROM listings WHERE ${where}`;
    const countBinds = binds.slice(0, -2);

    const [rows, countRow] = await Promise.all([
      c.env.DB.prepare(sql).bind(...binds).all<Listing>(),
      c.env.DB.prepare(countSql).bind(...countBinds).first<{ total: number }>(),
    ]);

    return c.json({
      success: true,
      data: rows.results,
      meta: { page, limit, total: countRow?.total ?? 0 },
    });
  } catch (err) {
    console.error('GET /api/listings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Detail ==========

listings.get('/api/listings/:slug', async (c) => {
  try {
    const slug = c.req.param('slug');
    const listing = await c.env.DB.prepare(
      "SELECT * FROM listings WHERE slug = ? AND status = 'published'",
    )
      .bind(slug)
      .first<Listing>();

    if (!listing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    // Include seller info
    const seller = await c.env.DB.prepare(
      'SELECT id, display_name, bio, avatar_url FROM sellers WHERE id = ?',
    )
      .bind(listing.seller_id)
      .first();

    return c.json({ success: true, data: { ...listing, seller } });
  } catch (err) {
    console.error('GET /api/listings/:slug error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Reviews ==========

listings.get('/api/listings/:slug/reviews', async (c) => {
  try {
    const slug = c.req.param('slug');
    const listing = await c.env.DB.prepare(
      "SELECT id FROM listings WHERE slug = ? AND status = 'published'",
    )
      .bind(slug)
      .first<{ id: string }>();

    if (!listing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    const rows = await c.env.DB.prepare(
      'SELECT * FROM reviews WHERE listing_id = ? ORDER BY created_at DESC',
    )
      .bind(listing.id)
      .all<Review>();

    return c.json({ success: true, data: rows.results });
  } catch (err) {
    console.error('GET /api/listings/:slug/reviews error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { listings };
