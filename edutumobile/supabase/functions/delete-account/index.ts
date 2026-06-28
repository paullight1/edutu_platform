import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { verifyClerkRequest } from '../_shared/clerk-auth.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const claims = await verifyClerkRequest(req);
    const body = await req.json();
    const userId = claims.sub;
    
    if (body.user_id && body.user_id !== userId) {
      return new Response(JSON.stringify({ error: 'Cannot delete another user account' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!userId) {
      return new Response(JSON.stringify({ error: 'Authenticated user required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const errors: string[] = [];
    const deleteFrom = async (table: string, column: string) => {
      const { error } = await supabase.from(table).delete().eq(column, userId);
      if (error && error.code !== '42P01') {
        errors.push(`${table}.${column}: ${error.message}`);
      }
    };

    // Delete in dependency order. Optional legacy tables are tolerated when absent.
    await deleteFrom('chat_messages', 'user_id');
    await deleteFrom('chat_threads', 'user_id');
    await deleteFrom('flashcard_reviews', 'user_id');
    await deleteFrom('flashcard_study_sessions', 'user_id');
    await deleteFrom('flashcard_decks', 'user_id');
    await deleteFrom('quiz_attempts', 'user_id');
    await deleteFrom('quizzes', 'user_id');
    await deleteFrom('goals', 'user_id');
    await deleteFrom('bookmarks', 'user_id');
    await deleteFrom('user_opportunity_bookmarks', 'user_id');
    await deleteFrom('user_opportunity_preferences', 'user_id');
    await deleteFrom('user_opportunity_signals', 'user_id');
    await deleteFrom('notifications', 'user_id');
    await deleteFrom('user_notifications', 'user_id');
    await deleteFrom('opportunity_applications', 'user_id');
    await deleteFrom('wallet_transactions', 'user_id');
    await deleteFrom('payment_transactions', 'user_id');
    await deleteFrom('credit_purchases', 'user_id');
    await deleteFrom('subscriptions', 'user_id');
    await deleteFrom('transactions', 'user_id');
    await deleteFrom('roadmap_enrollments', 'user_id');
    await deleteFrom('user_roadmap_intents', 'user_id');
    await deleteFrom('roadmap_feedback', 'user_id');
    await deleteFrom('creator_applications', 'user_id');
    await deleteFrom('creator-applications', 'user_id');
    await deleteFrom('community_posts', 'user_id');
    await deleteFrom('community_stories', 'user_id');
    await deleteFrom('marketplace_enrollments', 'user_id');
    await deleteFrom('marketplace_items', 'creator_id');
    await deleteFrom('marketplace_listings', 'seller_id');
    await deleteFrom('user_cvs', 'user_id');
    await deleteFrom('tickets', 'user_id');
    await deleteFrom('profiles', 'user_id');

    if (errors.length > 0) {
      return new Response(JSON.stringify({ error: 'Failed to delete all account data', details: errors }), {
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
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
