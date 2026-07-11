import { NextRequest, NextResponse } from 'next/server';
import { config } from '@/lib/env';
import { ADMIN_COOKIE, isValidAdminToken, signAdminSession } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// POST /api/admin/login (form field: token)
// Exchanges the admin token for a short-lived httpOnly session cookie, so the
// token never appears in a URL. Redirects back to /admin either way.
export async function POST(req: NextRequest) {
  let token = '';
  try {
    const form = await req.formData();
    token = String(form.get('token') || '');
  } catch {
    // fall through — treated as a bad token
  }

  const base = config.baseUrl();

  if (!isValidAdminToken(token)) {
    return NextResponse.redirect(`${base}/admin?error=bad_token`, 303);
  }

  const session = signAdminSession();
  const res = NextResponse.redirect(`${base}/admin`, 303);
  if (session) {
    res.cookies.set(ADMIN_COOKIE, session, {
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 7200,
    });
  }
  return res;
}
