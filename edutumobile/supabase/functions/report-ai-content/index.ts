import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyClerkRequest } from '../_shared/clerk-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VALID_SOURCES = new Set(['chat', 'cv', 'copilot']);
const VALID_REASONS = new Set(['inaccurate', 'offensive', 'other']);
const MAX_CONTENT_LENGTH = 8000;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const claims = await verifyClerkRequest(req);
    const userId = claims.sub;

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authenticated user required' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
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
      return new Response(JSON.stringify({ error: 'Failed to store report' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const message = (error as Error).message;
    const status = message.includes('bearer') || message.includes('token') ? 401 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
