/**
 * Deep-link navigation is now handled entirely by Expo Router's automatic
 * linking plus the bridge routes under `app/opportunity`, `app/roadmap`, and
 * `app/goal` (which redirect the singular scheme paths to their real plural
 * screens). This hook previously ALSO pushed routes manually from a second
 * `Linking` listener — that raced the automatic linker, so a tapped widget could
 * land on "Unmatched Route" (auto-linker on the raw singular path) or double-push
 * the destination. Keeping the manual handler off makes navigation deterministic:
 * exactly one navigation per deep link, always to the right screen.
 *
 * The hook is intentionally kept as a no-op so its call site and any future
 * deep-link side effects (analytics, etc.) have a home without reintroducing the
 * duplicate navigation.
 */
export function useDeepLink() {
  // No-op: see the file comment above.
}
