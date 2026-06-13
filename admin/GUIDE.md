# Edutu Admin Production Deployment Guide

This app is intentionally separate from the user web app.

Production target:

```txt
https://admin.edutu.org
```

Backend target:

```txt
https://edutu-api.onrender.com
```

## Why admin stays separate

- Admin code should not be bundled into the public user web app.
- Admin can use stricter auth, separate deploys, and separate environment variables.
- If the user web app has traffic or UI issues, admin remains independently accessible.
- Production routing is cleaner: `admin.edutu.org` for operators, user app/domain for learners.

## App location

```bash
cd edutu-platform/admin
```

## Required environment variables

Set these in the hosting dashboard for the admin site:

```env
VITE_SUPABASE_URL=https://sioxocmrjmdevsdlzjns.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
VITE_API_URL=https://edutu-api.onrender.com
VITE_BACKEND_URL=https://edutu-api.onrender.com
```

Do not put service-role keys, DeepSeek keys, Clerk secret keys, or backend-only secrets in this admin frontend.

## Local commands

Install:

```bash
npm install
```

Run locally:

```bash
npm run dev
```

Build:

```bash
npm run build
```

Preview production output:

```bash
npm run preview
```

## Spaceship deployment

Use Spaceship static hosting or any static web hosting product that can serve a Vite build.

Build settings:

```txt
Root directory: edutu-platform/admin
Install command: npm install
Build command: npm run build
Publish/output directory: dist
```

Domain:

```txt
admin.edutu.org
```

SPA fallback:

```txt
/* -> /index.html
```

This repo includes `public/_redirects` for hosts that support Netlify-style redirects. If Spaceship has its own rewrite UI, add the same SPA fallback there too.

## DNS setup on Spaceship

In Spaceship DNS for `edutu.org`, add the record requested by the hosting provider.

Common patterns:

```txt
Type: CNAME
Host: admin
Value: <hosting-provider-target>
```

or:

```txt
Type: A
Host: admin
Value: <hosting-provider-ip>
```

Use the exact target Spaceship/host gives you.

## Backend CORS

The backend must allow:

```txt
https://admin.edutu.org
```

Also keep local dev origins:

```txt
http://localhost:5173
```

If admin requests fail in production with CORS errors, update the backend CORS allowlist and redeploy Render.

## Supabase settings

In Supabase Auth settings, add admin domain to allowed URLs if using Supabase auth flows:

```txt
https://admin.edutu.org
```

Also keep local dev:

```txt
http://localhost:5173
```

## Admin security checklist

- Only expose `VITE_SUPABASE_ANON_KEY` to the frontend.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`.
- Never expose `DEEPSEEK_API_KEY`.
- Never expose `CLERK_SECRET_KEY`.
- Ensure backend admin endpoints require admin auth.
- Ensure production admin accounts are limited to trusted operators.
- Use strong passwords and 2FA where available.

## Production smoke test

After deploy:

1. Open `https://admin.edutu.org`.
2. Sign in as an admin.
3. Load Opportunities.
4. Load Scraper.
5. Load Mobile Control / notification controls.
6. Trigger a harmless in-app notification/config update.
7. Confirm the mobile app receives the in-app change.
8. Confirm browser console has no CORS or missing env errors.

## Relationship to user web app

Keep these separate:

```txt
admin.edutu.org       -> Admin dashboard
app.edutu.org         -> User web app, if deployed
edutu.org             -> Marketing/waitlist site, if deployed
```

Do not merge the admin dashboard into the public user web app for launch unless there is a strong reason. Separate deployment is safer and faster.
