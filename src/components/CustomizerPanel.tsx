// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useEffect, useMemo, useState } from 'react';
import { ModelContext } from './contexts.ts';

import { Dropdown } from 'primereact/dropdown';
import { Slider } from 'primereact/slider';
import { Checkbox } from 'primereact/checkbox';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Fieldset } from 'primereact/fieldset';
import { Parameter, ParameterOption } from '../state/customizer-types.ts';
import { Button } from 'primereact/button';
import { confirmDialog } from 'primereact/confirmdialog';

const SECTION_RE = /^\s*-{3,}\s*([A-Za-z][A-Za-z0-9 /&\-]*?)\s*-{3,}\s*$/;

// Fonts shipped in public/libraries/fonts.zip (see libs-config.json `fonts`).
// Each entry maps a friendly display name to the exact OpenSCAD font string.
const BUNDLED_FONTS: ParameterOption[] = [
  { name: 'Inter Black',                  value: 'Inter:style=Black' },
  { name: 'Inter SemiBold',               value: 'Inter:style=SemiBold' },
  { name: 'Liberation Sans',              value: 'Liberation Sans' },
  { name: 'Liberation Sans Bold',         value: 'Liberation Sans:style=Bold' },
  { name: 'Liberation Sans Italic',       value: 'Liberation Sans:style=Italic' },
  { name: 'Liberation Sans Bold Italic',  value: 'Liberation Sans:style=Bold Italic' },
  { name: 'Liberation Serif',             value: 'Liberation Serif' },
  { name: 'Liberation Serif Bold',        value: 'Liberation Serif:style=Bold' },
  { name: 'Liberation Serif Italic',      value: 'Liberation Serif:style=Italic' },
  { name: 'Liberation Serif Bold Italic', value: 'Liberation Serif:style=Bold Italic' },
  { name: 'Liberation Mono',              value: 'Liberation Mono' },
  { name: 'Liberation Mono Bold',         value: 'Liberation Mono:style=Bold' },
  { name: 'Liberation Mono Italic',       value: 'Liberation Mono:style=Italic' },
  { name: 'Liberation Mono Bold Italic',  value: 'Liberation Mono:style=Bold Italic' },
  { name: 'Noto Sans',                    value: 'Noto Sans' },
  { name: 'Noto Sans Bold',               value: 'Noto Sans:style=Bold' },
  { name: 'Noto Sans Italic',             value: 'Noto Sans:style=Italic' },
];

const FONT_PARAM_RE = /(^|_)font(_name)?$/i;

export function isFontParam(name: string): boolean {
  return FONT_PARAM_RE.test(name);
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
}

/**
 * Detects section banner lines in parameter captions (OpenSCAD-style
 * `// ----- NAME -----`) and re-groups the parameter list accordingly.
 * Each section-banner caption becomes a new group header; the banner is
 * stripped from the caption so it doesn't show as descriptive text.
 *
 * If a param has an explicit OpenSCAD `/* [Group] *​/` group set, that wins.
 */
function regroupBySectionMarkers(params: Parameter[]): Array<{ group: string; params: Parameter[] }> {
  const out: Array<{ group: string; params: Parameter[] }> = [];
  // Detect whether the source already uses explicit OpenSCAD groups.
  const distinctGroups = new Set(params.map(p => p.group));
  const usingExplicitGroups = distinctGroups.size > 1 || !distinctGroups.has('Parameters');

  let current: { group: string; params: Parameter[] } | null = null;

  for (const p of params) {
    let cleanedCaption = p.caption ?? '';
    let sectionFromBanner: string | null = null;

    if (!usingExplicitGroups) {
      const lines = cleanedCaption.split('\n');
      const kept: string[] = [];
      for (const line of lines) {
        const m = line.match(SECTION_RE);
        if (m) sectionFromBanner = titleCase(m[1].trim());
        else if (line.trim().length > 0) kept.push(line);
      }
      cleanedCaption = kept.join('\n').trim();
    }

    const groupName: string = usingExplicitGroups
      ? p.group
      : (sectionFromBanner ?? (current ? current.group : 'Parameters'));
    if (!current || current.group !== groupName) {
      current = { group: groupName, params: [] };
      out.push(current);
    }
    current.params.push({ ...p, caption: cleanedCaption });
  }

  return out;
}

/* --------------------- GENERIC ARRAY-OF-ARRAYS EDITOR ---------------------- */
/**
 * Any top-level `name = [[...], [...], ...]` declaration in the source becomes
 * a row/column table editor in the Customize panel, with cell types inferred
 * from the data (string → text input, number → number input, boolean →
 * checkbox).
 *
 * Documentation lives in the source, not in this component:
 *   - `//` lines immediately above the declaration become the help text.
 *   - A line like `// @columns Name, D, T, Cols, Rows, Flat` defines column
 *     headers. Without it, headers fall back to "Col 1, Col 2, ...".
 *
 * Plain numeric arrays-of-arrays (polygons, point lists) are NOT picked up —
 * the heuristic requires at least one column to be a string or boolean.
 */

type CellType = 'string' | 'number' | 'boolean';
type ArrayCell = string | number | boolean;
type ArrayRow = ArrayCell[];

type ArrayDecl = {
  name: string;
  description: string;
  headers: string[];
  types: CellType[];
  defaultRows: ArrayRow[];
};

/**
 * Walks a SCAD source and finds the array literal that starts at `start`
 * (the index of the opening `[`). Returns the bracket-balanced slice ending
 * at the matching `]`, or null. Skips string/comment content.
 */
function readArrayLiteralAt(source: string, start: number): string | null {
  if (source[start] !== '[') return null;
  let i = start, depth = 0;
  while (i < source.length) {
    const c = source[i];
    if (c === '"') {
      i++;
      while (i < source.length && source[i] !== '"') {
        if (source[i] === '\\') i++;
        i++;
      }
    } else if (c === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
    } else if (c === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length - 1 && !(source[i] === '*' && source[i + 1] === '/')) i++;
      i += 2;
      continue;
    } else if (c === '[') {
      depth++;
    } else if (c === ']') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
    i++;
  }
  return null;
}

function tryParseRows(literal: string): ArrayRow[] | null {
  const stripped = literal
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/,(\s*[\]}])/g, '$1');
  try {
    const parsed = JSON.parse(stripped);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    if (!parsed.every(row => Array.isArray(row) && row.every(cell =>
      typeof cell === 'string' || typeof cell === 'number' || typeof cell === 'boolean'
    ))) return null;
    return parsed as ArrayRow[];
  } catch {
    return null;
  }
}

function inferColumnTypes(rows: ArrayRow[]): CellType[] {
  const maxCols = rows.reduce((m, r) => Math.max(m, r.length), 0);
  const types: CellType[] = [];
  for (let c = 0; c < maxCols; c++) {
    const seen = new Set<CellType>();
    for (const row of rows) {
      if (c < row.length) seen.add(typeof row[c] as CellType);
    }
    // Prefer the most permissive type: any string wins; otherwise boolean only
    // if every observation is boolean; otherwise number.
    if (seen.has('string')) types.push('string');
    else if (seen.size === 1 && seen.has('boolean')) types.push('boolean');
    else types.push('number');
  }
  return types;
}

/**
 * Collects the contiguous block of `//` comment lines immediately above the
 * given character position, in source order. A blank line breaks the block.
 */
function collectCommentsAbove(source: string, position: number): string[] {
  const before = source.slice(0, position).split('\n');
  // The last entry is the partial line containing the declaration; skip it.
  const out: string[] = [];
  for (let i = before.length - 2; i >= 0; i--) {
    const t = before[i].trim();
    if (t === '') break;
    if (!t.startsWith('//')) break;
    out.unshift(t.replace(/^\/\/\s?/, ''));
  }
  return out;
}

function parseCommentBlock(lines: string[]): { description: string; headers: string[] | null } {
  let headers: string[] | null = null;
  const descParts: string[] = [];
  for (const line of lines) {
    const m = line.match(/^@columns?\s+(.+)$/i);
    if (m) {
      headers = m[1].split(/\s*,\s*/).map(s => s.trim()).filter(Boolean);
    } else {
      descParts.push(line);
    }
  }
  // Join with \n so an empty `//` line becomes a visible paragraph break
  // (paired with `whiteSpace: pre-wrap` on the rendered <div>).
  return { description: descParts.join('\n').trim(), headers };
}

function findArrayDeclarations(source: string): ArrayDecl[] {
  const out: ArrayDecl[] = [];
  const seen = new Set<string>();
  // Top-level "name = [" — only at start of line (with whitespace) to avoid
  // matching array literals inside expressions or function calls.
  const re = /^[\t ]*([A-Za-z_][\w]*)\s*=\s*\[/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) {
    const name = m[1];
    if (seen.has(name)) continue;
    const bracketIdx = (m.index ?? 0) + m[0].length - 1; // position of the `[`
    const literal = readArrayLiteralAt(source, bracketIdx);
    if (!literal) continue;
    const rows = tryParseRows(literal);
    if (!rows) continue;
    const types = inferColumnTypes(rows);
    // Skip pure numeric matrices (polygons, point lists, etc.).
    if (types.every(t => t === 'number')) continue;
    const comments = collectCommentsAbove(source, m.index ?? 0);
    const { description, headers: parsedHeaders } = parseCommentBlock(comments);
    const headers = parsedHeaders ?? rows[0].map((_, i) => `Col ${i + 1}`);
    out.push({ name, description, headers, types, defaultRows: rows });
    seen.add(name);
  }
  return out;
}

function defaultForType(t: CellType): ArrayCell {
  if (t === 'string') return '';
  if (t === 'boolean') return false;
  return 0;
}

function gridTemplate(types: CellType[]): string {
  // First string column gets 1fr; remaining strings get 1fr too; numbers fixed
  // 64px; booleans fixed 44px; trailing 28px delete button.
  const cols = types.map(t => {
    if (t === 'string') return 'minmax(80px, 1fr)';
    if (t === 'boolean') return '44px';
    return '64px';
  });
  return [...cols, '28px'].join(' ');
}

function ArrayDeclEditor({ decl }: { decl: ArrayDecl }) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const override = (state.params.vars ?? {})[decl.name] as ArrayRow[] | undefined;
  const current: ArrayRow[] = override ?? decl.defaultRows;

  const setValue = (next: ArrayRow[]) => model.setVar(decl.name, next);

  const updateCell = (rowIdx: number, colIdx: number, value: ArrayCell) => {
    const next = current.map((row, ri) => {
      if (ri !== rowIdx) return row;
      // Trim trailing falsy-for-default cells so 6-col + 5-col rows can coexist
      // (the original batteries convention: omit trailing `false` flat flag).
      const filled: ArrayRow = decl.types.map((t, ci) => {
        if (ci === colIdx) return value;
        if (ci < row.length) return row[ci];
        return defaultForType(t);
      });
      let end = filled.length;
      while (end > 0) {
        const ci = end - 1;
        const t = decl.types[ci];
        const v = filled[ci];
        const isDefault =
          (t === 'string'  && v === '') ||
          (t === 'boolean' && v === false) ||
          (t === 'number'  && v === 0);
        if (!isDefault) break;
        end--;
      }
      return filled.slice(0, end);
    });
    setValue(next);
  };

  const addRow = () => {
    const blank: ArrayRow = decl.types.map(defaultForType);
    setValue([...current, blank]);
  };
  const removeRow = (i: number) => setValue(current.filter((_, j) => j !== i));
  const resetToSource = () => model.setVar(decl.name, decl.defaultRows);
  const isOverridden = override !== undefined &&
    JSON.stringify(override) !== JSON.stringify(decl.defaultRows);

  const renderCell = (rowIdx: number, colIdx: number, row: ArrayRow) => {
    const t = decl.types[colIdx];
    const raw = colIdx < row.length ? row[colIdx] : defaultForType(t);
    if (t === 'string') {
      return (
        <InputText
          value={String(raw)}
          onChange={e => updateCell(rowIdx, colIdx, e.target.value)}
          style={{padding: '2px 6px', fontSize: 12}}
        />
      );
    }
    if (t === 'boolean') {
      return (
        <div style={{textAlign: 'center'}}>
          <Checkbox
            checked={Boolean(raw)}
            onChange={e => updateCell(rowIdx, colIdx, Boolean(e.checked))}
          />
        </div>
      );
    }
    return (
      <InputNumber
        value={typeof raw === 'number' ? raw : 0}
        onValueChange={e => updateCell(rowIdx, colIdx, typeof e.value === 'number' ? e.value : 0)}
        minFractionDigits={Number.isInteger(raw) ? 0 : 1}
        maxFractionDigits={3}
        inputStyle={{width: '100%', padding: '2px 6px', fontSize: 12, textAlign: 'right'}}
      />
    );
  };

  return (
    <Fieldset
      legend={titleCase(decl.name)}
      toggleable
      style={{
        margin: '5px 10px 5px 10px',
        backgroundColor: 'var(--surface-panel-bg)',
      }}>
      {decl.description && (
        <div style={{fontSize: 11, color: 'var(--surface-fg-faint)', marginBottom: 6, whiteSpace: 'pre-wrap'}}>
          {decl.description}
        </div>
      )}
      <div style={{display: 'grid', gridTemplateColumns: gridTemplate(decl.types), gap: 4, alignItems: 'center', fontSize: 12}}>
        {decl.headers.map((h, i) => (
          <div key={`h-${i}`} style={{
            fontWeight: 600,
            color: 'var(--surface-fg-strong)',
            textAlign: decl.types[i] === 'string'
              ? 'left'
              : decl.types[i] === 'boolean'
                ? 'center'
                : 'right',
          }}>{h}</div>
        ))}
        <div />

        {current.map((row, i) => (
          <React.Fragment key={i}>
            {decl.types.map((_, c) => (
              <React.Fragment key={c}>{renderCell(i, c, row)}</React.Fragment>
            ))}
            <Button icon="pi pi-times" text severity="danger" size="small" onClick={() => removeRow(i)} tooltip="Remove" tooltipOptions={{position: 'left'}} />
          </React.Fragment>
        ))}
      </div>
      <div style={{display: 'flex', gap: 6, marginTop: 8}}>
        <Button label="Add row" icon="pi pi-plus" size="small" onClick={addRow} />
        {isOverridden && (
          <Button label="Reset to source" icon="pi pi-refresh" text size="small" severity="secondary" onClick={resetToSource}
                  tooltip="Drop the override and use the array as declared in the source"
                  tooltipOptions={{position: 'right'}} />
        )}
      </div>
    </Fieldset>
  );
}

function ArrayEditors() {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const source = model.source;
  const decls = useMemo(() => findArrayDeclarations(source), [source]);
  if (decls.length === 0) return null;
  return <>{decls.map(d => <ArrayDeclEditor key={d.name} decl={d} />)}</>;
}

/* ----------------------------- PARAMETER INPUT ----------------------------- */

export default function CustomizerPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;

  const handleChange = (name: string, value: any) => {
    // PrimeReact InputNumber emits null for intermediate/invalid input
    // (lone "-", cleared field). Persisting null pollutes state.params.vars
    // and breaks deep-mutate traversal.
    if (value === null) return;
    model.setVar(name, value);
  };

  // Shift-held → fine-grained 0.1 step on number inputs (spinner buttons +
  // arrow keys). Reading window keydown so the modifier applies even before
  // the user has focused an input.
  const [shiftHeld, setShiftHeld] = useState(false);
  useEffect(() => {
    const kd = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(true); };
    const ku = (e: KeyboardEvent) => { if (e.key === 'Shift') setShiftHeld(false); };
    const blur = () => setShiftHeld(false);
    window.addEventListener('keydown', kd);
    window.addEventListener('keyup', ku);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', kd);
      window.removeEventListener('keyup', ku);
      window.removeEventListener('blur', blur);
    };
  }, []);

  const groups = useMemo(
    () => regroupBySectionMarkers(state.parameterSet?.parameters ?? []),
    [state.parameterSet],
  );

  // Names of params whose current value differs from the source-declared
  // initial. `state.params.vars` may contain entries that equal the initial
  // (e.g. after a per-param "revert to source"), so key presence isn't enough.
  const overriddenNames = useMemo(() => {
    const out = new Set<string>();
    const vars = state.params.vars ?? {};
    for (const p of state.parameterSet?.parameters ?? []) {
      if (!(p.name in vars)) continue;
      if (JSON.stringify(vars[p.name]) !== JSON.stringify(p.initial)) out.add(p.name);
    }
    return out;
  }, [state.parameterSet, state.params.vars]);
  const overrideCount = overriddenNames.size;

  const showOnlyOverridden = !!state.view.showOnlyOverridden;

  // If the user toggled "Show customized" on, then reverted everything, the
  // panel would otherwise sit empty until they noticed and unchecked it. Auto-
  // clear in that case so they don't get stuck staring at a blank panel.
  useEffect(() => {
    if (showOnlyOverridden && overrideCount === 0) {
      model.mutate(s => { s.view.showOnlyOverridden = false; });
    }
  }, [showOnlyOverridden, overrideCount, model]);

  // Quick text filter on parameter name. Lives in component state (not in
  // model.view) because it's transient and per-mount: a search you type while
  // hunting for a knob shouldn't persist across reloads or follow you into the
  // URL fragment.
  const [filter, setFilter] = useState('');
  const filterTerm = filter.trim().toLowerCase();
  const filterActive = filterTerm.length > 0;

  // When the filter matches anything, we drop group headings entirely and
  // render a flat list — group names rarely line up with what the user is
  // typing, so showing them is noise. `flatFilteredParams` is null when no
  // filter is in effect (UI falls back to the grouped layout).
  const flatFilteredParams = useMemo(() => {
    if (!filterActive) return null;
    const out: Parameter[] = [];
    for (const g of groups) {
      for (const p of g.params) {
        if (!p.name.toLowerCase().includes(filterTerm)) continue;
        if (showOnlyOverridden && !overriddenNames.has(p.name)) continue;
        out.push(p);
      }
    }
    return out;
  }, [filterActive, filterTerm, groups, showOnlyOverridden, overriddenNames]);

  const visibleGroups = useMemo(() => {
    if (!showOnlyOverridden) return groups;
    return groups
      .map(g => ({ group: g.group, params: g.params.filter(p => overriddenNames.has(p.name)) }))
      .filter(g => g.params.length > 0);
  }, [groups, showOnlyOverridden, overriddenNames]);

  const revertAll = () => {
    if (overrideCount === 0) return;
    confirmDialog({
      message: `Revert ${overrideCount} customized value${overrideCount === 1 ? '' : 's'} to the defaults from the source?`,
      header: 'Revert all values',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Revert all',
      rejectLabel: 'Cancel',
      accept: () => {
        model.mutate(s => { s.params.vars = {}; });
        model.render({isPreview: true, now: false});
      },
    });
  };

  const collapsedTabSet = new Set(state.view.collapsedCustomizerTabs ?? []);
  const setTabOpen = (name: string, open: boolean) => {
    if (open) {
      collapsedTabSet.delete(name);
    } else {
      collapsedTabSet.add(name)
    }
    model.mutate(s => s.view.collapsedCustomizerTabs = Array.from(collapsedTabSet));
  }

  return (
    <div
        className={className}
        style={{
          display: 'flex',
          flexDirection: 'column',
          maxHeight: '80vh',
          overflow: 'scroll',
          ...style,
          bottom: 'unset',
        }}>
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px 0 10px',
      }}>
        <label
          title="Hide parameters whose value matches the source default"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            fontSize: 12, color: 'var(--surface-fg-muted)',
            cursor: overrideCount === 0 ? 'not-allowed' : 'pointer',
            opacity: overrideCount === 0 ? 0.5 : 1,
            userSelect: 'none',
            whiteSpace: 'nowrap',
          }}>
          <Checkbox
            inputId="show-only-customized"
            checked={showOnlyOverridden}
            disabled={overrideCount === 0}
            onChange={(e) => model.mutate(s => { s.view.showOnlyOverridden = !!e.checked; })}
          />
          Show customized
          {overrideCount > 0 && (
            <span style={{
              fontSize: 11, color: 'var(--surface-fg-faint)',
              fontVariantNumeric: 'tabular-nums',
            }}>
              ({overrideCount})
            </span>
          )}
        </label>
        <div style={{
          position: 'relative',
          flex: '1 1 160px',
          minWidth: 140,
        }}>
          <i
            className="pi pi-search"
            style={{
              position: 'absolute',
              left: 10, top: '50%', transform: 'translateY(-50%)',
              fontSize: 12, color: 'var(--surface-fg-faint)',
              pointerEvents: 'none',
            }}
          />
          <InputText
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter parameters"
            style={{
              width: '100%',
              paddingLeft: 28,
              paddingRight: filter ? 28 : 8,
              fontSize: 13,
            }}
          />
          {filter && (
            <Button
              icon="pi pi-times"
              text
              size="small"
              onClick={() => setFilter('')}
              style={{
                position: 'absolute',
                right: 2, top: '50%', transform: 'translateY(-50%)',
                width: 24, height: 24, padding: 0,
              }}
              tooltip="Clear filter"
              tooltipOptions={{position: 'left'}}
            />
          )}
        </div>
        <Button
          label="Revert"
          icon="pi pi-refresh"
          size="small"
          severity="secondary"
          text
          disabled={overrideCount === 0}
          onClick={revertAll}
          tooltip={overrideCount === 0
            ? 'No customized values'
            : `Revert ${overrideCount} customized value${overrideCount === 1 ? '' : 's'} to source defaults`}
          tooltipOptions={{position: 'left', showOnDisabled: true}}
        />
      </div>
      {!filterActive && <ArrayEditors />}
      {flatFilteredParams !== null ? (
        flatFilteredParams.length === 0 ? (
          <div style={{
            margin: '10px',
            padding: '20px 10px',
            textAlign: 'center',
            color: 'var(--surface-fg-faint)',
            fontSize: 13,
          }}>
            No parameters match "{filter}".
          </div>
        ) : (
          <div style={{margin: '5px 10px 5px 10px'}}>
            {flatFilteredParams.map((param) => (
              <ParameterInput
                key={param.name}
                value={(state.params.vars ?? {})[param.name]}
                param={param}
                shiftHeld={shiftHeld}
                handleChange={handleChange} />
            ))}
          </div>
        )
      ) : (
        visibleGroups.map(({group, params}) => (
          <Fieldset
              style={{
                margin: '5px 10px 5px 10px',
                backgroundColor: 'var(--surface-card-bg)',
              }}
              onCollapse={() => setTabOpen(group, false)}
              onExpand={() => setTabOpen(group, true)}
              collapsed={collapsedTabSet.has(group)}
              key={group}
              legend={group}
              toggleable={true}>
            {params.map((param) => (
              <ParameterInput
                key={param.name}
                value={(state.params.vars ?? {})[param.name]}
                param={param}
                shiftHeld={shiftHeld}
                handleChange={handleChange} />
            ))}
          </Fieldset>
        ))
      )}
    </div>
  );
};

function ParameterInput({param, value, className, style, shiftHeld, handleChange}: {param: Parameter, value: any, className?: string, style?: CSSProperties, shiftHeld?: boolean, handleChange: (key: string, value: any) => void}) {
  // String params named like `*font` (or `*font_name`) get the bundled-font
  // dropdown auto-injected when the SCAD source didn't already supply options.
  const fontInjected = param.type === 'string' && !(param as any).options && isFontParam(param.name);
  const stringOptions: ParameterOption[] | undefined =
    param.type === 'string'
      ? ((param as any).options ?? (fontInjected ? BUNDLED_FONTS : undefined))
      : undefined;

  return (
    <div
      style={{
        flex: 1,
        ...style,
        display: 'flex',
        flexDirection: 'column',
      }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          margin: '10px -10px 10px 5px',
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
          }}>
          <label><b>{param.name}</b></label>
          {param.caption && <div style={{fontSize: 11, color: 'var(--surface-fg-faint)', whiteSpace: 'pre-wrap'}}>{param.caption}</div>}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
          {param.type === 'number' && 'options' in param && (
            <Dropdown
              style={{flex: 1}}
              value={value ?? param.initial}
              options={param.options}
              onChange={(e) => handleChange(param.name, e.value)}
              optionLabel="name"
              optionValue="value"
            />
          )}
          {param.type === 'string' && stringOptions && (
            <Dropdown
              style={{flex: 1}}
              value={value ?? param.initial}
              options={stringOptions}
              onChange={(e) => handleChange(param.name, e.value)}
              optionLabel="name"
              optionValue="value"
              editable={fontInjected}
              filter={stringOptions.length > 8}
            />
          )}
          {param.type === 'boolean' && (
            <Checkbox
              checked={value ?? param.initial}
              onChange={(e) => handleChange(param.name, e.checked)}
            />
          )}
          {!Array.isArray(param.initial) && param.type === 'number' && !('options' in param) && (
            <InputNumber
              value={value ?? param.initial}
              showButtons
              size={5}
              step={shiftHeld ? 0.1 : ((param as any).step ?? 1)}
              minFractionDigits={0}
              maxFractionDigits={6}
              useGrouping={false}
              onValueChange={(e) => handleChange(param.name, e.value)}
            />
          )}
          {param.type === 'string' && !stringOptions && (
            <InputText
              style={{flex: 1}}
              value={value ?? param.initial}
              onChange={(e) => handleChange(param.name, e.target.value)}
            />
          )}
          {Array.isArray(param.initial) && 'min' in param && (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'row',
            }}>
              {param.initial.map((_, index) => (
                <InputNumber
                  style={{flex: 1}}
                  key={index}
                  value={value?.[index] ?? (param.initial as any)[index]}
                  min={param.min}
                  max={param.max}
                  showButtons
                  size={5}
                  step={shiftHeld ? 0.1 : param.step}
                  minFractionDigits={0}
                  maxFractionDigits={6}
                  useGrouping={false}
                  onValueChange={(e) => {
                    if (e.value === null) return;
                    const newArray = [...(value ?? param.initial)];
                    newArray[index] = e.value;
                    handleChange(param.name, newArray);
                  }}
                />
              ))}
            </div>
          )}
          <Button
            onClick={() => handleChange(param.name, param.initial)}
            style={{
              marginRight: '0',
              visibility: value === undefined || (JSON.stringify(value) === JSON.stringify(param.initial)) ? 'hidden' : 'visible',
            }}
            tooltipOptions={{position: 'left'}}
            icon='pi pi-refresh'
            className='p-button-text'/>
        </div>
      </div>
      {!Array.isArray(param.initial) && param.type === 'number' && param.min !== undefined && (
        <Slider
          style={{
            flex: 1,
            minHeight: '5px',
            margin: '5px 40px 5px 5px',
          }}
          value={value || param.initial}
          min={param.min}
          max={param.max}
          step={param.step}
          onChange={(e) => handleChange(param.name, e.value)}
        />
      )}
    </div>
  );
}
