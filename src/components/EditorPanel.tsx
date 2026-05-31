// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React, { CSSProperties, useContext, useEffect, useRef, useState } from 'react';
import Editor, { loader, Monaco } from '@monaco-editor/react';
import openscadEditorOptions from '../language/openscad-editor-options.ts';
import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { InputTextarea } from 'primereact/inputtextarea';
import { Button } from 'primereact/button';
import { MenuItem } from 'primereact/menuitem';
import { Menu } from 'primereact/menu';
import { buildUrlForStateParams } from '../state/fragment-state.ts';
import { getBlankProjectState, defaultSourcePath } from '../state/initial-state.ts';
import { ModelContext, FSContext } from './contexts.ts';
import FilePicker, {  } from './FilePicker.tsx';
import { LocalFileButton } from './LocalFileButton';
import { useResolvedColorScheme } from './useResolvedColorScheme';

// const isMonacoSupported = false;
const isMonacoSupported = (() => {
  const ua = window.navigator.userAgent;
  const iosWk = ua.match(/iPad|iPhone/i) && ua.match(/WebKit/i);
  const android = ua.match(/Android/i);
  return !(iosWk || android);
})();

let monacoInstance: Monaco | null = null;
if (isMonacoSupported) {
  loader.init().then(mi => monacoInstance = mi);
}

export default function EditorPanel({className, style}: {className?: string, style?: CSSProperties}) {

  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const menu = useRef<Menu>(null);

  const state = model.state;

  const resolvedColorScheme = useResolvedColorScheme(state.view.colorScheme);

  const [editor, setEditor] = useState(null as monaco.editor.IStandaloneCodeEditor | null)

  // Debounced source updates. While the user is typing we keep a local "draft"
  // string so Monaco's `value` prop doesn't revert (model.source updates are
  // delayed). When the debounce timer fires we push to model.source and clear
  // the draft so further renders flow from model state again.
  const debounceMs = state.view.editorDebounceMs ?? 400;
  const [draft, setDraft] = useState<string | null>(null);
  const debounceTimerRef = useRef<number | null>(null);
  const lastDraftRef = useRef<string>('');

  // Drop any pending draft when the user switches files.
  useEffect(() => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setDraft(null);
  }, [state.params.activePath]);

  // Flush any pending edit on unmount.
  useEffect(() => () => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
      if (lastDraftRef.current && lastDraftRef.current !== model.source) {
        model.source = lastDraftRef.current;
      }
    }
  }, []);

  const editorValue = draft !== null ? draft : model.source;

  const flushDraft = () => {
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    const s = lastDraftRef.current;
    if (s !== undefined && s !== model.source) {
      model.source = s;
    }
    setDraft(null);
  };

  const onSourceChange = (next: string) => {
    lastDraftRef.current = next;
    if (debounceMs <= 0) {
      model.source = next;
      setDraft(null);
      return;
    }
    setDraft(next);
    if (debounceTimerRef.current != null) {
      window.clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = window.setTimeout(() => {
      debounceTimerRef.current = null;
      if (lastDraftRef.current !== model.source) {
        model.source = lastDraftRef.current;
      }
      setDraft(null);
    }, debounceMs);
  };

  if (editor) {
    const checkerRun = state.lastCheckerRun;
    const editorModel = editor.getModel();
    if (editorModel) {
      if (checkerRun && monacoInstance) {
        monacoInstance.editor.setModelMarkers(editorModel, 'openscad', checkerRun.markers);
      }
    }
  }

  const onMount = (editor: monaco.editor.IStandaloneCodeEditor) => {
    editor.addAction({
      id: "openscad-render",
      label: "Render OpenSCAD",
      run: () => model.render({isPreview: false, now: true})
    });
    editor.addAction({
      id: "openscad-preview",
      label: "Preview OpenSCAD",
      run: () => model.render({isPreview: true, now: true})
    });
    editor.addAction({
      id: "openscad-save-do-nothing",
      label: "Save (disabled)",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      // Treat Ctrl/Cmd+S as "flush pending edit immediately" — handy when
      // the debounce is set high.
      run: () => flushDraft()
    });
    editor.addAction({
      id: "openscad-save-project",
      label: "Save OpenSCAD project",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS],
      run: () => model.saveProject()
    });
    setEditor(editor)
  }

  return (
    <div className={`editor-panel ${className ?? ''}`} style={{
      // maxWidth: '5 0vw',
      display: 'flex',
      flexDirection: 'column',
      // position: 'relative',
      // width: '100%', height: '100%',
      ...(style ?? {})
    }}>
      <div className='flex flex-row gap-2' style={{
        margin: '5px',
      }}>
          
        <Menu model={[
          {
            label: "New project",
            icon: 'pi pi-plus-circle',
            command: () => window.open(buildUrlForStateParams(getBlankProjectState()), '_blank'),
            target: '_blank',
          },
          {
            // TODO: share text, title and rendering image
            // https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
            label: 'Share project',
            icon: 'pi pi-share-alt',
            disabled: true,
          },
          {
            separator: true
          },  
          {
            // TODO: popup to ask for file name
            label: "New file",
            icon: 'pi pi-plus',
            disabled: true,
          },
          {
            label: "Copy to new file",
            icon: 'pi pi-clone',
            disabled: true,
          },
          {
            label: "Upload file(s)",
            icon: 'pi pi-upload',
            disabled: true,
          },
          {
            label: 'Download sources',
            icon: 'pi pi-download',
            disabled: true,
          },
          {
            separator: true
          },
          {
            separator: true
          },
          {
            label: 'Select All',
            icon: 'pi pi-info-circle',
            command: () => editor?.trigger(state.params.activePath, 'editor.action.selectAll', null),
          },
          {
            separator: true
          },
          {
            label: 'Find',
            icon: 'pi pi-search',
            command: () => editor?.trigger(state.params.activePath, 'actions.find', null),
          },
        ] as MenuItem[]} popup ref={menu} />
        <Button title="Editor menu" rounded text icon="pi pi-ellipsis-h" onClick={(e) => menu.current && menu.current.toggle(e)} />
        
        <FilePicker 
            style={{
              flex: 1,
            }}/>

        {state.params.activePath !== defaultSourcePath &&
          <Button icon="pi pi-chevron-left"
          text
          onClick={() => model.openFile(defaultSourcePath)}
          title={`Go back to ${defaultSourcePath}`}/>}

        <LocalFileButton />

      </div>

      
      <div style={{
        position: 'relative',
        flex: 1
      }}>
        {isMonacoSupported && (
          <Editor
            className="openscad-editor absolute-fill"
            defaultLanguage="openscad"
            path={state.params.activePath}
            value={editorValue}
            onChange={s => onSourceChange(s ?? '')}
            onMount={onMount}
            theme={resolvedColorScheme === 'dark' ? 'vs-dark' : 'vs'}
            options={{
              ...openscadEditorOptions,
              fontSize: 16,
              lineNumbers: state.view.lineNumbers ? 'on' : 'off',
            }}
          />
        )}
        {!isMonacoSupported && (
          <InputTextarea
            className="openscad-editor absolute-fill"
            value={editorValue}
            onChange={s => onSourceChange(s.target.value ?? '')}
          />
        )}
      </div>

      <div style={{
        display: state.view.logs ? undefined : 'none',
        overflowY: 'scroll',
        height: 'calc(min(200px, 30vh))',
      }}>
        {(state.currentRunLogs ?? []).map(([type, text], i) => (
          <pre key={i}>{text}</pre>
        ))}
      </div>
    
    </div>
  )
}
