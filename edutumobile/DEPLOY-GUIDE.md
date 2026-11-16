# EduTu Mobile - Deployment Guide

## Quick Status: What's Fixed

| Issue | Status |
|-------|--------|
| Build error (npm peer deps) | FIXED |
| Splash icon path | FIXED |
| iOS buildNumber format | FIXED |
| Privacy Policy URL | FIXED (config + web pages) |
| Support URL | FIXED |
| iOS permission strings | FIXED |
| Account deletion (Supabase + Clerk) | FIXED |
| Apple sign-in icon | FIXED |
| RevenueCat webhook signature | FIXED |
| Deep link domain validation | FIXED |
| Gemini API key in URL | FIXED |
| Rate limiting on chat-proxy | FIXED |
| console.log in production | FIXED (__DEV__ wrapped) |
| Dynamic paywall prices | FIXED |
| expo-av version mismatch | FIXED |
| @types/react-native removed | FIXED |
| EAS production profile | FIXED |
| Push notification registration | FIXED |
| Security headers on edge functions | FIXED |
| Delete account edge function | CREATED |

---

## 1. Deploy Privacy & Terms Web Pages

The pages are at `public/privacy.html` and `public/terms.html`. They must be hosted at:
- `https://edutu.org/privacy`
- `https://edutu.org/terms`

### Option A: Deploy to edutu.org (Recommended)
Upload both HTML files to your web server:
```bash
# If using nginx/apache on edutu.org:
scp public/privacy.html user@edutu.org:/var/www/html/privacy/index.html
scp public/terms.html user@edutu.org:/var/www/html/terms/index.html
```

### Option B: Deploy to Netlify/Vercel (Free Alternative)
If edutu.org isn't ready yet, deploy to a free host:
```bash
# Using Netlify:
npx netlify deploy --dir=public --prod --site=edutu-privacy

# Then update app.config.js URLs:
# privacyPolicyUrl: "https://edutu-privacy.netlify.app/privacy.html"
# supportUrl: "https://edutu-privacy.netlify.app/terms.html"
```

### Option C: GitHub Pages
```bash
# Push public/ to a gh-pages branch
git subtree push --prefix public origin gh-pages
# URL: https://hanaedutu.github.io/edutu_mobile/privacy.html
```

### Verify Deployment
After deploying, test:
```bash
curl -I https://edutu.org/privacy   # Should return 200
curl -I https://edutu.org/terms     # Should return 200
```

---

## 2. Deploy Supabase Edge Functions

```bash
# Navigate to project
cd C:\Users\USER\Desktop\app-projects\Edutu_Folder\edutu_mobile

# Deploy delete-account function (NEW)
npx supabase functions deploy delete-account --project-ref sioxocmrjmdevsdlzns

# Deploy revenuecat-webhook (UPDATED with signature verification)
npx supabase functions deploy revenuecat-webhook --project-ref sioxocmrjmdevsdlzns

# Deploy clerk-webhook (UPDATED with null check)
npx supabase functions deploy clerk-webhook --project-ref sioxocmrjmdevsdlzns

# Deploy chat-proxy (UPDATED with rate limiting + auth header)
npx supabase functions deploy chat-proxy --project-ref sioxocmrjmdevsdlzns
```

### Set Edge Function Secrets
```bash
npx supabase secrets set --project-ref sioxocmrjmdevsdlzns \
  REVENUECAT_WEBHOOK_SECRET=your-actual-secret \
  CLERK_WEBHOOK_SECRET=your-actual-secret
```

---

## 3. Configure Firebase for Android Push

1. Go to https://console.firebase.google.com
2. Create/select your Firebase project
3. Add Android app with package name: `com.edutu.com`
4. Download `google-services.json`
5. Replace the placeholder at `google-services.json` with the real file
6. Ensure `google-services.json` is in `.gitignore` (it is)

---

## 4. Configure RevenueCat Products

### App Store Connect (iOS)
1. Go to https://appstoreconnect.apple.com
2. Navigate to your app > Subscriptions
3. Create these Auto-Renewable Subscriptions:
   - `pro_monthly` - $9.99/month
   - `pro_yearly` - $71.99/year
4. Create these Non-Renewing Subscriptions (or Non-Consumable IAP):
   - `credits_small` - $4.99 (50 credits)
   - `credits_medium` - $14.99 (200 credits)
   - `credits_large` - $29.99 (500 credits)
   - `credits_xlarge` - $49.99 (1000 credits)

### Google Play Console (Android)
1. Go to https://play.google.com/console
2. Navigate to your app > Monetize > Products
3. Create the same product IDs as above
4. For subscriptions: use "Subscriptions" section
5. For credits: use "Managed products" (In-app products)

### RevenueCat Dashboard
1. Go to https://app.revenuecat.com
2. Create entitlements: `pro`, `credits`
3. Link App Store Connect and Google Play products
4. Set up webhook URL: `https://sioxocmrjmdevsdlzns.supabase.co/functions/v1/revenuecat-webhook`
5. Copy iOS and Android API keys to `.env`

---

## 5. Verify Icons

Before production build, confirm:
- `assets/icon.png`: **1024x1024**
- `assets/adaptive-icon.png`: **1024x1024**
- `assets/favicon.png`: **64x64**

---

## 6. Remove .env from Git History

```bash
# Install git-filter-repo if not installed
pip install git-filter-repo

# Remove .env from all git history
git filter-repo --invert-paths --path .env --force

# Rotate exposed keys IMMEDIATELY after this:
# 1. Clerk: Generate new publishable key at https://dashboard.clerk.com
# 2. Supabase: Regenerate anon key at https://supabase.com/dashboard/project/sioxocmrjmdevsdlzns/settings/api
```

---

## 7. Build for Production

### iOS (TestFlight)
```bash
eas build --platform ios --profile production
```

### Android (Internal Testing)
```bash
eas build --platform android --profile production
```

### Both Platforms
```bash
eas build --platform all --profile production
```

---

## 8. Submit to Stores

### Apple App Store
```bash
eas submit --platform ios
```
**App Store Connect Setup:**
- Category: Education
- Age Rating: 4+ (fill out questionnaire honestly)
- App Privacy Labels: Fill out using the data inventory below
- Demo Account: Provide test credentials in Review Notes
- What's New: "Initial release"

### Google Play Store
```bash
eas submit --platform android
```
**Play Console Setup:**
- Category: Education
- Content Rating: Complete IARC questionnaire
- Data Safety Form: Fill out using data inventory below
- App Access: Provide demo credentials
- **New Personal Accounts**: Must complete 12 testers × 14 days closed testing

---

## 9. App Store Connect - Privacy Labels

Fill out these data types in App Store Connect > App Privacy:

### Data Used to Track You
- **NONE** (no tracking SDKs)

### Data Linked to You
| Data Type | Purpose |
|-----------|---------|
| Contact Info (Name, Email) | App Functionality, Account Management |
| User Content (Messages, Files) | App Functionality |
| Identifiers (User ID, Device ID) | App Functionality, Analytics |
| Usage Data (App Interactions) | Analytics, App Functionality |
| Purchases (Transaction History) | App Functionality |
| Diagnostics (Crash Data) | App Functionality |
| Photos (Profile Images) | App Functionality |

### Data Not Linked to You
- **NONE**

---

## 10. Google Play Console - Data Safety Form

### Security Practices
- [x] Data is encrypted in transit (HTTPS)
- [x] You can request that data be deleted

### Data Collected and Shared
| Data Type | Collected? | Shared? | Optional? | Purpose |
|-----------|------------|---------|-----------|---------|
| Name | Yes | No | No | App functionality, Account management |
| Email | Yes | No | No | App functionality, Account management |
| User IDs | Yes | No | No | App functionality |
| App interactions | Yes | No | No | Analytics, App functionality |
| App info/performance | Yes | No | No | Analytics |
| Device IDs | Yes | No | No | App functionality |
| Photos | Yes | No | Yes | App functionality |
| Purchase history | Yes | No | No | App functionality |

---

## 11. Remaining Items Requiring Manual Action

| Item | Priority | Notes |
|------|----------|-------|
| Resize icons to correct sizes | HIGH | Use image editor |
| Remove .env from git history | HIGH | Then rotate all keys |
| Create actual google-services.json | HIGH | From Firebase Console |
| Host privacy/terms pages at edutu.org | HIGH | Before submission |
| Create App Store screenshots | HIGH | 6.7" iPhone + iPad if supported |
| Create Play Store screenshots | HIGH | Min 2 phone screenshots + feature graphic |
| Configure RevenueCat products in stores | HIGH | Before paywall works |
| Deploy Supabase edge functions | HIGH | After testing locally |
| Fill App Privacy labels (Apple) | MEDIUM | In App Store Connect |
| Fill Data Safety form (Google) | MEDIUM | In Play Console |
| Complete IARC questionnaire (Google) | MEDIUM | In Play Console |
| Provide demo credentials for review | MEDIUM | In Review Notes for both stores |
| Closed testing (Google, new accounts) | MEDIUM | 12 testers × 14 days |

---

## 12. Still Needs Attention (Not Auto-Fixable)

### User-Generated Content Safeguards (Apple Guideline 1.2)
The app has community stories and marketplace listings but lacks:
- **Report content button** on user-generated content
- **Block user** functionality
- **Content moderation** pipeline

These are significant features that require dedicated development time. Without them, Apple may reject the app under Guideline 1.2.

**Recommended approach:** Add a simple "Report" button to community story cards and marketplace items that sends a notification to your admin email. Add a "Block" button to user profiles.

### Sign in with Apple Native Implementation
Clerk's `oauth_apple` uses web-based OAuth flow. Apple Guideline 4.8 requires the native `ASAuthorizationAppleIDProvider` on iOS when offering third-party social logins.

**Options:**
1. Install `react-native-apple-authentication` and use it alongside Clerk
2. Use Clerk's native Apple sign-in flow (check Clerk docs for latest support)
3. Remove Google OAuth entirely (then Apple Sign-in is not required)

---

## Build Command Summary

```bash
# Install dependencies
npm install

# Type check
npm run typecheck

# Build for production
eas build --platform all --profile production

# Submit
eas submit --platform ios
eas submit --platform android
```
