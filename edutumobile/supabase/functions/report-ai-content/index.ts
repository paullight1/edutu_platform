import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyClerkRequest } from '../_shared/clerk-auth.ts';

const corsHeaders = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
};

const VALID_SOURCES = new Set(['chat', 'cv', 'copilot']);
const VALID_REASONS = new Set(['inaccurate', 'offensive', 'other']);
const MAX_CONTENT_LENGTH = 8000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    const origin = req.headers.get('Origin');
    const allowed = (Deno.env.get('EDUTU_ALLOWED_ORIGINS') || '').split(',').map((v) => v.trim());
    const headers = new Headers(corsHeaders);
    if (origin && allowed.includes(origin)) {
      headers.set('Access-Control-Allow-Origin', origin);
      headers.set('Vary', 'Origin');
    }
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type');
    return new Response(null, { status: 204, headers });
  }
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Request not supported' }), { status: 405, headers: corsHeaders });

  try {
    const claims = await verifyClerkRequest(req);
    const userId = claims.sub;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authenticated user required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const length = req.headers.get('content-length');
    if (length && (!/^\d+$/.test(length) || Number(length) > MAX_CONTENT_LENGTH + 4096)) {
      return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: corsHeaders });
    }
    const body = await req.json();
    const source = typeof body.source === 'string' ? body.source : '';
    const reason = typeof body.reason === 'string' ? body.reason : '';
    const content = typeof body.content === 'string' ? body.content.trim() : '';

    if (!VALID_SOURCES.has(source) || !VALID_REASONS.has(reason) || !content) {
      return new Response(JSON.stringify({ error: 'source, reason and content are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const context =
      body.context && typeof body.context === 'object' && !Array.isArray(body.context)
        ? body.context
        : {};

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { error } = await supabase.from('ai_content_reports').insert({
      user_id: userId,
      source,
      reason,
      content: content.slice(0, MAX_CONTENT_LENGTH),
      context,
    });

    if (error) {
      return new Response(JSON.stringify({ error: 'Service unavailable' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = (error as Error).message || '';
    const status = message.includes('bearer') || message.includes('token') ? 401 : 500;
    console.error('AI content report failed', { status });
    return new Response(JSON.stringify({ error: status === 401 ? 'Authentication failed' : 'Service unavailable' }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
