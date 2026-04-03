import { Hono } from 'hono';
import type { Env } from '../index.js';
import type { Seller, Listing } from '@harness-marketplace/shared';
import { sellerAuth } from '../middleware/auth.js';
import { createConnectOnboardingUrl } from '../services/stripe.js';

const sellers = new Hono<Env>();

// ========== Register ==========

sellers.post('/api/sellers/register', async (c) => {
  try {
    const body = await c.req.json<{
      email: string;
      display_name: string;
      bio?: string;
    }>();

    if (!body.email || !body.display_name) {
      return c.json({ success: false, error: 'email and display_name are required' }, 400);
    }

    const existing = await c.env.DB.prepare('SELECT id FROM sellers WHERE email = ?')
      .bind(body.email)
      .first();
    if (existing) {
      return c.json({ success: false, error: 'Email already registered' }, 409);
    }

    const id = crypto.randomUUID();
    const apiKey = `hm_${crypto.randomUUID().replace(/-/g, '')}`;
    await c.env.DB.prepare(
      `INSERT INTO sellers (id, email, display_name, bio, api_key) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(id, body.email, body.display_name, body.bio ?? null, apiKey)
      .run();

    return c.json({
      success: true,
      data: { id, api_key: apiKey, message: 'Save this API key — it cannot be shown again' },
    }, 201);
  } catch (err) {
    console.error('POST /api/sellers/register error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Get Profile ==========

sellers.get('/api/sellers/me', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const seller = await c.env.DB.prepare('SELECT * FROM sellers WHERE id = ?')
      .bind(sellerId)
      .first<Seller>();
    return c.json({ success: true, data: seller });
  } catch (err) {
    console.error('GET /api/sellers/me error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Update Profile ==========

sellers.put('/api/sellers/me', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const body = await c.req.json<{
      display_name?: string;
      bio?: string;
      avatar_url?: string;
    }>();

    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.display_name !== undefined) {
      fields.push('display_name = ?');
      values.push(body.display_name);
    }
    if (body.bio !== undefined) {
      fields.push('bio = ?');
      values.push(body.bio);
    }
    if (body.avatar_url !== undefined) {
      fields.push('avatar_url = ?');
      values.push(body.avatar_url);
    }

    if (fields.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400);
    }

    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now')");
    values.push(sellerId);

    await c.env.DB.prepare(
      `UPDATE sellers SET ${fields.join(', ')} WHERE id = ?`,
    )
      .bind(...values)
      .run();

    const seller = await c.env.DB.prepare('SELECT * FROM sellers WHERE id = ?')
      .bind(sellerId)
      .first<Seller>();

    return c.json({ success: true, data: seller });
  } catch (err) {
    console.error('PUT /api/sellers/me error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Stripe Onboard ==========

sellers.post('/api/sellers/stripe-onboard', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const { accountId, url } = await createConnectOnboardingUrl(c.env, sellerId);

    await c.env.DB.prepare(
      "UPDATE sellers SET stripe_account_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?",
    )
      .bind(accountId, sellerId)
      .run();

    return c.json({ success: true, data: { onboarding_url: url } });
  } catch (err) {
    console.error('POST /api/sellers/stripe-onboard error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Create Listing ==========

sellers.post('/api/sellers/listings', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const body = await c.req.json<{
      type: string;
      slug: string;
      title: string;
      summary: string;
      description: string;
      price_cents?: number;
      currency?: string;
      category?: string;
      tags?: string;
      harness_type?: string;
      version?: string;
    }>();

    if (!body.type || !body.slug || !body.title || !body.summary || !body.description) {
      return c.json({ success: false, error: 'type, slug, title, summary, and description are required' }, 400);
    }

    const existing = await c.env.DB.prepare('SELECT id FROM listings WHERE slug = ?')
      .bind(body.slug)
      .first();
    if (existing) {
      return c.json({ success: false, error: 'Slug already taken' }, 409);
    }

    const id = crypto.randomUUID();
    await c.env.DB.prepare(
      `INSERT INTO listings (id, seller_id, type, slug, title, summary, description, price_cents, currency, category, tags, harness_type, version)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
      .bind(
        id,
        sellerId,
        body.type,
        body.slug,
        body.title,
        body.summary,
        body.description,
        body.price_cents ?? 0,
        body.currency ?? 'JPY',
        body.category ?? null,
        body.tags ?? null,
        body.harness_type ?? null,
        body.version ?? '1.0.0',
      )
      .run();

    const listing = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?')
      .bind(id)
      .first<Listing>();

    return c.json({ success: true, data: listing }, 201);
  } catch (err) {
    console.error('POST /api/sellers/listings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Update Listing ==========

sellers.put('/api/sellers/listings/:id', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const listingId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      'SELECT id FROM listings WHERE id = ? AND seller_id = ?',
    )
      .bind(listingId, sellerId)
      .first();
    if (!existing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    const body = await c.req.json<Record<string, unknown>>();
    const allowedFields = [
      'title', 'summary', 'description', 'price_cents', 'currency',
      'category', 'tags', 'harness_type', 'version',
    ];

    const fields: string[] = [];
    const values: unknown[] = [];

    for (const key of allowedFields) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(body[key]);
      }
    }

    if (fields.length === 0) {
      return c.json({ success: false, error: 'No fields to update' }, 400);
    }

    fields.push("updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now')");
    values.push(listingId, sellerId);

    await c.env.DB.prepare(
      `UPDATE listings SET ${fields.join(', ')} WHERE id = ? AND seller_id = ?`,
    )
      .bind(...values)
      .run();

    const listing = await c.env.DB.prepare('SELECT * FROM listings WHERE id = ?')
      .bind(listingId)
      .first<Listing>();

    return c.json({ success: true, data: listing });
  } catch (err) {
    console.error('PUT /api/sellers/listings/:id error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Upload to R2 ==========

sellers.post('/api/sellers/listings/:id/upload', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const listingId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      'SELECT id, slug FROM listings WHERE id = ? AND seller_id = ?',
    )
      .bind(listingId, sellerId)
      .first<{ id: string; slug: string }>();
    if (!existing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    const formData = await c.req.formData();
    const file = formData.get('file') as unknown as { name: string; type: string; stream(): ReadableStream } | null;
    if (!file || typeof file === 'string') {
      return c.json({ success: false, error: 'file field is required (multipart)' }, 400);
    }

    const fileType = (formData.get('type') as string) ?? 'asset';
    const ext = file.name.split('.').pop() ?? 'bin';
    const r2Key = `listings/${existing.slug}/${fileType}-${Date.now()}.${ext}`;

    await c.env.STORAGE.put(r2Key, file.stream(), {
      httpMetadata: { contentType: file.type },
    });

    if (fileType === 'package') {
      await c.env.DB.prepare(
        "UPDATE listings SET r2_key = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?",
      )
        .bind(r2Key, listingId)
        .run();
    } else if (fileType === 'screenshot') {
      const listing = await c.env.DB.prepare('SELECT screenshot_keys FROM listings WHERE id = ?')
        .bind(listingId)
        .first<{ screenshot_keys: string | null }>();
      const keys = listing?.screenshot_keys ? JSON.parse(listing.screenshot_keys) as string[] : [];
      keys.push(r2Key);
      await c.env.DB.prepare(
        "UPDATE listings SET screenshot_keys = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?",
      )
        .bind(JSON.stringify(keys), listingId)
        .run();
    }

    return c.json({ success: true, data: { r2_key: r2Key } });
  } catch (err) {
    console.error('POST /api/sellers/listings/:id/upload error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Publish Listing ==========

sellers.put('/api/sellers/listings/:id/publish', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const listingId = c.req.param('id');

    const existing = await c.env.DB.prepare(
      "SELECT id, status FROM listings WHERE id = ? AND seller_id = ?",
    )
      .bind(listingId, sellerId)
      .first<{ id: string; status: string }>();
    if (!existing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }
    if (existing.status === 'published') {
      return c.json({ success: false, error: 'Already published' }, 400);
    }

    await c.env.DB.prepare(
      "UPDATE listings SET status = 'pending', updated_at = strftime('%Y-%m-%dT%H:%M:%f', 'now') WHERE id = ?",
    )
      .bind(listingId)
      .run();

    return c.json({ success: true, data: { message: 'Listing submitted for review' } });
  } catch (err) {
    console.error('PUT /api/sellers/listings/:id/publish error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== List Own Listings ==========

sellers.get('/api/sellers/listings', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');
    const rows = await c.env.DB.prepare(
      'SELECT * FROM listings WHERE seller_id = ? ORDER BY created_at DESC',
    )
      .bind(sellerId)
      .all<Listing>();

    return c.json({ success: true, data: rows.results });
  } catch (err) {
    console.error('GET /api/sellers/listings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Earnings ==========

sellers.get('/api/sellers/earnings', sellerAuth, async (c) => {
  try {
    const sellerId = c.get('sellerId');

    const result = await c.env.DB.prepare(
      `SELECT
        COUNT(*) as total_sales,
        COALESCE(SUM(p.seller_payout_cents), 0) as total_earnings_cents,
        COALESCE(SUM(p.platform_fee_cents), 0) as total_fees_cents
       FROM purchases p
       JOIN listings l ON l.id = p.listing_id
       WHERE l.seller_id = ? AND p.status = 'completed'`,
    )
      .bind(sellerId)
      .first<{ total_sales: number; total_earnings_cents: number; total_fees_cents: number }>();

    const breakdown = await c.env.DB.prepare(
      `SELECT
        l.id, l.title, l.slug,
        COUNT(p.id) as sales,
        COALESCE(SUM(p.seller_payout_cents), 0) as earnings_cents
       FROM listings l
       LEFT JOIN purchases p ON p.listing_id = l.id AND p.status = 'completed'
       WHERE l.seller_id = ?
       GROUP BY l.id
       ORDER BY earnings_cents DESC`,
    )
      .bind(sellerId)
      .all();

    return c.json({
      success: true,
      data: {
        total_sales: result?.total_sales ?? 0,
        total_earnings_cents: result?.total_earnings_cents ?? 0,
        total_fees_cents: result?.total_fees_cents ?? 0,
        listings: breakdown.results,
      },
    });
  } catch (err) {
    console.error('GET /api/sellers/earnings error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { sellers };
