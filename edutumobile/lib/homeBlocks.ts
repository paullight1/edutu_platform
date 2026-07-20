// ─── Server-driven home blocks + custom features ─────────────────────────────
// Types and defensive normalisers for the admin-composed home layout and
// custom (web-backed) features delivered inside GET /mobile-control/config.
//
// Everything here is fail-open: a malformed payload normalises to empty, so the
// home screen falls back to its built-in hardcoded layout and never crashes.
// Unknown block `type`s are preserved verbatim so the renderer can decide to
// skip them — that is what makes new block types shippable via EAS Update
// without breaking older binaries.

export interface HomeBlock {
  id: string;
  type: string;
  props: Record<string, unknown>;
  enabled: boolean;
}

export type CustomFeatureOpenMode = 'webview' | 'external';
export type CustomFeaturePlacement = 'home' | 'tools' | 'both';

export interface CustomFeature {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  url: string;
  openMode: CustomFeatureOpenMode;
  placement: CustomFeaturePlacement;
  enabled: boolean;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Normalise the published home layout. Drops blocks that lack a usable id/type
 * or are explicitly disabled; keeps unknown types so the renderer can skip
 * them. Never throws.
 */
export function normaliseHomeLayout(payload: unknown): HomeBlock[] {
  if (!Array.isArray(payload)) return [];

  const blocks: HomeBlock[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = asString(record.id).trim();
    const type = asString(record.type).trim();
    if (!id || !type) continue;
    if (record.enabled === false) continue;

    blocks.push({
      id,
      type,
      props: asRecord(record.props),
      enabled: true,
    });
  }
  return blocks;
}

/**
 * Normalise the custom-features list. Drops entries missing a usable id/title/
 * url or explicitly disabled. Invalid openMode/placement fall back to safe
 * defaults. Never throws.
 */
export function normaliseCustomFeatures(payload: unknown): CustomFeature[] {
  if (!Array.isArray(payload)) return [];

  const features: CustomFeature[] = [];
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object') continue;
    const record = raw as Record<string, unknown>;
    const id = asString(record.id).trim();
    const title = asString(record.title).trim();
    const url = asString(record.url).trim();
    if (!id || !title || !url) continue;
    if (record.enabled === false) continue;

    const openMode: CustomFeatureOpenMode =
      record.openMode === 'external' ? 'external' : 'webview';
    const placementRaw = record.placement;
    const placement: CustomFeaturePlacement =
      placementRaw === 'home' || placementRaw === 'both' ? placementRaw : 'tools';

    features.push({
      id,
      title,
      subtitle: asString(record.subtitle).trim(),
      icon: asString(record.icon).trim(),
      url,
      openMode,
      placement,
      enabled: true,
    });
  }
  return features;
}

/** Custom features that should appear in the given surface. */
export function customFeaturesForPlacement(
  features: CustomFeature[] | null | undefined,
  surface: 'home' | 'tools',
): CustomFeature[] {
  if (!features) return [];
  return features.filter(
    (feature) => feature.placement === surface || feature.placement === 'both',
  );
}

export function findCustomFeature(
  features: CustomFeature[] | null | undefined,
  id: string | null | undefined,
): CustomFeature | null {
  if (!features || !id) return null;
  return features.find((feature) => feature.id === id) ?? null;
}
