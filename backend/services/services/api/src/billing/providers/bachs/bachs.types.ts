/** Provider money stays in its documented decimal-string representation. */
export type BachsDecimalAmount = string;

export type BachsPaymentMethod =
  | "card"
  | "crypto"
  | "bank_transfer"
  | "mobile_money";

export interface BachsCustomerInput {
  email: string;
  name?: string;
  phoneNumber?: string;
  metadata?: Record<string, unknown>;
}

export interface BachsCheckoutInput {
  productId: string;
  customer: BachsCustomerInput;
  billingCurrency?: string;
  allowedPaymentMethodTypes?: BachsPaymentMethod[];
  successUrl: string;
  cancelUrl: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  idempotencyKey: string;
}

export interface BachsCheckoutSession {
  checkoutId: string;
  checkoutUrl: string;
  status: "open" | "completed" | "expired" | "cancelled";
  expiresAt: string;
  createdAt: string;
  reference?: string;
}

export interface BachsCustomer extends BachsCustomerInput {
  customerId: string;
  createdAt: string;
  updatedAt: string;
}

export interface BachsPortalSession {
  id: string;
  url: string;
}

export interface BachsPagination {
  nextCursor: string | null;
  previousCursor: string | null;
  hasMore: boolean;
  limit: number;
  offset: number;
}

export interface BachsListQuery {
  cursor?: string;
  limit?: number;
}

export interface BachsPayment {
  id: string;
  reference: string | null;
  status: string;
  isRefundable: boolean;
  amount: BachsDecimalAmount;
  amountPaid: BachsDecimalAmount;
  amountRemaining: BachsDecimalAmount;
  settlementAmount: BachsDecimalAmount;
  currency: string;
  createdAt: string;
  updatedAt: string;
}

export interface BachsSubscription {
  id: string;
  status: string;
  currency: string;
  amount: BachsDecimalAmount;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
}

export interface BachsRefund {
  refundId: string;
  chargeId: string;
  reference: string;
  status: string;
  requestedAmount: BachsDecimalAmount;
  refundedAmount: BachsDecimalAmount | null;
  createdAt: string;
  updatedAt: string;
}

export interface BachsListResult<T> {
  items: T[];
  pagination: BachsPagination | null;
}

export interface BachsCreateCustomerInput extends BachsCustomerInput {
  idempotencyKey: string;
}

export interface BachsPortalSessionInput {
  customerId: string;
  idempotencyKey: string;
}

/**
 * The caller supplies the currency exponent explicitly from its server-owned
 * catalog/ledger. This prevents floating-point money conversion in this layer.
 */
export interface BachsCreateRefundInput {
  chargeId: string;
  reference: string;
  reason?: string;
  amountMinor?: bigint;
  currencyExponent?: 0 | 2 | 3;
  idempotencyKey: string;
}
