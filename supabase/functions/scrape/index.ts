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

        // 2. Extract with AI (Gemini)
        const GEMINI_KEY = Deno.env.get('GEMINI_API_KEY')
        if (!GEMINI_KEY) throw new Error('GEMINI_API_KEY not configured')

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

        const aiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${GEMINI_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: { responseMimeType: "application/json" }
            })
        })

        const aiData = await aiRes.json()
        const result = JSON.parse(aiData.candidates[0].content.parts[0].text)

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
