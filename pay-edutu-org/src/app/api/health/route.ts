import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  return NextResponse.json({
    ok: true,
    service: 'pay.edutu.org',
    deploymentSource: 'docploy',
    time: new Date().toISOString(),
  });
}
