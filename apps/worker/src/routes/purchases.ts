import { Hono } from 'hono';
import type { Env } from '../index.js';
import type { Listing } from '@harness-marketplace/shared';
import { COMMISSION_RATE } from '@harness-marketplace/shared';
import { createCheckoutSession } from '../services/stripe.js';

const purchases = new Hono<Env>();

// ========== Initiate Purchase ==========

purchases.post('/api/listings/:slug/purchase', async (c) => {
  try {
    const slug = c.req.param('slug');
    const body = await c.req.json<{ email: string }>();

    if (!body.email) {
      return c.json({ success: false, error: 'email is required' }, 400);
    }

    const listing = await c.env.DB.prepare(
      "SELECT * FROM listings WHERE slug = ? AND status = 'published'",
    )
      .bind(slug)
      .first<Listing>();

    if (!listing) {
      return c.json({ success: false, error: 'Listing not found' }, 404);
    }

    const purchaseId = crypto.randomUUID();
    const platformFee = Math.round(listing.price_cents * COMMISSION_RATE);
    const sellerPayout = listing.price_cents - platformFee;

    // Free items — skip Stripe entirely
    if (listing.price_cents === 0) {
      await c.env.DB.prepare(
        `INSERT INTO purchases (id, listing_id, buyer_email, amount_cents, platform_fee_cents, seller_payout_cents, status)
         VALUES (?, ?, ?, 0, 0, 0, 'completed')`,
      )
        .bind(purchaseId, listing.id, body.email)
        .run();

      // Increment install count
      await c.env.DB.prepare(
        'UPDATE listings SET install_count = install_count + 1 WHERE id = ?',
      )
        .bind(listing.id)
        .run();

      return c.json({
        success: true,
        data: {
          purchase_id: purchaseId,
          status: 'completed',
        },
      });
    }

    // Paid items — create Stripe checkout
    const seller = await c.env.DB.prepare(
      'SELECT stripe_account_id FROM sellers WHERE id = ?',
    )
      .bind(listing.seller_id)
      .first<{ stripe_account_id: string | null }>();

    const checkoutUrl = await createCheckoutSession(c.env, {
      purchaseId,
      listing,
      buyerEmail: body.email,
      platformFee,
      sellerStripeAccountId: seller?.stripe_account_id ?? null,
    });

    // Create pending purchase
    await c.env.DB.prepare(
      `INSERT INTO purchases (id, listing_id, buyer_email, amount_cents, platform_fee_cents, seller_payout_cents, status)
       VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    )
      .bind(purchaseId, listing.id, body.email, listing.price_cents, platformFee, sellerPayout)
      .run();

    return c.json({
      success: true,
      data: { purchase_id: purchaseId, checkout_url: checkoutUrl },
    });
  } catch (err) {
    console.error('POST /api/listings/:slug/purchase error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

export { purchases };
