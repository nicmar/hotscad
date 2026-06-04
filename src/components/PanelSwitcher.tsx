// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { useContext, useRef } from 'react';
import { SingleLayoutComponentId } from '../state/app-state.ts'
import { TabMenu } from 'primereact/tabmenu';
import { ToggleButton } from 'primereact/togglebutton';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { Badge } from 'primereact/badge';
import { ProgressBar } from 'primereact/progressbar';
import { Toast } from 'primereact/toast';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { ModelContext } from './contexts.ts';
import HotSCADLogo from './HotSCADLogo.tsx';
import ExportButton from './ExportButton.tsx';
import SettingsMenu from './SettingsMenu.tsx';
import HelpMenu from './HelpMenu.tsx';
import MultimaterialColorsDialog from './MultimaterialColorsDialog.tsx';

export default function PanelSwitcher() {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;
  const toast = useRef<Toast>(null);

  const singleTargets: {id: SingleLayoutComponentId, icon: string, label: string}[] = [
    { id: 'editor', icon: 'pi pi-pencil', label: 'Edit' },
    { id: 'viewer', icon: 'pi pi-box', label: 'View' },
  ];
  if ((state.parameterSet?.parameters?.length ?? 0) > 0) {
    singleTargets.push({ id: 'customizer', icon: 'pi pi-sliders-h', label: 'Customize' });
  }
  const multiTargets = singleTargets;

  const severityByMarkerSeverity = new Map<monaco.MarkerSeverity, 'danger' | 'warning' | 'info'>([
    [monaco.MarkerSeverity.Error, 'danger'],
    [monaco.MarkerSeverity.Warning, 'warning'],
    [monaco.MarkerSeverity.Info, 'info'],
  ]);
  const markers = state.lastCheckerRun?.markers ?? [];
  const getBadge = (s: monaco.MarkerSeverity) => {
    const count = markers.filter(m => m.severity == s).length;
    return <>{count > 0 && <Badge value={count} severity={severityByMarkerSeverity.get(s)}></Badge>}</>;
  };
  const maxMarkerSeverity = markers.length == 0
    ? undefined
    : markers.map(m => m.severity).reduce((a, b) => Math.max(a, b));

  const renderAction = (() => {
    if (state.output && !state.output.isPreview) return <ExportButton />;
    if (state.previewing) {
      return (
        <Button
          icon="pi pi-bolt"
          disabled
          className="p-button-sm"
          label="Previewing..." />
      );
    }
    if (state.output && state.output.isPreview) {
      return (
        <Button
          icon="pi pi-bolt"
          onClick={() => model.render({isPreview: false, now: true})}
          className="p-button-sm"
          disabled={state.rendering}
          label={state.rendering ? 'Rendering...' : 'Render'} />
      );
    }
    return null;
  })();

  return (
    <div style={{ position: 'relative' }}>
      <div className="flex flex-row" style={{
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
      }}>
        <HotSCADLogo height={22} style={{ marginRight: 6 }} />

        {state.view.layout.mode === 'multi' ? (
          <div className="flex flex-row gap-1" style={{
            justifyContent: 'center',
            flex: 1,
          }}>
            {multiTargets.map(({icon, label, id}) =>
              <ToggleButton
                key={id}
                checked={(state.view.layout as any)[id]}
                onLabel={label}
                offLabel={label}
                onIcon={icon}
                offIcon={icon}
                onChange={e => model.changeMultiVisibility(id, e.value)}
              />
            )}
          </div>
        ) : (
          <TabMenu
            activeIndex={singleTargets.map(t => t.id).indexOf(state.view.layout.focus)}
            style={{ flex: 1 }}
            model={singleTargets.map(({icon, label, id}) =>
              ({icon, label, command: () => model.changeSingleVisibility(id)}))} />
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginLeft: 4,
            fontSize: 12,
            userSelect: 'none',
            cursor: 'pointer',
            whiteSpace: 'nowrap',
          }}
          title="Show model bounding-box dimensions in mm">
          <Checkbox
            inputId="showDimensions"
            checked={!!state.view.showDimensions}
            onChange={e => model.mutate(s => { s.view.showDimensions = !!e.checked; })}
          />
          Show dimensions
        </label>

        {renderAction}

        <MultimaterialColorsDialog />

        {(state.lastCheckerRun || state.output) && (
          <Button
            type="button"
            severity={maxMarkerSeverity && severityByMarkerSeverity.get(maxMarkerSeverity)}
            icon="pi pi-align-left"
            text={!state.view.logs}
            onClick={() => model.logsVisible = !state.view.logs}
            title="Toggle console / logs"
            className={maxMarkerSeverity ? `p-button-${severityByMarkerSeverity.get(maxMarkerSeverity) ?? 'success'}` : ''}>
            {getBadge(monaco.MarkerSeverity.Error)}
            {getBadge(monaco.MarkerSeverity.Warning)}
            {getBadge(monaco.MarkerSeverity.Info)}
          </Button>
        )}

        <SettingsMenu />
        <HelpMenu />
        <Toast ref={toast} />
      </div>

      <ProgressBar
        mode="indeterminate"
        style={{
          height: 3,
          margin: 0,
          visibility: state.rendering || state.previewing || state.checkingSyntax || state.exporting
            ? 'visible' : 'hidden',
        }} />
    </div>
  );
}
