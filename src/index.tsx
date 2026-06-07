// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import React from 'react';
import ReactDOM from 'react-dom/client';
import {App} from './components/App.tsx';
import { createEditorFS } from './fs/filesystem.ts';
import { registerOpenSCADLanguage } from './language/openscad-register-language.ts';
import { zipArchives } from './fs/zip-archives.ts';
import {readStateFromFragment} from './state/fragment-state.ts'
import { createInitialState } from './state/initial-state.ts';
import './index.css';

import debug from 'debug';
import { isInStandaloneMode, registerCustomAppHeightCSSProperty } from './utils.ts';

// Swallow benign ResizeObserver loop notifications before webpack-dev-server's
// overlay surfaces them as runtime errors. The browser emits these when a
// ResizeObserver callback triggers another layout in the same frame; nothing
// is actually broken. Capture-phase listener so we run before the overlay's.
const RESIZE_OBSERVER_MESSAGES = [
  'ResizeObserver loop completed with undelivered notifications.',
  'ResizeObserver loop limit exceeded',
];
window.addEventListener('error', (e) => {
  if (e.message && RESIZE_OBSERVER_MESSAGES.some(m => e.message.includes(m))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);
window.addEventListener('unhandledrejection', (e) => {
  const msg = (e.reason && (e.reason.message ?? String(e.reason))) || '';
  if (RESIZE_OBSERVER_MESSAGES.some(m => msg.includes(m))) {
    e.stopImmediatePropagation();
    e.preventDefault();
  }
}, true);
import { State, StatePersister } from './state/app-state.ts';
import { writeStateInFragment } from "./state/fragment-state.ts";

import { PrimeReactProvider } from "primereact/api";
import "primereact/resources/primereact.min.css";
import "primeicons/primeicons.css";
import "primeflex/primeflex.min.css";

// PrimeReact 10.x reads config from PrimeReactContext (the deprecated default
// `PrimeReact` global is no longer consulted by overlay listeners). Without a
// provider, overlay event handlers see an undefined context and crash with
// "Cannot read properties of undefined (reading 'hideOverlaysOnDocumentScrolling')"
// when an overlay closes due to an outside click or scroll.
const primeReactConfig = {
  hideOverlaysOnDocumentScrolling: false,
  ripple: false,
};

const log = debug('app:log');

if (process.env.NODE_ENV !== 'production') {
  debug.enable('*');
  log('Logging is enabled!');
} else {
  debug.disable();
}

declare var BrowserFS: BrowserFSInterface


window.addEventListener('load', async () => {
  // Small build-stamp in the corner so you can verify which version is live.
  // Bumped via `npm version <patch|minor|major>` or by editing package.json.
  const version = process.env.HOTSCAD_VERSION;
  if (version) {
    const badge = document.createElement('div');
    badge.id = 'hotscad-version';
    badge.textContent = `v${version}`;
    badge.title = `HotSCAD v${version}`;
    badge.style.cssText = [
      'position:fixed',
      'bottom:4px',
      'right:6px',
      'font-family:ui-monospace,SFMono-Regular,Menlo,monospace',
      'font-size:10px',
      'letter-spacing:0.04em',
      'color:#807767',
      'opacity:0.45',
      'pointer-events:none',
      'user-select:none',
      'z-index:99999',
    ].join(';');
    document.body.appendChild(badge);
  }

  //*
  if (process.env.NODE_ENV === 'production') {
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('./sw.js');
            console.log('ServiceWorker registration successful with scope: ', registration.scope);

            registration.onupdatefound = () => {
                const installingWorker = registration.installing;
                if (installingWorker) {
                  installingWorker.onstatechange = () => {
                      if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                          // Reload to activate the service worker and apply caching
                          window.location.reload();
                          return;
                      }
                  };
                }
            };
        } catch (err) {
            console.log('ServiceWorker registration failed: ', err);
        }
    }
  }
  //*/
  
  registerCustomAppHeightCSSProperty();

  const fs = await createEditorFS({prefix: '/libraries/', allowPersistence: isInStandaloneMode()});

  await registerOpenSCADLanguage(fs, '/', zipArchives);

  let statePersister: StatePersister;
  let persistedState: State | null = null;

  if (isInStandaloneMode()) {
    const fs: FS = BrowserFS.BFSRequire('fs')
    try {
      const data = JSON.parse(new TextDecoder("utf-8").decode(fs.readFileSync('/state.json')));
      const {view, params} = data
      persistedState = {view, params};
    } catch (e) {
      console.log('Failed to read the persisted state from local storage.', e)
    }
    statePersister = {
      set: async ({view, params}) => {
        fs.writeFile('/state.json', JSON.stringify({view, params}));
      }
    };
  } else {
    persistedState = await readStateFromFragment();
    statePersister = {
      set: writeStateInFragment,
    };
  }

  const initialState = createInitialState(persistedState);

  const root = ReactDOM.createRoot(
    document.getElementById('root') as HTMLElement
  );
  root.render(
    <React.StrictMode>
      <PrimeReactProvider value={primeReactConfig}>
        <App initialState={initialState} statePersister={statePersister} fs={fs} />
      </PrimeReactProvider>
    </React.StrictMode>
  );
});


