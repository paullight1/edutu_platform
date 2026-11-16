# Edutu Mobile - Deployment Checklist

## 🚀 Pre-Deployment Steps

### 1. Install Supabase CLI
```bash
# Windows (via Scoop)
scoop install supabase

# Or via npm
npm install -g supabase

# macOS
brew install supabase/tap/supabase
```

### 2. Run Database Migrations
```bash
# From project root:
supabase db push

# Or use the deployment script:
.\deploy-migrations.ps1   # Windows
bash deploy-migrations.sh  # macOS/Linux
```

### 3. Deploy RevenueCat Webhook
```bash
supabase functions deploy revenuecat-webhook

# Set webhook secret
supabase secrets set REVENUECAT_WEBHOOK_SECRET=your-random-secret-here
```

### 4. Configure RevenueCat (Follow REVENUECAT_SETUP.md)
- Create RevenueCat project
- Add iOS/Android apps
- Create products (see product list below)
- Configure entitlements: `pro`, `credits`
- Set up webhook URL + secret
- Add API keys to `.env`

### 5. Build and Test
```bash
# Development build
npx expo run:android
npx expo run:ios

# Production build
eas build --platform android --profile production
eas build --platform ios --profile production
```

---

## 📋 RevenueCat Product Configuration

### Subscriptions (Entitlement: `pro`)
| Product ID | Type | Price | Description |
|------------|------|-------|-------------|
| `pro_monthly` | Auto-Renewable | $9.99/mo | Monthly Pro subscription |
| `pro_yearly` | Auto-Renewable | $71.99/yr | Yearly Pro subscription |

### One-Time Products (Credits)
| Product ID | Price | Credits |
|------------|-------|---------|
| `credits_small` | $4.99 | 50 |
| `credits_medium` | $14.99 | 200 |
| `credits_large` | $29.99 | 500 |
| `credits_xlarge` | $49.99 | 1000 |

### App Store / Play Store Setup
- iOS: Products created in App Store Connect → Subscriptions + In-App Purchases
- Android: Products created in Google Play Console → Subscriptions + Managed products

---

## 🔑 Environment Variables Required

```env
# Existing
EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=...
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
EXPO_PUBLIC_API_URL=...

# Payment (RevenueCat)
EXPO_PUBLIC_REVENUECAT_API_KEY_IOS=appl_...
EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID=goog_...
```

---

## ✅ Pre-Launch Checklist

- [ ] All migrations applied (`supabase db push`)
- [ ] RevenueCat webhook deployed and configured
- [ ] RevenueCat API keys set in `.env`
- [ ] App Store products created and approved
- [ ] Play Store products created and approved
- [ ] Sandbox testing completed (subscription, credits, restore)
- [ ] Production build tested
- [ ] App Store submission ready
- [ ] Play Store submission ready
