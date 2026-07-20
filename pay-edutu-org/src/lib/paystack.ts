import crypto from 'crypto';
import { config } from './env';

const PAYSTACK_API = 'https://api.paystack.co';

export interface InitTransactionInput {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata: Record<string, unknown>;
  planCode?: string;
  /** Paystack channels to offer. Omit to let Paystack pick every channel valid
   *  for the currency (NGN → card/transfer/ussd, GHS/KES → card/mobile_money). */
  channels?: string[];
}

export interface InitTransactionResult {
  authorizationUrl: string;
  accessCode: string;
  reference: string;
}

/** Create a Paystack transaction and return its hosted-checkout URL. */
export async function initTransaction(input: InitTransactionInput): Promise<InitTransactionResult> {
  const body: Record<string, unknown> = {
    email: input.email,
    amount: input.amountMinor,
    currency: input.currency,
    reference: input.reference,
    callback_url: input.callbackUrl,
    metadata: input.metadata,
  };
  // Passing a plan turns this into a recurring subscription (Paystack ignores
  // `amount` and uses the plan's amount). Omit for one-time charges.
  if (input.planCode) body.plan = input.planCode;
  // Explicitly surface mobile money / bank transfer / USSD alongside cards —
  // most of our GH/NG users don't pay by card. Paystack silently drops any
  // channel not valid for the transaction currency.
  if (input.channels && input.channels.length) body.channels = input.channels;

  const res = await fetch(`${PAYSTACK_API}/transaction/initialize`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.paystackSecret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const json = (await res.json()) as {
    status: boolean;
    message: string;
    data?: { authorization_url: string; access_code: string; reference: string };
  };

  if (!res.ok || !json.status || !json.data) {
    throw new Error(`Paystack init failed: ${json.message || res.status}`);
  }

  return {
    authorizationUrl: json.data.authorization_url,
    accessCode: json.data.access_code,
    reference: json.data.reference,
  };
}

export interface VerifyResult {
  status: string; // 'success' | 'failed' | ...
  reference: string;
  amountMinor: number;
  currency: string;
  email: string | null;
  metadata: Record<string, any>;
}

/** Confirm a transaction after the user is redirected back. */
export async function verifyTransaction(reference: string): Promise<VerifyResult | null> {
  const res = await fetch(`${PAYSTACK_API}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${config.paystackSecret()}` },
    cache: 'no-store',
  });
  const json = (await res.json()) as { status: boolean; data?: any };
  if (!res.ok || !json.status || !json.data) return null;
  const d = json.data;
  return {
    status: d.status,
    reference: d.reference,
    amountMinor: d.amount,
    currency: d.currency,
    email: d.customer?.email ?? null,
    metadata: d.metadata ?? {},
  };
}

/** Disable a recurring subscription (needs the code + email token). */
export async function disableSubscription(code: string, token: string): Promise<boolean> {
  const res = await fetch(`${PAYSTACK_API}/subscription/disable`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.paystackSecret()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ code, token }),
  });
  const json = (await res.json()) as { status: boolean };
  return res.ok && json.status === true;
}

/** Verify the `x-paystack-signature` HMAC over the raw request body. */
export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  if (!signature) return false;
  const hash = crypto
    .createHmac('sha512', config.paystackSecret())
    .update(rawBody, 'utf8')
    .digest('hex');
  // Constant-time compare.
  const a = Buffer.from(hash);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
