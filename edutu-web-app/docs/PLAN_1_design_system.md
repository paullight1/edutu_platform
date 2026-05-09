# Plan 1: Design System Alignment

## Objective
Align the mobile app's design system with the web app's visual style (colors, typography, components).

## Current State
### Mobile (edutu_mobile)
- Basic UI primitives: `Card`, `Badge`, `Avatar`, `EmptyState`, `ProgressBar`, `ScreenHeader`, `GlassView`
- Uses NativeWind with basic color palette in `constants/colors.ts`

### Web (web)
- Design tokens in `src/design-system/tokens.ts`
- Rich UI components: Button, Card, Badge, Input, Select, Dialog, Drawer, Table, ToastProvider, Skeleton, EmptyState, PullToRefresh, LanguageSelector
- Dark mode support with slate palette

## Tasks

### 1.1 Color Palette Alignment
- [ ] Sync brand colors from web (`brand-500` blue: `#3B82F6`) to mobile
- [ ] Copy dark mode slate palette (`slate-950` = `#0F172A`, `slate-900` = `#1E293B`)
- [ ] Update mobile `tailwind.config.js` with all web tokens
- [ ] Update `global.css` with CSS variables

### 1.2 UI Component Library (mobile/components/ui/)
Need to port from web:
- [ ] `Button.tsx` — primary, secondary, ghost variants; sizes sm/md/lg
- [ ] `Input.tsx` — with label, error states, icons
- [ ] `Select.tsx` — native picker or modal select
- [ ] `Dialog.tsx` — modal overlay using `@radix-ui/react-slot` or custom
- [ ] `Drawer.tsx` — bottom sheet drawer
- [ ] `Table.tsx` — for any list data
- [ ] `ToastProvider.tsx` — notifications/snackbars
- [ ] `Skeleton.tsx` — loading placeholders
- [ ] `Textarea.tsx` — multiline input
- [ ] `Label.tsx` — form labels
- [ ] `PullToRefresh.tsx` — refresh control
- [ ] `LanguageSelector.tsx` — i18n selector

### 1.3 Typography & Spacing
- [ ] Define font family (system default for mobile)
- [ ] Add spacing/sizing tokens matching web
- [ ] Set border radius scale (sm/md/lg/xl)

## Dependencies to Add
```bash
npx expo install expo-image
```

## Files to Modify
- `apps/edutu_mobile/tailwind.config.js`
- `apps/edutu_mobile/global.css`
- `apps/edutu_mobile/constants/colors.ts` (can remove, use tailwind)
- `apps/edutu_mobile/components/ui/` (new files)

## Success Criteria
- Mobile UI matches web visual style (dark mode, colors, components)
- All reused web components have mobile equivalents
- TypeScript types shared for design tokens