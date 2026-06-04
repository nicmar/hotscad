import { useContext } from 'react';
import { Dialog } from 'primereact/dialog';
import { Button } from 'primereact/button';
import { ModelContext } from './contexts.ts';
import HotSCADLogo from './HotSCADLogo.tsx';

// Update when the repo location is final.
const GITHUB_URL = 'https://github.com/nicmar/hotscad';

export default function QuickStart() {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');
  const state = model.state;

  const visible = !!state.quickStartOpen;
  const close = () => model.mutate(s => { s.quickStartOpen = false; });

  return (
    <Dialog
      visible={visible}
      onHide={close}
      modal
      dismissableMask
      style={{ width: 'min(640px, 92vw)' }}
      header={
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <HotSCADLogo height={22} />
          <span style={{ fontSize: 13, color: 'var(--surface-fg-faint)' }}>Quick Start</span>
        </div>
      }
      footer={
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button label="Got it" icon="pi pi-check" onClick={close} />
        </div>
      }>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: 'var(--surface-fg)' }}>
        <p style={{ marginTop: 0 }}>
          HotSCAD is OpenSCAD in your browser with live preview as you type.
          Edit a <code>.scad</code> file on the left, watch the model update on the right.
        </p>

        <Section title="Render & export">
          <Kbd>F5</Kbd> preview · <Kbd>Ctrl/⌘ + Enter</Kbd> full render ·{' '}
          <Kbd>F6</Kbd> full render · <Kbd>F7</Kbd> export STL/3MF
        </Section>

        <Section title="Hot reload from disk">
          Click <i className="pi pi-folder-open" /> <b>Open Local...</b> in the editor toolbar to
          point at a file on your machine. HotSCAD watches it and re-renders on every save,
          so you can keep editing in your usual IDE.
        </Section>

        <Section title="Customizer">
          Declare parameters at the top of your SCAD file and they show up as controls in the{' '}
          <b>Customize</b> tab. Group with <code>{`/* [Group] */`}</code>, constrain values with{' '}
          <code>{`// [opt1, opt2]`}</code>.
        </Section>

        <Section title="Font dropdown">
          Any string parameter whose name ends in <code>font</code> (e.g.{' '}
          <code>label_text_font</code>) automatically gets a font picker with Inter,
          Liberation Sans/Serif/Mono, and Noto Sans bundled.
        </Section>

        <Section title="Layout">
          On wide screens (≥ 768 px) each tab in the top bar is a toggle —
          click to show or hide that panel, so you can have <b>Edit</b>,{' '}
          <b>View</b> and <b>Customize</b> side by side. On narrow screens
          only one panel is visible at a time.
        </Section>

        <Section title="Reopen this">
          Click the <i className="pi pi-question-circle" /> help icon in the top bar and pick{' '}
          <b>Quick Start</b>.
        </Section>

        <div style={{
          marginTop: 16,
          paddingTop: 10,
          borderTop: '1px solid var(--surface-border)',
          fontSize: 12,
          color: 'var(--surface-fg-muted)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}>
          <span>HotSCAD is open source.</span>
          <a href={GITHUB_URL} target="_blank" rel="noreferrer"
             style={{ color: 'inherit', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <i className="pi pi-github" /> Get it on GitHub
          </a>
        </div>
      </div>
    </Dialog>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        color: 'var(--surface-fg-muted)',
        marginBottom: 4,
      }}>
        {title}
      </div>
      <div>{children}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd style={{
      display: 'inline-block',
      padding: '1px 6px',
      borderRadius: 4,
      border: '1px solid var(--surface-border)',
      background: 'var(--surface-row-bg)',
      fontFamily: 'source-code-pro, Menlo, Monaco, Consolas, monospace',
      fontSize: 11,
      lineHeight: 1.4,
      color: 'var(--surface-fg-strong)',
    }}>
      {children}
    </kbd>
  );
}
