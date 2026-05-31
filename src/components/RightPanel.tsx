import React, { CSSProperties, useContext } from 'react';
import { ModelContext } from './contexts';
import CustomizerPanel from './CustomizerPanel';
import LayerColorsPanel from './LayerColorsPanel';

/**
 * Hosts the right-column content with a tab strip switching between
 * the customizer (parameter sliders) and the layer-colors editor.
 * Both occupy the same panel slot and are mutually exclusive.
 */
export default function RightPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const tab = state.view.rightTab ?? 'customize';
  const setTab = (t: 'customize' | 'layerColors') =>
    model.mutate(s => { s.view.rightTab = t; });

  const tabButton = (id: 'customize' | 'layerColors', label: string, icon: string) => {
    const active = tab === id;
    return (
      <button
        onClick={() => setTab(id)}
        style={{
          flex: 1,
          padding: '8px 12px',
          background: active ? 'var(--tab-active-bg)' : 'var(--tab-inactive-bg)',
          border: 'none',
          borderBottom: active ? '2px solid var(--tab-active-underline)' : '2px solid transparent',
          font: '600 13px/1 Helvetica, Arial, sans-serif',
          color: active ? 'var(--tab-active-fg)' : 'var(--tab-inactive-fg)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
        }}
      >
        <i className={icon} style={{fontSize: 13}} />
        {label}
      </button>
    );
  };

  return (
    <div
      className={className}
      style={{
        display: 'flex',
        flexDirection: 'column',
        ...style,
      }}>
      <div style={{display: 'flex', borderBottom: '1px solid var(--surface-border)', flexShrink: 0}}>
        {tabButton('customize',   'Customize',    'pi pi-sliders-h')}
        {tabButton('layerColors', 'Layer Colors', 'pi pi-palette')}
      </div>
      <div style={{flex: 1, minHeight: 0, overflow: 'auto'}}>
        {tab === 'customize'
          ? <CustomizerPanel />
          : <LayerColorsPanel />}
      </div>
    </div>
  );
}
