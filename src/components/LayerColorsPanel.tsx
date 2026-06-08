import React, { CSSProperties, useContext, useMemo, useRef, useState } from 'react';
import { ModelContext } from './contexts';
import { Button } from 'primereact/button';
import { InputNumber } from 'primereact/inputnumber';
import { Fieldset } from 'primereact/fieldset';
import { Slider } from 'primereact/slider';
import { Dialog } from 'primereact/dialog';
import type { LayerSpan } from '../state/app-state';
import {
  formatLayerColorsForSource,
  layerColorsEqual,
  parseLayerColorsFromSource,
} from '../io/layer_colors_source';

const DEFAULT_PALETTE = ['#ffffff', '#22c55e', '#ef4444', '#3b82f6', '#f59e0b', '#a855f7', '#111827'];

function sortedByFrom(layers: LayerSpan[]): LayerSpan[] {
  return [...layers].sort((a, b) => a.from - b.from);
}

function sortedOriginalIndices(layers: LayerSpan[]): number[] {
  return layers.map((_, i) => i).sort((a, b) => layers[a].from - layers[b].from);
}

// A "base" layer is one pinned at the object's bottom; the panel surfaces it
// as a dedicated picker rather than a draggable threshold. Tiny epsilon so
// floating-point drift from drag rounding doesn't accidentally demote it.
const BASE_EPSILON = 0.005;
function findBaseLayerIndex(layers: LayerSpan[], zMin: number): number {
  let bestIdx = -1;
  for (let i = 0; i < layers.length; i++) {
    if (layers[i].from <= zMin + BASE_EPSILON) {
      if (bestIdx < 0 || layers[i].from < layers[bestIdx].from) bestIdx = i;
    }
  }
  return bestIdx;
}

function collectUsedColors(perObject: Array<{ layers: LayerSpan[] }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of perObject ?? []) {
    for (const l of entry?.layers ?? []) {
      const k = l.color.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(l.color);
      }
    }
  }
  return out;
}

export default function LayerColorsPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const components = state.output?.componentBboxes ?? [];
  // Source-declared defaults (`// @layer-colors object N: ...`) are used when
  // the user hasn't overridden anything via the panel.
  const sourceConfig = useMemo(() => parseLayerColorsFromSource(model.source), [model.source]);
  const userConfig = state.params.layerColors;
  const config = userConfig ?? sourceConfig;
  const hasUserOverride = userConfig !== undefined;
  const differsFromSource = hasUserOverride && !layerColorsEqual(userConfig, sourceConfig);
  const codeSnippet = useMemo(() => formatLayerColorsForSource(config), [config]);

  const [showCodeOpen, setShowCodeOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(codeSnippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore — user can still select+copy from the textarea */ }
  };

  const usedColors = useMemo(() => collectUsedColors(config), [config]);
  const palette = useMemo(() => {
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const c of [...usedColors, ...DEFAULT_PALETTE]) {
      const k = c.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        merged.push(c);
      }
    }
    return merged;
  }, [usedColors]);

  const objectsAvailable = components.length > 0;

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '80vh',
        overflow: 'auto',
        padding: '10px',
        gap: '8px',
        ...style,
      }}>
      {!objectsAvailable && (
        <div style={{padding: '20px', color: 'var(--surface-fg-faint)', textAlign: 'center', fontSize: 13}}>
          Render the model first (preview or full render). Once objects appear,
          you can configure layer-color thresholds per object here to simulate
          multi-color 3D printing.
        </div>
      )}
      {objectsAvailable && components.map((comp, idx) => (
        <ObjectLayers
          key={idx}
          index={idx}
          dims={comp.size}
          zMin={comp.min[2]}
          zMax={comp.max[2]}
          layers={config[idx]?.layers ?? []}
          palette={palette}
          onChange={(layers) => model.setLayerColors(idx, layers)}
        />
      ))}

      {objectsAvailable && (
        <div style={{
          display: 'flex',
          gap: 6,
          flexWrap: 'wrap',
          padding: '6px 4px 2px',
          borderTop: '1px dashed var(--surface-border)',
          marginTop: 4,
        }}>
          <Button
            label="Show code"
            icon="pi pi-code"
            size="small"
            text
            onClick={() => setShowCodeOpen(true)}
            tooltip="Paste this into your .scad file to embed the current layer colors"
            tooltipOptions={{ position: 'top' }}
          />
          {differsFromSource && (
            <Button
              label="Reset to source"
              icon="pi pi-refresh"
              size="small"
              text
              severity="secondary"
              onClick={() => model.resetLayerColorsToSource()}
              tooltip="Drop your edits and use the colors declared in the source"
              tooltipOptions={{ position: 'top' }}
            />
          )}
          {!hasUserOverride && sourceConfig.length > 0 && (
            <span style={{
              alignSelf: 'center',
              fontSize: 11,
              color: 'var(--surface-fg-faint)',
              marginLeft: 'auto',
            }}>
              Using source colors
            </span>
          )}
        </div>
      )}

      <Dialog
        header="Layer-colors source snippet"
        visible={showCodeOpen}
        modal
        onHide={() => setShowCodeOpen(false)}
        style={{ width: 'min(640px, 92vw)' }}
      >
        <div style={{ fontSize: 12, color: 'var(--surface-fg-faint)', marginBottom: 8, lineHeight: 1.55 }}>
          Paste these lines anywhere in your <code>.scad</code> file (top of the
          file is a good spot). When no overrides are set in the panel, HotSCAD
          will use these as the layer colors on every render.
        </div>
        <textarea
          readOnly
          value={codeSnippet || '// (no layer colors configured)'}
          style={{
            width: '100%',
            minHeight: 140,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            padding: 10,
            border: '1px solid var(--surface-border)',
            borderRadius: 4,
            background: 'var(--surface-row-bg)',
            color: 'var(--surface-fg-strong)',
            resize: 'vertical',
            whiteSpace: 'pre',
          }}
          onFocus={(e) => e.currentTarget.select()}
        />
        <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
          <Button
            label={copied ? 'Copied' : 'Copy'}
            icon={copied ? 'pi pi-check' : 'pi pi-copy'}
            size="small"
            disabled={!codeSnippet}
            onClick={copy}
          />
          <Button
            label="Close"
            icon="pi pi-times"
            size="small"
            text
            severity="secondary"
            onClick={() => setShowCodeOpen(false)}
          />
        </div>
      </Dialog>
    </div>
  );
}

function ColorSwatchRow({
  current, palette, onPick,
}: {
  current: string;
  palette: string[];
  onPick: (color: string) => void;
}) {
  return (
    <div style={{display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap'}}>
      {palette.map(c => {
        const active = c.toLowerCase() === current.toLowerCase();
        return (
          <button
            key={c}
            onClick={() => onPick(c)}
            title={c}
            style={{
              width: 18, height: 18,
              borderRadius: '50%',
              padding: 0,
              border: active ? '2px solid #111' : '1px solid rgba(0,0,0,0.25)',
              background: c,
              cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
            }}
          />
        );
      })}
    </div>
  );
}

/**
 * Vertical color preview. Bottom = zMin, top = zMax. Each layer paints from
 * its `from` up to the next layer's `from` (or zMax for the topmost).
 */
function VerticalPreview({zMin, zMax, layers, width, height}: {
  zMin: number; zMax: number; layers: LayerSpan[]; width: number; height: number;
}) {
  const total = zMax - zMin;
  const sorted = useMemo(() => sortedByFrom(layers), [layers]);
  return (
    <div style={{
      position: 'relative',
      width,
      height,
      background: '#e5e7eb',
      border: '1px solid #d1d5db',
      borderRadius: 3,
      overflow: 'hidden',
      flexShrink: 0,
    }}>
      {sorted.map((l, i) => {
        if (total <= 0) return null;
        const from = Math.max(zMin, Math.min(zMax, l.from));
        const to = i + 1 < sorted.length ? Math.max(zMin, Math.min(zMax, sorted[i + 1].from)) : zMax;
        const bottomPct = ((from - zMin) / total) * 100;
        const heightPct = Math.max(0, ((to - from) / total) * 100);
        return (
          <div key={i} style={{
            position: 'absolute',
            left: 0, right: 0,
            bottom: `${bottomPct}%`,
            height: `${heightPct}%`,
            background: l.color,
            borderTop: '1px solid rgba(0,0,0,0.12)',
            opacity: 0.9,
          }} title={`from ${l.from.toFixed(2)} mm`} />
        );
      })}
    </div>
  );
}

/**
 * Horizontal interactive slider. Each threshold has a draggable handle.
 * Dragging a handle adjusts that layer's `from` value, clamped between its
 * neighbors so handles can't cross.
 */
function HorizontalSlider({
  zMin, zMax, layers, onChange, hideHandleAt,
}: {
  zMin: number; zMax: number;
  layers: LayerSpan[];
  onChange: (next: LayerSpan[]) => void;
  /** Original-index of a layer whose drag handle should not be rendered (e.g. the base). */
  hideHandleAt?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const total = zMax - zMin || 1;
  const sortedIdx = useMemo(() => sortedOriginalIndices(layers), [layers]);

  const onHandleDown = (origIdx: number, sortedPos: number, e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const eps = total * 0.001;
    const lowerBound = sortedPos > 0 ? layers[sortedIdx[sortedPos - 1]].from + eps : zMin;
    const upperBound = sortedPos < sortedIdx.length - 1 ? layers[sortedIdx[sortedPos + 1]].from - eps : zMax;
    const onMove = (ev: PointerEvent) => {
      const x = ev.clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const z = zMin + ratio * total;
      const clamped = Math.max(lowerBound, Math.min(upperBound, z));
      const rounded = Math.round(clamped * 100) / 100;
      onChange(layers.map((l, i) => i === origIdx ? {...l, from: rounded} : l));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  return (
    <div ref={ref} style={{
      position: 'relative',
      flex: 1,
      height: 32,
      background: '#e5e7eb',
      border: '1px solid #d1d5db',
      borderRadius: 3,
      userSelect: 'none',
      touchAction: 'none',
    }}>
      {sortedIdx.map((origIdx, i) => {
        const l = layers[origIdx];
        const nextFrom = i + 1 < sortedIdx.length ? layers[sortedIdx[i + 1]].from : zMax;
        const left = ((l.from - zMin) / total) * 100;
        const width = Math.max(0, ((nextFrom - l.from) / total) * 100);
        return (
          <div key={`band-${origIdx}`} style={{
            position: 'absolute',
            left: `${left}%`,
            width: `${width}%`,
            top: 0, bottom: 0,
            background: l.color,
            opacity: 0.9,
          }} title={`${l.from.toFixed(2)} mm`} />
        );
      })}
      {sortedIdx.map((origIdx, i) => {
        if (origIdx === hideHandleAt) return null;
        const l = layers[origIdx];
        const left = ((l.from - zMin) / total) * 100;
        return (
          <div key={`handle-${origIdx}`}
            onPointerDown={(e) => onHandleDown(origIdx, i, e)}
            style={{
              position: 'absolute',
              left: `${left}%`,
              top: -2, bottom: -2,
              transform: 'translateX(-50%)',
              width: 14,
              cursor: 'ew-resize',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              touchAction: 'none',
            }}
            title={`Drag to adjust (${l.from.toFixed(2)} mm)`}
          >
            <div style={{
              width: 3,
              height: '100%',
              background: '#111',
              borderRadius: 2,
              boxShadow: '0 0 0 1px white, 0 0 0 2px rgba(0,0,0,0.15)',
            }} />
          </div>
        );
      })}
    </div>
  );
}

function ObjectLayers({
  index, dims, zMin, zMax, layers, palette, onChange,
}: {
  index: number;
  dims: [number, number, number];
  zMin: number;
  zMax: number;
  layers: LayerSpan[];
  palette: string[];
  onChange: (next: LayerSpan[]) => void;
}) {
  const fmt = (n: number) => n.toFixed(2);

  const baseIdx = findBaseLayerIndex(layers, zMin);
  const hasBase = baseIdx >= 0;
  const baseColor = hasBase ? layers[baseIdx].color : null;

  const addLayer = () => {
    // Adds a threshold (never a base — there's a separate picker for that).
    // Default at midpoint of the highest existing threshold (or zMin) and zMax.
    const startFrom = layers.length > 0
      ? Math.max(...layers.map(l => l.from))
      : zMin;
    let nextFrom = (startFrom + zMax) / 2;
    nextFrom = Math.max(zMin + 0.01, Math.min(zMax, nextFrom));
    nextFrom = Math.round(nextFrom * 100) / 100;
    const color = palette[layers.length % palette.length] ?? DEFAULT_PALETTE[0];
    onChange([...layers, { from: nextFrom, color }]);
  };

  const updateLayer = (i: number, patch: Partial<LayerSpan>) => {
    onChange(layers.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  };

  const removeLayer = (i: number) => {
    onChange(layers.filter((_, j) => j !== i));
  };

  const setBaseColor = (color: string) => {
    if (hasBase) {
      updateLayer(baseIdx, { color });
    } else {
      // Pin the new base layer at zMin. Prepended so it's clearly the bottom.
      onChange([{ from: zMin, color }, ...layers]);
    }
  };

  const clearBase = () => {
    if (hasBase) onChange(layers.filter((_, j) => j !== baseIdx));
  };

  // Indices to render in the threshold list — everything except the base.
  const thresholdIndices = layers
    .map((_, i) => i)
    .filter(i => i !== baseIdx);

  return (
    <Fieldset
      legend={`Object ${index + 1}  —  ${fmt(dims[0])} × ${fmt(dims[1])} × ${fmt(dims[2])} mm`}
      toggleable
      style={{ backgroundColor: 'var(--surface-panel-bg)' }}>
      <div style={{fontSize: 11, color: 'var(--surface-fg-faint)', marginBottom: 8}}>
        Z range: <code>{fmt(zMin)} – {fmt(zMax)} mm</code>. Drag handles below or
        adjust per-row to set thresholds.
      </div>

      {/* Base color: applies from the bottom of the object up to the first
          threshold. No draggable handle — it's pinned to zMin. */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexWrap: 'wrap',
        padding: '6px 8px',
        marginBottom: 10,
        background: 'var(--surface-row-bg)',
        border: '1px solid var(--surface-border)',
        borderRadius: 4,
        fontSize: 12,
      }}>
        <span style={{color: 'var(--surface-fg-muted)', fontWeight: 600}}>Base color</span>
        <input
          type="color"
          value={baseColor ?? '#cccccc'}
          onChange={(e) => setBaseColor(e.target.value)}
          style={{width: 32, height: 28, border: '1px solid #ccc', borderRadius: 3, padding: 0, cursor: 'pointer'}}
          title="Pick base color (applied from the bottom of the object)"
        />
        {!hasBase && (
          <span style={{color: 'var(--surface-fg-faint)', fontSize: 11}}>
            (using model default)
          </span>
        )}
        <div style={{flex: 1, minWidth: 0}}>
          <ColorSwatchRow current={baseColor ?? ''} palette={palette} onPick={setBaseColor} />
        </div>
        {hasBase && (
          <Button
            icon="pi pi-times"
            text
            severity="danger"
            size="small"
            tooltip="Clear base color (fall back to model default)"
            tooltipOptions={{ position: 'left' }}
            onClick={clearBase}
          />
        )}
      </div>

      {/* Two-column area: narrow vertical preview + horizontal interactive slider */}
      <div style={{display: 'flex', gap: 8, alignItems: 'stretch', marginBottom: 10}}>
        <VerticalPreview zMin={zMin} zMax={zMax} layers={layers} width={100} height={140} />
        <div style={{display: 'flex', flexDirection: 'column', justifyContent: 'space-between', flex: 1, minWidth: 0}}>
          <div style={{fontSize: 10, color: 'var(--surface-fg-muted)', marginBottom: 4}}>Thresholds (drag to adjust):</div>
          <HorizontalSlider
            zMin={zMin} zMax={zMax} layers={layers} onChange={onChange}
            hideHandleAt={hasBase ? baseIdx : undefined}
          />
          <div style={{display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--surface-fg-muted)', marginTop: 4}}>
            <span>{fmt(zMin)} mm</span>
            <span>{fmt(zMax)} mm</span>
          </div>
        </div>
      </div>

      {/* Layer rows */}
      <div style={{display: 'flex', flexDirection: 'column', gap: 8}}>
        {thresholdIndices.length === 0 && (
          <div style={{color: 'var(--surface-fg-faint)', fontSize: 12, fontStyle: 'italic'}}>
            No layer thresholds set. Click "Add layer" to color a range above the base.
          </div>
        )}
        {layers.map((l, i) => {
          if (i === baseIdx) return null;
          return (
          <div key={i} style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 6,
            padding: '6px 8px',
            background: 'var(--surface-row-bg)',
            border: '1px solid var(--surface-border)',
            borderRadius: 4,
          }}>
            <div style={{display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, flexWrap: 'wrap'}}>
              <span style={{color: 'var(--surface-fg-muted)'}}>From</span>
              <InputNumber
                value={l.from}
                onValueChange={(e) => updateLayer(i, {from: typeof e.value === 'number' ? e.value : 0})}
                minFractionDigits={2}
                maxFractionDigits={3}
                step={0.2}
                showButtons
                buttonLayout="horizontal"
                decrementButtonClassName="p-button-secondary"
                incrementButtonClassName="p-button-secondary"
                inputStyle={{width: 70, textAlign: 'right'}}
              />
              <span style={{color: 'var(--surface-fg-muted)', marginLeft: -2}}>mm</span>
              <input
                type="color"
                value={l.color}
                onChange={(e) => updateLayer(i, {color: e.target.value})}
                style={{width: 32, height: 28, border: '1px solid #ccc', borderRadius: 3, padding: 0, cursor: 'pointer'}}
                title="Pick custom color"
              />
              <div style={{flex: 1}} />
              <Button
                icon="pi pi-times"
                text
                severity="danger"
                size="small"
                tooltip="Remove this threshold"
                tooltipOptions={{ position: 'left' }}
                onClick={() => removeLayer(i)}
              />
            </div>
            {/* Per-row slider for finer drag control. */}
            <div style={{paddingLeft: 4, paddingRight: 4}}>
              <Slider
                value={l.from}
                min={zMin}
                max={zMax}
                step={0.05}
                onChange={(e) => updateLayer(i, {from: typeof e.value === 'number' ? Math.round(e.value * 100) / 100 : 0})}
              />
            </div>
            {/* Palette: click to reuse a color already in the project. */}
            <div style={{display: 'flex', alignItems: 'center', gap: 6}}>
              <ColorSwatchRow current={l.color} palette={palette} onPick={(c) => updateLayer(i, {color: c})} />
            </div>
          </div>
          );
        })}
      </div>

      <div style={{marginTop: 8, display: 'flex', gap: 6}}>
        <Button label="Add layer" icon="pi pi-plus" size="small" onClick={addLayer} />
        {layers.length > 0 && (
          <Button label="Clear" icon="pi pi-trash" size="small" severity="secondary" text onClick={() => onChange([])} />
        )}
      </div>
    </Fieldset>
  );
}
