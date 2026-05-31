// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useMemo } from 'react';
import { ModelContext } from './contexts.ts';

import { Dropdown } from 'primereact/dropdown';
import { Slider } from 'primereact/slider';
import { Checkbox } from 'primereact/checkbox';
import { InputNumber } from 'primereact/inputnumber';
import { InputText } from 'primereact/inputtext';
import { Fieldset } from 'primereact/fieldset';
import { Parameter } from '../state/customizer-types.ts';
import { Button } from 'primereact/button';

const SECTION_RE = /^\s*-{3,}\s*([A-Za-z][A-Za-z0-9 /&\-]*?)\s*-{3,}\s*$/;

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

/* ------------------------- BATTERIES ARRAY EDITOR -------------------------- */

type Battery = [string, number, number, number, number] | [string, number, number, number, number, boolean];

/**
 * Walks a SCAD source and finds `varName = [...]`, returning the
 * bracket-balanced array literal (or null). Skips string/comment content
 * so brackets inside comments or strings don't throw off counting.
 */
function extractArrayLiteral(source: string, varName: string): string | null {
  const re = new RegExp(`(^|[\\s\\n;])${varName}\\s*=\\s*`, 'm');
  const m = source.match(re);
  if (!m) return null;
  const start = (m.index ?? 0) + m[0].length;
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

function parseBatteries(source: string): Battery[] | null {
  const literal = extractArrayLiteral(source, 'batteries');
  if (!literal) return null;
  let s = literal
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '')
    .replace(/,(\s*[\]}])/g, '$1');
  try {
    const parsed = JSON.parse(s);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(row => Array.isArray(row) && row.length >= 5) as Battery[];
  } catch {
    return null;
  }
}

function BatteriesEditor() {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const source = model.source;
  const sourceDefault = useMemo(() => parseBatteries(source), [source]);
  const override = (state.params.vars ?? {}).batteries as Battery[] | undefined;
  const current: Battery[] = override ?? sourceDefault ?? [];

  if (!sourceDefault) return null;

  const setValue = (next: Battery[]) => model.setVar('batteries', next);

  const updateRow = (i: number, patch: Partial<{name: string; d: number; t: number; cols: number; rows: number; flat: boolean}>) => {
    const row = current[i];
    const name = patch.name  ?? row[0];
    const d    = patch.d     ?? row[1];
    const t    = patch.t     ?? row[2];
    const cols = patch.cols  ?? row[3];
    const rows = patch.rows  ?? row[4];
    const flat = patch.flat  ?? row[5] ?? false;
    const nextRow: Battery = flat ? [name, d, t, cols, rows, true] : [name, d, t, cols, rows];
    setValue(current.map((r, j) => (j === i ? nextRow : r)));
  };

  const addRow = () => {
    const next: Battery = ['NewCell', 20, 3, 1, 1];
    setValue([...current, next]);
  };

  const removeRow = (i: number) => setValue(current.filter((_, j) => j !== i));

  // "Reset to source" pushes the source-declared array back as the override.
  // Equivalent in effect to "no override" since the value matches the source.
  const resetToSource = () => sourceDefault && model.setVar('batteries', sourceDefault);
  const isOverridden = override !== undefined &&
    JSON.stringify(override) !== JSON.stringify(sourceDefault);

  return (
    <Fieldset
      legend="Batteries"
      toggleable
      style={{
        margin: '5px 10px 5px 10px',
        backgroundColor: 'var(--surface-panel-bg)',
      }}>
      <div style={{fontSize: 11, color: 'var(--surface-fg-faint)', marginBottom: 6}}>
        Each row defines one battery type. <code>D</code> = diameter (mm),
        <code> T</code> = thickness, <code>Cols × Rows</code> = total count,
        <code> Flat</code> = lie face-up (stacks vertically) instead of upright.
      </div>
      <div style={{display: 'grid', gridTemplateColumns: '1fr 60px 60px 50px 50px 40px 28px', gap: 4, alignItems: 'center', fontSize: 12}}>
        <div style={{fontWeight: 600, color: 'var(--surface-fg-strong)'}}>Name</div>
        <div style={{fontWeight: 600, color: 'var(--surface-fg-strong)', textAlign: 'right'}}>D</div>
        <div style={{fontWeight: 600, color: 'var(--surface-fg-strong)', textAlign: 'right'}}>T</div>
        <div style={{fontWeight: 600, color: 'var(--surface-fg-strong)', textAlign: 'right'}}>Cols</div>
        <div style={{fontWeight: 600, color: 'var(--surface-fg-strong)', textAlign: 'right'}}>Rows</div>
        <div style={{fontWeight: 600, color: 'var(--surface-fg-strong)', textAlign: 'center'}}>Flat</div>
        <div />

        {current.map((row, i) => (
          <React.Fragment key={i}>
            <InputText value={row[0]} onChange={e => updateRow(i, {name: e.target.value})} style={{padding: '2px 6px', fontSize: 12}} />
            <InputNumber value={row[1]} onValueChange={e => updateRow(i, {d: typeof e.value === 'number' ? e.value : 0})}
                         minFractionDigits={1} maxFractionDigits={2} inputStyle={{width: '100%', padding: '2px 6px', fontSize: 12, textAlign: 'right'}} />
            <InputNumber value={row[2]} onValueChange={e => updateRow(i, {t: typeof e.value === 'number' ? e.value : 0})}
                         minFractionDigits={1} maxFractionDigits={2} inputStyle={{width: '100%', padding: '2px 6px', fontSize: 12, textAlign: 'right'}} />
            <InputNumber value={row[3]} onValueChange={e => updateRow(i, {cols: typeof e.value === 'number' ? e.value : 1})}
                         showButtons={false} inputStyle={{width: '100%', padding: '2px 6px', fontSize: 12, textAlign: 'right'}} />
            <InputNumber value={row[4]} onValueChange={e => updateRow(i, {rows: typeof e.value === 'number' ? e.value : 1})}
                         showButtons={false} inputStyle={{width: '100%', padding: '2px 6px', fontSize: 12, textAlign: 'right'}} />
            <div style={{textAlign: 'center'}}>
              <Checkbox checked={Boolean(row[5])} onChange={e => updateRow(i, {flat: Boolean(e.checked)})} />
            </div>
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

/* ----------------------------- PARAMETER INPUT ----------------------------- */

export default function CustomizerPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;

  const handleChange = (name: string, value: any) => {
    model.setVar(name, value);
  };

  const groups = useMemo(() => regroupBySectionMarkers(state.parameterSet?.parameters ?? []),
                          [state.parameterSet]);
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
      <BatteriesEditor />
      {groups.map(({group, params}) => (
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
              handleChange={handleChange} />
          ))}
        </Fieldset>
      ))}
    </div>
  );
};

function ParameterInput({param, value, className, style, handleChange}: {param: Parameter, value: any, className?: string, style?: CSSProperties, handleChange: (key: string, value: any) => void}) {
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
              value={value || param.initial}
              options={param.options}
              onChange={(e) => handleChange(param.name, e.value)}
              optionLabel="name"
              optionValue="value"
            />
          )}
          {param.type === 'string' && param.options && (
            <Dropdown
              value={value || param.initial}
              options={param.options}
              onChange={(e) => handleChange(param.name, e.value)}
              optionLabel="name"
              optionValue="value"
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
              value={value || param.initial}
              showButtons
              size={5}
              onValueChange={(e) => handleChange(param.name, e.value)}
            />
          )}
          {param.type === 'string' && !param.options && (
            <InputText
              style={{flex: 1}}
              value={value || param.initial}
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
                  step={param.step}
                  onValueChange={(e) => {
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
