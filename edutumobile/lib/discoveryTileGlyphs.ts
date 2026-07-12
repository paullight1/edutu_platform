import {
  BookOpen,
  Briefcase,
  CalendarDays,
  GraduationCap,
  HandCoins,
  Layers,
  Medal,
  Rocket,
} from 'lucide-react-native';
import type { DiscoveryCategoryId } from './discoveryCategories';

/**
 * Distinct lucide glyph per discovery category, shared by the discovery
 * chooser tiles and the home widget tiles. The catalog `icon` field only has
 * 5 coarse illustration types, so the 1:1 glyph mapping lives here.
 */
export const DISCOVERY_TILE_GLYPHS: Record<DiscoveryCategoryId, typeof GraduationCap> = {
  scholarships: GraduationCap,
  internships: Briefcase,
  programs: Layers,
  fellowships: Medal,
  grants: HandCoins,
  graduate_programs: BookOpen,
  bootcamps: Rocket,
  events: CalendarDays,
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
