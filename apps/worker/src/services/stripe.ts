import type { Listing } from '@harness-marketplace/shared';

interface CheckoutParams {
  purchaseId: string;
  listing: Listing;
  buyerEmail: string;
  platformFee: number;
  sellerStripeAccountId: string | null;
}

interface EnvBindings {
  STRIPE_SECRET_KEY: string;
  STRIPE_WEBHOOK_SECRET: string;
  PLATFORM_URL: string;
}

/**
 * Create a Stripe Checkout session.
 * If STRIPE_SECRET_KEY is not set, returns a mock URL for local testing.
 */
export async function createCheckoutSession(
  env: EnvBindings,
  params: CheckoutParams,
): Promise<string> {
  if (!env.STRIPE_SECRET_KEY) {
    // Mock mode for local development
    return `${env.PLATFORM_URL}/api/stripe/success?purchase_id=${params.purchaseId}&mock=true`;
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const sessionParams: Record<string, unknown> = {
    mode: 'payment',
    customer_email: params.buyerEmail,
    line_items: [
      {
        price_data: {
          currency: params.listing.currency.toLowerCase(),
          product_data: {
            name: params.listing.title,
            description: params.listing.summary,
          },
          unit_amount: params.listing.price_cents,
        },
        quantity: 1,
      },
    ],
    metadata: {
      purchase_id: params.purchaseId,
      listing_id: params.listing.id,
    },
    success_url: `${env.PLATFORM_URL}/api/stripe/success?purchase_id=${params.purchaseId}`,
    cancel_url: `${env.PLATFORM_URL}/listings/${params.listing.slug}`,
  };

  // Stripe Connect: route payment to seller with platform fee
  if (params.sellerStripeAccountId) {
    sessionParams.payment_intent_data = {
      application_fee_amount: params.platformFee,
      transfer_data: {
        destination: params.sellerStripeAccountId,
      },
    };
  }

  const session = await stripe.checkout.sessions.create(
    sessionParams as Parameters<typeof stripe.checkout.sessions.create>[0],
  );

  return session.url ?? `${env.PLATFORM_URL}/api/stripe/success?purchase_id=${params.purchaseId}`;
}

/**
 * Verify Stripe webhook signature using Web Crypto (CF Workers compatible).
 */
export async function verifyStripeSignature(
  secret: string,
  rawBody: string,
  sigHeader: string,
): Promise<boolean> {
  const parts = Object.fromEntries(
    sigHeader.split(',').map((p) => {
      const [k, ...v] = p.split('=');
      return [k, v.join('=')];
    }),
  );
  const timestamp = parts.t;
  const expectedSig = parts.v1;
  if (!timestamp || !expectedSig) return false;

  const encoder = new TextEncoder();
  const signedPayload = `${timestamp}.${rawBody}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const computedSig = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return computedSig === expectedSig;
}

/**
 * Create Stripe Connect onboarding link for seller.
 */
export async function createConnectOnboardingUrl(
  env: EnvBindings,
  sellerId: string,
): Promise<{ accountId: string; url: string }> {
  if (!env.STRIPE_SECRET_KEY) {
    return {
      accountId: `acct_mock_${sellerId.slice(0, 8)}`,
      url: `${env.PLATFORM_URL}/sellers/me?mock_onboard=true`,
    };
  }

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const account = await stripe.accounts.create({ type: 'express' });

  const link = await stripe.accountLinks.create({
    account: account.id,
    refresh_url: `${env.PLATFORM_URL}/sellers/me`,
    return_url: `${env.PLATFORM_URL}/sellers/me?onboard_complete=true`,
    type: 'account_onboarding',
  });

  return { accountId: account.id, url: link.url };
}
