import { ReactNode, useContext } from 'react';
import { Dialog } from 'primereact/dialog';
import { Dropdown } from 'primereact/dropdown';
import { Checkbox } from 'primereact/checkbox';
import { Button } from 'primereact/button';
import { SelectButton } from 'primereact/selectbutton';
import { confirmDialog } from 'primereact/confirmdialog';
import { ModelContext } from './contexts.ts';
import { isInStandaloneMode } from '../utils.ts';

const DEBOUNCE_OPTIONS = [
  { label: 'Off',     value: 0 },
  { label: '200 ms',  value: 200 },
  { label: '400 ms',  value: 400 },
  { label: '800 ms',  value: 800 },
  { label: '1.5 s',   value: 1500 },
];

const COLOR_SCHEME_OPTIONS = [
  { label: 'Auto',  value: 'auto'  },
  { label: 'Light', value: 'light' },
  { label: 'Dark',  value: 'dark'  },
];

const PRIMARY_BUTTON_OPTIONS = [
  { label: 'Drag (LMB) · Rotate (RMB)', value: 'pan' },
  { label: 'Rotate (LMB) · Drag (RMB)', value: 'rotate' },
];

export default function SettingsDialog({
  visible,
  onHide,
}: {
  visible: boolean;
  onHide: () => void;
}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const debounce       = state.view.editorDebounceMs ?? 400;
  const colorScheme    = state.view.colorScheme ?? 'auto';
  const primaryMouse   = state.view.primaryMouseButton ?? 'pan';
  const wasdNav        = state.view.wasdNav !== false;
  const showAxes       = !!state.view.showAxes;
  const lineNumbers    = !!state.view.lineNumbers;
  const layoutMode     = state.view.layout.mode;

  return (
    <Dialog
      visible={visible}
      onHide={onHide}
      modal
      dismissableMask
      header="Settings"
      style={{ width: 'min(620px, 94vw)' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        <Section title="Editor">
          <Row label="Debounce" hint="How long after typing stops before the preview re-renders.">
            <Dropdown
              value={debounce}
              options={DEBOUNCE_OPTIONS}
              onChange={e => model.mutate(s => { s.view.editorDebounceMs = e.value; })}
            />
          </Row>
          <Row label="Line numbers">
            <Checkbox
              inputId="opt-line-numbers"
              checked={lineNumbers}
              onChange={e => model.mutate(s => { s.view.lineNumbers = !!e.checked; })}
            />
          </Row>
        </Section>

        <Section title="Layout">
          <Row label="Panel mode" hint="Multi shows Edit / View / Customize side by side on wide screens.">
            <SelectButton
              value={layoutMode}
              options={[
                { label: 'Multi',  value: 'multi'  },
                { label: 'Single', value: 'single' },
              ]}
              onChange={e => e.value && model.changeLayout(e.value)}
            />
          </Row>
          <Row label="Show axes">
            <Checkbox
              inputId="opt-show-axes"
              checked={showAxes}
              onChange={e => model.mutate(s => { s.view.showAxes = !!e.checked; })}
            />
          </Row>
        </Section>

        <Section title="Appearance">
          <Row label="Color scheme">
            <SelectButton
              value={colorScheme}
              options={COLOR_SCHEME_OPTIONS}
              onChange={e => e.value && model.mutate(s => { s.view.colorScheme = e.value; })}
            />
          </Row>
        </Section>

        <Section title="Viewer controls">
          <Row label="Mouse mapping">
            <SelectButton
              value={primaryMouse}
              options={PRIMARY_BUTTON_OPTIONS}
              onChange={e => e.value && model.mutate(s => { s.view.primaryMouseButton = e.value; })}
            />
          </Row>
          <Row label="WASD + Q/E navigation"
               hint="While the rotate mouse button is held, walk the camera relative to where it's looking: W/S forward/backward along the view direction, A/D strafe, Q/E rise/descend.">
            <Checkbox
              inputId="opt-wasd"
              checked={wasdNav}
              onChange={e => model.mutate(s => { s.view.wasdNav = !!e.checked; })}
            />
          </Row>
        </Section>

        {isInStandaloneMode() && (
          <Section title="Danger zone">
            <Row label="Clear local storage" hint="Erases every file you've created or edited in this playground.">
              <Button
                label="Clear..."
                icon="pi pi-trash"
                severity="danger"
                outlined
                size="small"
                onClick={() => {
                  confirmDialog({
                    message:
                      "This will clear all the edits you've made and files you've created in this " +
                      "playground and reset it to defaults. Continue?",
                    header: 'Clear local storage',
                    icon: 'pi pi-exclamation-triangle',
                    accept: () => { localStorage.clear(); location.reload(); },
                    acceptLabel: 'Clear all files',
                    rejectLabel: 'Cancel',
                  });
                }}
              />
            </Row>
          </Section>
        )}

      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: 'var(--surface-fg-muted)',
        marginBottom: 10,
        paddingBottom: 6,
        borderBottom: '1px solid var(--surface-border)',
      }}>
        {title}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'minmax(0, 1fr) auto',
      gap: 16,
      alignItems: 'center',
    }}>
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--surface-fg-strong)' }}>{label}</div>
        {hint && (
          <div style={{ fontSize: 11, color: 'var(--surface-fg-faint)', marginTop: 2, maxWidth: '52ch', lineHeight: 1.45 }}>
            {hint}
          </div>
        )}
      </div>
      <div>{children}</div>
    </div>
  );
}
