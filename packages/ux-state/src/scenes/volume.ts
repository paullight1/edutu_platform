import type { HueTokens, Layer, PaintMap, Volume } from './types';

/**
 * The volume dial, in full.
 *
 * It is deliberately a paint-resolution rule rather than separate art: the same
 * geometry serves both volumes, so the 26 scenes are authored once and the rule
 * cannot drift as scenes are added later.
 */
export function resolvePaints(volume: Volume, tokens: HueTokens): PaintMap {
  const invite = volume === 'invite';
  return {
    hero: invite ? tokens.hue : tokens.soft,
    mark: invite ? tokens.soft : tokens.hue,
    plate: tokens.plate,
    ink: tokens.ink,
    inkSoft: tokens.inkSoft,
    surface: tokens.surface,
    surfaceLine: tokens.surfaceLine,
  };
}

/**
 * Strip decorative layers from a calm scene.
 *
 * Confetti around an error is noise; the same confetti around a first-run empty
 * state is warmth. Rather than author two variants, decorative layers are tagged
 * and removed here.
 */
export function visibleLayers(layers: Layer[], volume: Volume): Layer[] {
  if (volume === 'invite') return layers;

  const keep: Layer[] = [];
  for (const layer of layers) {
    if (layer.decor) continue;
    if (layer.t === 'group') {
      keep.push({ ...layer, children: visibleLayers(layer.children, volume) });
    } else {
      keep.push(layer);
    }
  }
  return keep;
}
