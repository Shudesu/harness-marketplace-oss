// ========== Constants ==========

export const COMMISSION_RATE = 0.15;

export const CATEGORIES = [
  'beauty',
  'education',
  'ecommerce',
  'fitness',
  'food',
  'healthcare',
  'marketing',
  'real-estate',
  'recruitment',
  'saas',
  'other',
] as const;

export type Category = (typeof CATEGORIES)[number];

export const HARNESS_TYPES = [
  'line',
  'x',
  'instagram',
  'universal',
] as const;

export type HarnessType = (typeof HARNESS_TYPES)[number];

export const LISTING_TYPES = ['plugin', 'template', 'partner'] as const;
export type ListingType = (typeof LISTING_TYPES)[number];

export const SELLER_STATUSES = ['pending', 'active', 'suspended'] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const LISTING_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const PURCHASE_STATUSES = ['pending', 'completed', 'refunded'] as const;
export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

// ========== Types ==========

export interface Seller {
  id: string;
  email: string;
  display_name: string;
  bio: string | null;
  avatar_url: string | null;
  api_key: string;
  stripe_account_id: string | null;
  stripe_onboarded: number;
  status: SellerStatus;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  seller_id: string;
  type: ListingType;
  slug: string;
  title: string;
  summary: string;
  description: string;
  price_cents: number;
  currency: string;
  category: string | null;
  tags: string | null;
  harness_type: string | null;
  version: string;
  r2_key: string | null;
  screenshot_keys: string | null;
  install_count: number;
  avg_rating: number;
  rating_count: number;
  status: ListingStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Purchase {
  id: string;
  listing_id: string;
  buyer_email: string;
  stripe_payment_id: string | null;
  amount_cents: number;
  platform_fee_cents: number;
  seller_payout_cents: number;
  status: PurchaseStatus;
  created_at: string;
}

export interface Review {
  id: string;
  listing_id: string;
  purchase_id: string;
  buyer_email: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export interface PartnerInquiry {
  id: string;
  listing_id: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  status: string;
  created_at: string;
}
