/**
 * Weekly Digest Edge Function
 *
 * Cron schedule (Supabase Dashboard → Edge Functions → Schedule):
 *   0 9 * * 6  (Every Saturday at 9:00 AM UTC)
 *
 * Gathers user's weekly activity (goals, saved opportunities, deadlines,
 * application updates) and sends an HTML email digest.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const EMAIL_API_KEY = Deno.env.get('SUPABASE_EMAIL_API_KEY');

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface UserDigestPrefs {
  user_id: string;
  email: string | null;
}

async function fetchUsersWithDigestEnabled(
  supabase: ReturnType<typeof createClient>,
  targetDay: number,
): Promise<UserDigestPrefs[]> {
  const { data } = await supabase
    .from('notification_preferences')
    .select('user_id, weekly_digest_email')
    .eq('weekly_digest_enabled', true)
    .eq('weekly_digest_day', targetDay);

  if (!data?.length) return [];

  const userIds = data.map((d) => d.user_id);
  const { data: profiles } = await supabase
    .from('profiles')
    .select('user_id, email')
    .in('user_id', userIds);

  const emailMap = new Map((profiles || []).map((p) => [p.user_id, p.email]));
  return data.map((d) => ({
    user_id: d.user_id,
    email: d.weekly_digest_email || emailMap.get(d.user_id) || null,
  }));
}

async function fetchUserDigestData(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const [goalsRes, savedRes, deadlinesRes, appsRes] = await Promise.all([
    supabase.from('goals').select('title, progress, status').eq('user_id', userId).eq('status', 'active'),
    supabase.from('bookmarks').select('opportunities(title, organization)').eq('user_id', userId).gte('created_at', weekAgo).limit(10),
    supabase.from('goals').select('title, deadline').eq('user_id', userId).eq('status', 'active').gte('deadline', new Date().toISOString()).lte('deadline', nextWeek).order('deadline'),
    supabase.from('opportunity_applications').select('status, updated_at, opportunities(title)').eq('user_id', userId).gte('updated_at', weekAgo).order('updated_at', { ascending: false }).limit(10),
  ]);

  return {
    activeGoals: (goalsRes.data || []).length,
    completedGoals: (goalsRes.data || []).filter((g: any) => g.progress >= 100).length,
    newSaved: savedRes.data || [],
    upcomingDeadlines: deadlinesRes.data || [],
    applicationUpdates: appsRes.data || [],
  };
}

function generateDigestHTML(userId: string, data: Awaited<ReturnType<typeof fetchUserDigestData>>): string {
  const e = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#6366f1,#4f46e5);padding:32px 24px;text-align:center;">
<h1 style="color:#fff;margin:0;font-size:24px;">Your Week in Review</h1>
<p style="color:rgba(255,255,255,.85);margin:8px 0 0;font-size:14px;">${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
</td></tr>
<tr><td style="padding:24px;">
<h2 style="color:#1e293b;font-size:18px;margin:0 0 12px;">📊 Goal Progress</h2>
<p style="color:#475569;margin:0;">${data.activeGoals} active goals · ${data.completedGoals} completed this week</p>
</td></tr>
${data.newSaved.length ? `<tr><td style="padding:0 24px 24px;"><h2 style="color:#1e293b;font-size:18px;margin:0 0 12px;">💼 New Saved Opportunities</h2>${data.newSaved.map((s: any) => `<p style="color:#1e293b;margin:4px 0;font-weight:600;">${e(s.opportunities?.title || 'Untitled')}</p><p style="color:#64748b;margin:0 0 12px;font-size:13px;">${e(s.opportunities?.organization || '')}</p>`).join('')}</td></tr>` : ''}
${data.upcomingDeadlines.length ? `<tr><td style="padding:0 24px 24px;"><h2 style="color:#1e293b;font-size:18px;margin:0 0 12px;">⏰ Upcoming Deadlines</h2>${(data.upcomingDeadlines as any[]).map((d: any) => `<p style="color:#1e293b;margin:4px 0;">${e(d.title)} — <span style="color:#ef4444;font-weight:600;">${new Date(d.deadline).toLocaleDateString()}</span></p>`).join('')}</td></tr>` : ''}
<tr><td style="background:#f8fafc;padding:20px 24px;text-align:center;">
<p style="color:#94a3b8;font-size:12px;margin:0;">Manage preferences in Edutu app settings.<br>© ${new Date().getFullYear()} Edutu.</p>
</td></tr></table></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const today = new Date();
    const dayOfWeek = today.getDay();
    const targetDay = dayOfWeek === 0 ? 7 : dayOfWeek;
    const url = new URL(req.url);
    const effectiveDay = parseInt(url.searchParams.get('day') || String(targetDay), 10);

    console.log(`Running weekly digest for day ${effectiveDay}…`);
    const users = await fetchUsersWithDigestEnabled(supabase, effectiveDay);
    console.log(`Found ${users.length} users.`);

    const results: { userId: string; email: string; sent: boolean }[] = [];

    for (const user of users) {
      if (!user.email) continue;

      const data = await fetchUserDigestData(supabase, user.user_id);
      const hasContent = data.activeGoals > 0 || data.newSaved.length > 0 || data.upcomingDeadlines.length > 0;
      if (!hasContent) continue;

      const html = generateDigestHTML(user.user_id, data);
      const sent = EMAIL_API_KEY ? false : false; // Requires email provider API key

      if (EMAIL_API_KEY) {
        try {
          const emailRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${EMAIL_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ from: 'Edutu <digest@edutu.app>', to: user.email, subject: 'Your Weekly Edutu Digest', html }),
          });
          results.push({ userId: user.user_id, email: user.email, sent: emailRes.ok });
        } catch {
          results.push({ userId: user.user_id, email: user.email, sent: false });
        }
      } else {
        console.log(`Would send digest to ${user.email} — EMAIL_API_KEY not set`);
        results.push({ userId: user.user_id, email: user.email, sent: false });
      }
    }

    return new Response(JSON.stringify({
      success: true,
      usersProcessed: users.length,
      digestsGenerated: results.filter((r) => r.sent).length,
      results,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
