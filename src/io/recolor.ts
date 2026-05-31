import type { IndexedPolyhedron, Color, Face } from './common';
import type { LayerColorsConfig } from '../state/app-state';

/**
 * Parses a hex color "#rgb" or "#rrggbb" (with optional alpha) into a [r, g, b, a] tuple
 * where each channel is in [0, 1].
 */
function parseHexColor(hex: string): Color {
  let h = hex.trim();
  if (h.startsWith('#')) h = h.slice(1);
  if (h.length === 3) {
    h = h.split('').map(c => c + c).join('');
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    return [r, g, b, 1];
  }
  if (h.length === 8) {
    const r = parseInt(h.slice(0, 2), 16) / 255;
    const g = parseInt(h.slice(2, 4), 16) / 255;
    const b = parseInt(h.slice(4, 6), 16) / 255;
    const a = parseInt(h.slice(6, 8), 16) / 255;
    return [r, g, b, a];
  }
  return [1, 1, 1, 1];
}

/**
 * Returns a new polyhedron where each face's `colorIndex` may have been overridden
 * according to the per-component layer-color config. Faces whose centroid Z falls
 * inside a configured `[from, to]` span for their owning component get a new color.
 *
 * `from` and `to` are in mm (i.e., raw OFF Z coordinate values; OpenSCAD's default unit).
 * If multiple spans overlap, the first matching span wins.
 *
 * Faces in components without any configured spans are left untouched.
 */
export function applyLayerColors(
  off: IndexedPolyhedron,
  faceToComponent: Int32Array,
  config: LayerColorsConfig,
): IndexedPolyhedron {
  // Quick early-out: nothing to do if every entry has no layers.
  const hasAny = config?.some(entry => (entry?.layers?.length ?? 0) > 0);
  if (!hasAny) return off;

  // Pre-sort each component's layers ascending by `from` so we can pick the
  // latest layer whose `from <= centroidZ` in linear scan (or binary search).
  const sortedConfig = config.map(entry => entry
    ? { layers: [...entry.layers].sort((a, b) => a.from - b.from) }
    : { layers: [] });

  // Clone the colors array and build a lookup for new colors we might add.
  const colors: Color[] = off.colors.map(c => [c[0], c[1], c[2], c[3]] as Color);
  const colorKey = (c: Color) => `${c[0].toFixed(4)},${c[1].toFixed(4)},${c[2].toFixed(4)},${c[3].toFixed(4)}`;
  const colorIndexOf = new Map<string, number>();
  colors.forEach((c, i) => colorIndexOf.set(colorKey(c), i));

  const findOrAddColor = (hex: string): number => {
    const c = parseHexColor(hex);
    const k = colorKey(c);
    let idx = colorIndexOf.get(k);
    if (idx == null) {
      idx = colors.length;
      colors.push(c);
      colorIndexOf.set(k, idx);
    }
    return idx;
  };

  const faces: Face[] = new Array(off.faces.length);
  for (let i = 0; i < off.faces.length; i++) {
    const f = off.faces[i];
    const ci = faceToComponent[i];
    const entry = ci >= 0 ? sortedConfig[ci] : undefined;
    if (!entry || entry.layers.length === 0) {
      faces[i] = f;
      continue;
    }
    const va = off.vertices[f.vertices[0]];
    const vb = off.vertices[f.vertices[1]];
    const vc = off.vertices[f.vertices[2]];
    const centroidZ = (va.z + vb.z + vc.z) / 3;

    // Find the latest span whose `from` is <= centroidZ. Layers below the first
    // configured span retain their base color.
    let applicable: { from: number; color: string } | null = null;
    for (const span of entry.layers) {
      if (span.from <= centroidZ) applicable = span;
      else break;
    }
    if (applicable == null) {
      faces[i] = f;
    } else {
      faces[i] = { vertices: f.vertices, colorIndex: findOrAddColor(applicable.color) };
    }
  }

  return { vertices: off.vertices, faces, colors };
}
