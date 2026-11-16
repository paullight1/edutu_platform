import type Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import type { DiscoveryCategoryId } from './discoveryCategories';

export type DiscoveryGlyphName = ComponentProps<typeof Ionicons>['name'];

/**
 * Distinct SOLID glyph per discovery category, shared by the discovery chooser
 * tiles and the home widget tiles. The catalog `icon` field only has 5 coarse
 * illustration types, so the 1:1 glyph mapping lives here.
 *
 * Ionicons rather than lucide (which the rest of the app uses) because these
 * tiles need FILLED glyphs and lucide ships outline-only. lucide glyphs cannot
 * be filled after the fact: several are open polylines that implicitly close
 * into blobs under `fill` (Briefcase's handle merges with its body), and
 * dropping the stroke instead deletes zero-area details outright
 * (GraduationCap's tassel is a bare line). Ionicons' filled set is the shape we
 * actually want, so we don't fight the wrong tool.
 */
export const DISCOVERY_TILE_GLYPHS: Record<DiscoveryCategoryId, DiscoveryGlyphName> = {
  scholarships: 'school',
  internships: 'briefcase',
  programs: 'layers',
  fellowships: 'ribbon',
  grants: 'cash',
  graduate_programs: 'book',
  bootcamps: 'rocket',
  events: 'calendar',
};

/**
 * Solid gradient pairs for small tiles (same visual language as the
 * home-screen quick actions); catalog `colors` are rgba hero overlays, too
 * translucent for small surfaces.
 */
export const DISCOVERY_TILE_GRADIENTS: Record<DiscoveryCategoryId, [string, string]> = {
  scholarships: ['#F97316', '#DC2626'],
  internships: ['#3B82F6', '#1D4ED8'],
  programs: ['#10B981', '#059669'],
  fellowships: ['#8B5CF6', '#6D28D9'],
  grants: ['#14B8A6', '#0D9488'],
  graduate_programs: ['#7C3AED', '#4C1D95'],
  bootcamps: ['#EC4899', '#BE185D'],
  events: ['#0EA5E9', '#0369A1'],
};
