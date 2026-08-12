export type BillingStatus = 'processing' | 'active' | 'failed' | 'cancelled' | 'underpaid' | 'needs_review';

const STATUSES = new Set<BillingStatus>(['processing', 'active', 'failed', 'cancelled', 'underpaid', 'needs_review']);

export function billingStatus(value: unknown): BillingStatus | null {
  return typeof value === 'string' && STATUSES.has(value as BillingStatus) ? value as BillingStatus : null;
}

export function statusCopy(status: BillingStatus): { title: string; body: string; poll: boolean } {
  switch (status) {
    case 'active':
      return { title: 'Access is active', body: 'Your Edutu access has been confirmed by our billing service.', poll: false };
    case 'failed':
      return { title: 'Payment was not confirmed', body: 'We could not confirm this payment. Check your payment method or try again from Edutu. If money left your account, contact support with your support reference.', poll: false };
    case 'cancelled':
      return { title: 'Checkout was cancelled', body: 'No payment has been confirmed. You can start a new checkout from Edutu when you are ready.', poll: false };
    case 'underpaid':
      return { title: 'Payment needs attention', body: 'The payment is not confirmed for access yet. Our support team can help you complete or review it.', poll: false };
    case 'needs_review':
      return { title: 'Payment needs review', body: 'Your payment needs a quick review before access can be confirmed. Contact support with your support reference.', poll: false };
    default:
      return { title: 'Confirming your payment', body: 'We are waiting for the billing service to confirm the final status. This page will update automatically.', poll: true };
  }
}
