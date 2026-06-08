import type { LayerColorsConfig, LayerSpan } from '../state/app-state';

/**
 * Source-level layer-color config. Each object on its own comment line:
 *
 *   // @layer-colors object 0: 0.00=#ffffff 2.40=#22c55e 4.80=#ef4444
 *   // @layer-colors object 1: 0.00=#3b82f6
 *
 * Object indices match the order in `state.output.componentBboxes` (the same
 * "Object 1 / Object 2 / ..." order the panel shows). Numbers are millimetres,
 * colors are `#rgb` / `#rrggbb` / `#rrggbbaa`. Lines that don't match are
 * ignored; multiple lines for the same object are appended.
 */

const LINE_RE = /^[\t ]*\/\/\s*@layer-colors\s+object\s+(\d+)\s*:\s*(.+?)\s*$/gm;
const ENTRY_RE = /(-?\d+(?:\.\d+)?)\s*=\s*(#[0-9a-fA-F]{3,8})/g;

export function parseLayerColorsFromSource(source: string): LayerColorsConfig {
  const byIndex = new Map<number, LayerSpan[]>();
  LINE_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = LINE_RE.exec(source)) !== null) {
    const idx = parseInt(m[1], 10);
    if (!Number.isFinite(idx) || idx < 0) continue;
    const layers: LayerSpan[] = [];
    ENTRY_RE.lastIndex = 0;
    let em: RegExpExecArray | null;
    while ((em = ENTRY_RE.exec(m[2])) !== null) {
      layers.push({ from: parseFloat(em[1]), color: em[2].toLowerCase() });
    }
    if (layers.length > 0) {
      byIndex.set(idx, [...(byIndex.get(idx) ?? []), ...layers]);
    }
  }
  if (byIndex.size === 0) return [];
  const maxIdx = Math.max(...byIndex.keys());
  const out: LayerColorsConfig = [];
  for (let i = 0; i <= maxIdx; i++) {
    out.push({ layers: byIndex.get(i) ?? [] });
  }
  return out;
}

export function formatLayerColorsForSource(config: LayerColorsConfig): string {
  const lines: string[] = [];
  for (let i = 0; i < config.length; i++) {
    const layers = config[i]?.layers ?? [];
    if (layers.length === 0) continue;
    const sorted = [...layers].sort((a, b) => a.from - b.from);
    const entries = sorted.map(l => `${l.from.toFixed(2)}=${l.color.toLowerCase()}`).join(' ');
    lines.push(`// @layer-colors object ${i}: ${entries}`);
  }
  return lines.join('\n');
}

/** Strict deep equality. Order matters; sort upstream if you need order-agnostic compare. */
export function layerColorsEqual(a: LayerColorsConfig, b: LayerColorsConfig): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const la = a[i]?.layers ?? [];
    const lb = b[i]?.layers ?? [];
    if (la.length !== lb.length) return false;
    for (let j = 0; j < la.length; j++) {
      if (la[j].from !== lb[j].from) return false;
      if (la[j].color.toLowerCase() !== lb[j].color.toLowerCase()) return false;
    }
  }
  return true;
}
