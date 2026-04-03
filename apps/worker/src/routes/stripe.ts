import { Hono } from 'hono';
import type { Env } from '../index.js';
import { verifyStripeSignature } from '../services/stripe.js';

const stripeRoutes = new Hono<Env>();

// ========== Stripe Webhook ==========

stripeRoutes.post('/api/stripe/webhook', async (c) => {
  try {
    let body: { id: string; type: string; data: { object: Record<string, unknown> } };

    if (c.env.STRIPE_WEBHOOK_SECRET) {
      const sigHeader = c.req.header('Stripe-Signature') ?? '';
      const rawBody = await c.req.text();
      const valid = await verifyStripeSignature(c.env.STRIPE_WEBHOOK_SECRET, rawBody, sigHeader);
      if (!valid) {
        return c.json({ success: false, error: 'Signature verification failed' }, 401);
      }
      body = JSON.parse(rawBody);
    } else {
      body = await c.req.json();
    }

    if (body.type === 'checkout.session.completed') {
      const metadata = body.data.object.metadata as Record<string, string> | undefined;
      const purchaseId = metadata?.purchase_id;
      if (!purchaseId) {
        return c.json({ success: true, data: { message: 'No purchase_id in metadata' } });
      }

      const stripePaymentId =
        (body.data.object.payment_intent as string) ?? body.data.object.id;

      // Complete the purchase (only if still pending)
      const updated = await c.env.DB.prepare(
        "UPDATE purchases SET status = 'completed', stripe_payment_id = ? WHERE id = ? AND status = 'pending' RETURNING listing_id",
      )
        .bind(stripePaymentId, purchaseId)
        .first<{ listing_id: string }>();

      // Only increment if we actually transitioned from pending
      if (updated) {
        await c.env.DB.prepare(
          'UPDATE listings SET install_count = install_count + 1 WHERE id = ?',
        )
          .bind(updated.listing_id)
          .run();
      }
    }

    return c.json({ success: true, data: { received: true } });
  } catch (err) {
    console.error('POST /api/stripe/webhook error:', err);
    return c.json({ success: false, error: 'Internal server error' }, 500);
  }
});

// ========== Post-Checkout Redirect ==========

stripeRoutes.get('/api/stripe/success', async (c) => {
  const purchaseId = c.req.query('purchase_id');
  const mock = c.req.query('mock');

  if (mock === 'true' && purchaseId) {
    // Mock mode: auto-complete the purchase
    await c.env.DB.prepare(
      "UPDATE purchases SET status = 'completed', stripe_payment_id = 'mock_payment' WHERE id = ? AND status = 'pending'",
    )
      .bind(purchaseId)
      .run();

    const purchase = await c.env.DB.prepare(
      'SELECT listing_id FROM purchases WHERE id = ?',
    )
      .bind(purchaseId)
      .first<{ listing_id: string }>();

    if (purchase) {
      await c.env.DB.prepare(
        'UPDATE listings SET install_count = install_count + 1 WHERE id = ?',
      )
        .bind(purchase.listing_id)
        .run();
    }
  }

  return c.json({
    success: true,
    data: { message: 'Purchase complete', purchase_id: purchaseId },
  });
});

export { stripeRoutes };
