import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

    try {
        const { url } = await req.json()
        if (!url) return new Response('Missing URL', { status: 400, headers: corsHeaders })

        console.log(`Scraping URL: ${url}`)

        // 1. Fetch content
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        })

        if (!res.ok) {
            throw new Error(`Failed to fetch URL: ${res.status} ${res.statusText}`)
        }

        const html = await res.text()
        const textContent = html
            .replace(/<script\b[^>]*>([\s\S]*?)<\/script>/gi, "")
            .replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, "")
            .replace(/<[^>]+>/g, " ")
            .replace(/\s+/g, " ")
            .slice(0, 8000)

        // 2. Extract with AI (DeepSeek)
        const DEEPSEEK_KEY = Deno.env.get("DEEPSEEK_API_KEY");
        const DEEPSEEK_API_URL =
          Deno.env.get("DEEPSEEK_API_URL") ?? "https://api.deepseek.com/chat/completions";

        if (!DEEPSEEK_KEY) throw new Error("DEEPSEEK_API_KEY not configured");

        const prompt = `Extract opportunity details from this text and return valid JSON.
Text: ${textContent}

JSON Structure:
{
  "title": "...",
  "summary": "...",
  "description": "...",
  "organization": "...",
  "category": "Scholarships/Internships/Fellowships/Grants/Programs/Competitions",
  "location": "...",
  "is_remote": boolean,
  "application_url": "${url}",
  "close_date": "YYYY-MM-DD",
  "image_url": "...",
  "eligibility": {
    "school": "...",
    "major": "...",
    "min_cgpa": "...",
    "countries": []
  }
}`

        const aiRes = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${DEEPSEEK_KEY}`,
            },
            body: JSON.stringify({
                model: "deepseek-chat",
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                stream: false,
            }),
        })

        const aiData = await aiRes.json()
        const output =
            aiData?.choices?.[0]?.message?.content ||
            aiData?.choices?.[0]?.message?.text ||
            "";
        const result = JSON.parse(output);

        return new Response(JSON.stringify({
            success: true,
            data: result,
            confidence: 85,
            source: 'edge-ai'
        }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })

    } catch (error) {
        console.error('Scrape error:', error)
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
    }
})
