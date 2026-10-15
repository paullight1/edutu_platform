import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export function GET() {
  const deploymentSource = process.env.DEPLOYMENT_PLATFORM?.trim().toLowerCase();

  return NextResponse.json({
    ok: true,
    service: 'pay.edutu.org',
    deploymentSource: deploymentSource || 'unknown',
    time: new Date().toISOString(),
  });
}
