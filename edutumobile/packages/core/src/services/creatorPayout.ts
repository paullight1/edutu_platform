/**
 * Creator Payout System
 *
 * Manages creator earnings, payout schedules, and payment processing.
 *
 * Payout tiers based on performance:
 * - Bronze: < 100 enrollments, 70% revenue share
 * - Silver: 100-500 enrollments, 80% revenue share
 * - Gold: 500+ enrollments, 90% revenue share
 *
 * Payout schedule: Monthly (processed on the 1st of each month)
 * Minimum payout threshold: $50
 */

export type CreatorTier = 'bronze' | 'silver' | 'gold';

export interface CreatorEarnings {
  userId: string;
  tier: CreatorTier;
  totalEarnings: number;
  availableBalance: number;
  pendingBalance: number;
  lastPayoutAt: string | null;
  totalEnrollments: number;
  totalStudents: number;
  averageRating: number;
  revenueShare: number;
}

export interface PayoutRecord {
  id: string;
  userId: string;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  method: 'bank_transfer' | 'paypal' | 'mobile_money';
  destination: string; // masked account/email
  createdAt: string;
  completedAt: string | null;
}

const TIER_THRESHOLDS = {
  bronze: { min: 0, revenueShare: 0.70 },
  silver: { min: 100, revenueShare: 0.80 },
  gold: { min: 500, revenueShare: 0.90 },
};

const MIN_PAYOUT = 50; // $50 minimum

export function calculateCreatorTier(totalEnrollments: number): CreatorTier {
  if (totalEnrollments >= TIER_THRESHOLDS.gold.min) return 'gold';
  if (totalEnrollments >= TIER_THRESHOLDS.silver.min) return 'silver';
  return 'bronze';
}

export function getRevenueShare(tier: CreatorTier): number {
  return TIER_THRESHOLDS[tier].revenueShare;
}

export function canRequestPayout(availableBalance: number): boolean {
  return availableBalance >= MIN_PAYOUT;
}

export function calculateEarnings(
  enrollmentCount: number,
  pricePerEnrollment: number,
  tier: CreatorTier,
): { gross: number; platformFee: number; net: number } {
  const gross = enrollmentCount * pricePerEnrollment;
  const share = TIER_THRESHOLDS[tier].revenueShare;
  const net = Math.round(gross * share * 100) / 100;
  return {
    gross: Math.round(gross * 100) / 100,
    platformFee: Math.round((gross - net) * 100) / 100,
    net,
  };
}

/**
 * Format a payout method for display (mask sensitive info).
 */
export function maskPayoutDestination(method: PayoutRecord['method'], destination: string): string {
  switch (method) {
    case 'bank_transfer':
      // Show last 4 digits of account number
      return `Bank ····${destination.slice(-4)}`;
    case 'paypal':
      // Show first char and domain
      const atIndex = destination.indexOf('@');
      return atIndex > 0
        ? `${destination[0]}***@${destination.slice(atIndex + 1)}`
        : 'PayPal account';
    case 'mobile_money':
      return `Mobile ····${destination.slice(-4)}`;
    default:
      return destination;
  }
}
