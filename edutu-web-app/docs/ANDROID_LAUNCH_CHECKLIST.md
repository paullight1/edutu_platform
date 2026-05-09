# Edutu Android Launch Checklist

## Pre-Launch Verification

### 🔧 Build & Configuration
- [ ] Run `npm run build` successfully
- [ ] Run `npx cap sync android` to sync web assets
- [ ] Verify `capacitor.config.ts` has correct `appId`: `ai.edutu.app`
- [ ] Verify `webDir` is set to `dist`
- [ ] Open in Android Studio: `npx cap open android`

### 🔐 Supabase Dashboard Configuration
- [ ] Add redirect URL: `ai.edutu.app://auth/callback`
- [ ] Add redirect URL: `ai.edutu.app://auth/callback?signup=true`
- [ ] Verify Google OAuth is properly configured
- [ ] Test OAuth flow works on web before testing on Android

### 📱 Android Studio Setup
- [ ] Update `android/app/build.gradle` with correct `applicationId`
- [ ] Configure signing keys (release keystore)
- [ ] Set minimum SDK version (recommend API 24+)
- [ ] Add internet permission in `AndroidManifest.xml`

### 🎨 Branding Assets Needed
- [ ] App icon (mipmap-xxxhdpi: 192x192px)
- [ ] Splash screen image (1920x1920px recommended)
- [ ] Play Store icon (512x512px)
- [ ] Feature graphic (1024x500px)

---

## Functional Testing Checklist

### 🔑 Authentication
- [ ] Google Sign-In opens browser/Chrome Custom Tab
- [ ] OAuth callback returns to app correctly
- [ ] User session persists after app restart
- [ ] Logout clears session completely
- [ ] New user onboarding flow works

### 📱 Navigation
- [ ] Android back button navigates correctly
- [ ] Back button on home shows "press again to exit"
- [ ] Double-tap back on home exits app
- [ ] All tab navigation works
- [ ] PageHeader back buttons function correctly

### ⌨️ Keyboard & Forms
- [ ] Keyboard appears for all input fields
- [ ] Input fields scroll into view when focused
- [ ] Keyboard dismisses when tapping outside
- [ ] Form validation displays correctly
- [ ] No input zoom issues on Android

### 🖼️ UI/UX
- [ ] Safe area insets work on notched devices
- [ ] Status bar color matches app theme
- [ ] Dark mode toggle works correctly
- [ ] All animations run smoothly
- [ ] Touch targets are at least 44x44px
- [ ] Ripple effects on buttons work

### 📊 Core Features
- [ ] Dashboard stats load real-time data
- [ ] Goals can be created, updated, deleted
- [ ] Opportunities load and display correctly
- [ ] Community Marketplace shows roadmaps
- [ ] Chat interface sends/receives messages
- [ ] Profile updates save correctly

### 🔔 Splash Screen
- [ ] Native splash screen appears on cold start
- [ ] Smooth transition to app content
- [ ] No blank screen flash

---

## Performance Testing

### 📈 Metrics to Check
- [ ] Cold start time < 3 seconds
- [ ] Navigation transitions < 300ms
- [ ] No visible jank during scrolling
- [ ] Memory usage stays stable
- [ ] No memory leaks on navigation

### 🔋 Battery & Resources
- [ ] No excessive battery drain
- [ ] Network requests are efficient
- [ ] Images are properly sized
- [ ] No console errors in production

---

## Device Testing Matrix

### Recommended Test Devices
- [ ] Low-end device (2GB RAM, older CPU)
- [ ] Mid-range device (4GB RAM)
- [ ] High-end device (8GB+ RAM)
- [ ] Device with notch/punch hole
- [ ] Device with gesture navigation
- [ ] Device with physical buttons

### Android Versions
- [ ] Android 7.0 (API 24) - Minimum
- [ ] Android 10 (API 29)
- [ ] Android 12 (API 31)
- [ ] Android 13+ (API 33+) - Latest

---

## Pre-Release Checklist

### 🔒 Security
- [ ] `webContentsDebuggingEnabled: false` in production
- [ ] No sensitive data in logs
- [ ] HTTPS enforced everywhere
- [ ] Environment variables not exposed

### 📝 App Store Listing
- [ ] App description ready
- [ ] Screenshots captured (phone + tablet)
- [ ] Privacy policy URL
- [ ] Terms of service URL
- [ ] Contact email configured

### 🚀 Final Steps
- [ ] Generate signed APK/AAB
- [ ] Test signed build on real device
- [ ] Upload to Play Console
- [ ] Set up internal testing track first
- [ ] Gradual rollout for production

---

## Quick Commands Reference

```bash
# Build web assets
npm run build

# Sync to Android
npx cap sync android

# Open in Android Studio
npx cap open android

# Update plugins
npm update @capacitor/core @capacitor/android

# Generate resources (if using cordova-res)
cordova-res android --skip-config --copy
```

---

## Troubleshooting

### OAuth Not Returning to App
1. Check redirect URL in Supabase matches exactly
2. Verify scheme in `strings.xml` matches `ai.edutu.app`
3. Check intent filter in `AndroidManifest.xml`

### White Screen on Start
1. Check if web assets are synced (`npx cap sync`)
2. Verify `dist` folder exists and contains `index.html`
3. Check console logs in Android Studio

### Keyboard Issues
1. Ensure `Keyboard.resize: 'body'` in config
2. Check if input has `font-size: 16px` (prevents zoom)
3. Verify `keyboard-aware` class on scrollable containers

---

## Support Contacts
- Capacitor Docs: https://capacitorjs.com/docs
- Supabase Docs: https://supabase.com/docs
- Android Studio: https://developer.android.com/studio

---

*Last updated: December 23, 2024*
