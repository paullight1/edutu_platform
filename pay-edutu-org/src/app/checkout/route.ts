import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Legacy entrypoint deliberately has no provider behavior. Checkout sessions
// are created only by the authenticated canonical Nest billing API.
export async function GET(_req: NextRequest) {
  return NextResponse.json(
    { error: 'payments_not_ready' },
    { status: 503, headers: { 'Cache-Control': 'no-store' } },
  );
}
