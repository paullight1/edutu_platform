/** Provider money stays in its documented decimal-string representation. */
export type BachsDecimalAmount = string;

export interface BachsProduct {
  id: string;
  status: string;
  price: {
    priceType: string;
    currency: string;
    amount: BachsDecimalAmount;
  };
  billingCycle: Record<string, unknown> | null;
}

/** Edutu catalog policy categories. */
export type BillingPaymentMethod =
  | "card"
  | "crypto"
  | "bank_transfer"
  | "mobile_money";

/** Exact corridors accepted by Bachs' `payment_method_types` field. */
export type BachsPaymentMethod =
  | "USD_CARD"
  | "NGN_CARD"
  | "NGN_BANK_TRANSFER"
  | "MOMO_GHS"
  | "MOMO_KES"
  | "MOMO_TZS"
  | "MOMO_UGX"
  | "MOMO_XAF"
  | "MOMO_XOF"
  | "MOMO_RWF"
  | "MOMO_MWK"
  | "MOMO_ZMW"
  | "CRYPTO";

const PAYMENT_METHOD_CORRIDORS: Record<
  BillingPaymentMethod,
  readonly BachsPaymentMethod[]
> = {
  card: ["USD_CARD", "NGN_CARD"],
  bank_transfer: ["NGN_BANK_TRANSFER"],
  mobile_money: [
    "MOMO_GHS",
    "MOMO_KES",
    "MOMO_TZS",
    "MOMO_UGX",
    "MOMO_XAF",
    "MOMO_XOF",
    "MOMO_RWF",
    "MOMO_MWK",
    "MOMO_ZMW",
  ],
  crypto: ["CRYPTO"],
};

export function toBachsPaymentMethodTypes(
  methods: readonly BillingPaymentMethod[],
): BachsPaymentMethod[] {
  return [
    ...new Set(methods.flatMap((method) => PAYMENT_METHOD_CORRIDORS[method])),
  ];
}

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
  paymentMethodTypes?: BachsPaymentMethod[];
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
  metadata?: Record<string, unknown>;
  checkoutId?: string | null;
  productId?: string | null;
  userId?: string | null;
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
