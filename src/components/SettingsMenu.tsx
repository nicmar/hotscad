// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useContext, useRef } from 'react';
import { Button } from 'primereact/button';
import { MenuItem } from 'primereact/menuitem';
import { Menu } from 'primereact/menu';
import { ModelContext } from './contexts.ts';
import { isInStandaloneMode } from '../utils.ts';
import { confirmDialog } from 'primereact/confirmdialog';

const DEBOUNCE_OPTIONS = [0, 200, 400, 800, 1500];

function labelForDebounce(ms: number): string {
  if (ms <= 0) return 'Editor debounce: off (click to cycle)';
  return `Editor debounce: ${ms} ms (click to cycle)`;
}

const COLOR_SCHEME_OPTIONS = ['auto', 'light', 'dark'] as const;
type ColorSchemeOption = typeof COLOR_SCHEME_OPTIONS[number];

const COLOR_SCHEME_LABEL: Record<ColorSchemeOption, string> = {
  auto: 'Color scheme: Auto (System) — click to cycle',
  light: 'Color scheme: Light — click to cycle',
  dark: 'Color scheme: Dark — click to cycle',
};

const COLOR_SCHEME_ICON: Record<ColorSchemeOption, string> = {
  auto: 'pi pi-desktop',
  light: 'pi pi-sun',
  dark: 'pi pi-moon',
};

export default function SettingsMenu({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const currentDebounce = state.view.editorDebounceMs ?? 400;
  const cycleDebounce = () => {
    const idx = DEBOUNCE_OPTIONS.indexOf(currentDebounce);
    const next = DEBOUNCE_OPTIONS[(idx + 1) % DEBOUNCE_OPTIONS.length];
    model.mutate(s => { s.view.editorDebounceMs = next; });
  };

  const currentColorScheme: ColorSchemeOption = state.view.colorScheme ?? 'auto';
  const cycleColorScheme = () => {
    const idx = COLOR_SCHEME_OPTIONS.indexOf(currentColorScheme);
    const next = COLOR_SCHEME_OPTIONS[(idx + 1) % COLOR_SCHEME_OPTIONS.length];
    model.mutate(s => { s.view.colorScheme = next; });
  };

  const settingsMenu = useRef<Menu>(null);
  return (
    <>
      <Menu model={[
        {
          label: state.view.layout.mode === 'multi'
            ? 'Switch to single panel mode'
            : "Switch to side-by-side mode",
          icon: 'pi pi-table',
          // disabled: true,
          command: () => model.changeLayout(state.view.layout.mode === 'multi' ? 'single' : 'multi'),
        },
        {
          separator: true
        },
        {
          label: state.view.showAxes ? 'Hide axes' : 'Show axes',
          icon: 'pi pi-asterisk',
          // disabled: true,
          command: () => model.mutate(s => s.view.showAxes = !s.view.showAxes)
        },
        {
          label: state.view.lineNumbers ? 'Hide line numbers' : 'Show line numbers',
          icon: 'pi pi-list',
          // disabled: true,
          command: () => model.mutate(s => s.view.lineNumbers = !s.view.lineNumbers)
        },
        {
          label: labelForDebounce(currentDebounce),
          icon: 'pi pi-clock',
          command: cycleDebounce,
        },
        {
          label: COLOR_SCHEME_LABEL[currentColorScheme],
          icon: COLOR_SCHEME_ICON[currentColorScheme],
          command: cycleColorScheme,
        },
        ...(isInStandaloneMode() ? [
          {
            separator: true
          },  
          {
            label: 'Clear local storage',
            icon: 'pi pi-list',
            // disabled: true,
            command: () => {
              confirmDialog({
                message: "This will clear all the edits you've made and files you've created in this playground " +
                  "and will reset it to factory defaults. " +
                  "Are you sure you wish to proceed? (you might lose your models!)",
                header: 'Clear local storage',
                icon: 'pi pi-exclamation-triangle',
                accept: () => {
                  localStorage.clear();
                  location.reload();
                },
                acceptLabel: `Clear all files!`,
                rejectLabel: 'Cancel'
              });
            },
          },
        ] : []),
      ] as MenuItem[]} popup ref={settingsMenu} />
    
      <Button title="Settings menu"
          style={style}
          className={className}
          rounded
          text
          icon="pi pi-cog"
          onClick={(e) => settingsMenu.current && settingsMenu.current.toggle(e)} />
    </>
  );
}