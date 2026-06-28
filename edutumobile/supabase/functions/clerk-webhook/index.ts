import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { Webhook } from "https://esm.sh/svix@1.21.0"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.7"

const CLERK_WEBHOOK_SECRET = Deno.env.get('CLERK_WEBHOOK_SECRET')
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

const SECURITY_HEADERS = {
  'Content-Type': 'application/json',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
};

serve(async (req) => {
    const svix_id = req.headers.get("svix-id")
    const svix_timestamp = req.headers.get("svix-timestamp")
    const svix_signature = req.headers.get("svix-signature")

    if (!svix_id || !svix_timestamp || !svix_signature) {
        return new Response(JSON.stringify({ error: "Error occurred -- no svix headers" }), {
            status: 400,
            headers: SECURITY_HEADERS,
        })
    }

    if (!CLERK_WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "Webhook secret not configured" }), {
            status: 500,
            headers: SECURITY_HEADERS,
        })
    }

    const payload = await req.json()
    const body = JSON.stringify(payload)

    const wh = new Webhook(CLERK_WEBHOOK_SECRET)

    let evt: any

    try {
        evt = wh.verify(body, {
            "svix-id": svix_id,
            "svix-timestamp": svix_timestamp,
            "svix-signature": svix_signature,
        })
    } catch (err) {
        return new Response(JSON.stringify({ error: "Error occurred" }), {
            status: 400,
            headers: SECURITY_HEADERS,
        })
    }

    const { id, unsafe_metadata, first_name, last_name, email_addresses, image_url } = evt.data
    const eventType = evt.type

    if (__DEV__) {
        console.log(`Webhook received: ${eventType} for user ${id}`)
    }

    if (eventType === "user.created" || eventType === "user.updated") {
        const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!)

        const email = email_addresses?.[0]?.email_address
        const fullName = `${first_name || ""} ${last_name || ""}`.trim()

        const { error } = await supabase
            .from("profiles")
            .upsert({
                user_id: id,
                email: email,
                full_name: fullName,
                avatar_url: image_url,
                age: unsafe_metadata?.age,
                degree: unsafe_metadata?.degree,
                country: unsafe_metadata?.country,
                major: unsafe_metadata?.major || unsafe_metadata?.educationDetails?.major,
                school: unsafe_metadata?.school || unsafe_metadata?.educationDetails?.school,
                bio: unsafe_metadata?.interests || unsafe_metadata?.bio,
                updated_at: new Date().toISOString(),
            }, { onConflict: 'user_id' })

        if (error) {
            console.error("Error upserting profile:", error)
            return new Response(JSON.stringify({ error: "Error updating database" }), { status: 500, headers: SECURITY_HEADERS })
        }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: SECURITY_HEADERS })
})
