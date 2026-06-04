# Architecture

A practical map of how this fork of openscad-playground is put together. Read
top-to-bottom or jump to the section you need. For upstream-vs-fork delta, see
`IMPLEMENTATION_NOTES.md` at the repo root.

## What this app actually is

A single-page React app that runs the **OpenSCAD compiler in WebAssembly** inside
the browser. The user edits `.scad` source in a Monaco editor, the worker invokes
the WASM compiler against an in-browser filesystem, and the output (GLB / STL /
3MF / SVG) is shown in a model-viewer canvas or downloaded.

Nothing is sent to a server. Everything runs in the browser tab.

Key off-the-shelf pieces:

- **OpenSCAD** compiled to WASM (via `DSchroer/openscad-wasm`, with the
  Manifold backend for speed). Shipped as `src/wasm/openscad.{js,wasm}`.
- **Monaco editor** with a custom OpenSCAD language definition.
- **PrimeReact** for menus, dialogs, fieldsets, etc.
- **model-viewer** (Google) for the 3D viewport.
- **BrowserFS** for the in-browser POSIX filesystem the WASM sees.

## Directory map

```
src/
  components/   React components (panels, menus, viewer)
  fs/           BrowserFS setup + bundled SCAD library zips
  io/           Format converters (GLB, 3MF, OFF, image hashes, recolor)
  language/     Monaco language definition + completions for OpenSCAD
  runner/       Glue around the WASM: actions, worker, output parsing
  state/        App state, persistence, customizer reconciliation
  wasm/         The compiled OpenSCAD WASM and its JS glue
public/         Static assets copied verbatim by webpack
  index.html
  model-viewer.min.js, browserfs.min.js   (kept local for PWA offline use)
  libraries/*.zip                          (lazy-loaded SCAD library bundles)
docs/
  superpowers/specs/, superpowers/plans/   Design + implementation docs
  architecture.md                          (this file)
```

## Build pipeline

`webpack.config.js` defines two builds:

1. **Main bundle** (`./src/index.tsx` → `dist/index.js`). Source maps. CSS via
   `style-loader` + `css-loader`. `PrimeReact` resources kept external (link
   tag in `public/index.html`, see Color scheme).
2. **Web worker bundle** (`./src/runner/openscad-worker.ts` →
   `dist/openscad-worker.js`). Built `target: 'webworker'`. `browserfs` is
   declared external and pulled in at runtime from `public/browserfs.min.js`.

`CopyPlugin` copies:

- everything under `public/` (favicons, manifest, prefetched library zips, the
  vendored `model-viewer.min.js` and `browserfs.min.js`, etc.)
- `primeicons` fonts → `dist/fonts/`
- `src/wasm/openscad.{js,wasm}` → `dist/`
- `primereact/resources/themes/lara-{light,dark}-indigo/` → `dist/themes/...`
  (both theme stylesheets are shipped so dark mode can swap at runtime)

In production mode, `WorkboxPlugin` also generates a service worker so the app
can run as a PWA offline.

### Scripts you actually use

- `npm install` — node deps.
- `npm run build:libs` — clones a curated set of `.scad` libraries (BOSL2,
  NopSCADlib, MCAD, etc.) and zips them into `public/libraries/`. Needs `git`.
- `npm start` — webpack dev server on `:4000`.
- `npm run build` — production bundle to `dist/`.
- `npm run test:unit` — vitest (camera math, customizer reconciliation).
- `npm run test:e2e` — Jest + Puppeteer.

## Runtime data flow

The render path is the single most important thing to understand.

```
EditorPanel  ── source text ──▶  Model.mutate (state.params.sources)
                                    │
                                    ▼
                           Model.render({isPreview})
                                    │
                                    ▼
                      runner/actions.ts → spawnOpenSCAD
                                    │
                                    ▼
                  Web Worker (openscad-worker.ts)
                                    │
                                    ▼
                     wasm/openscad.js (OpenSCAD WASM)
                                    │
                                    ▼
                   Output bytes (GLB / STL / SVG / …)
                                    │
                                    ▼
                ViewerPanel ⇐ model.state.output (URL + metadata)
```

A few details worth knowing:

- **F5** triggers a preview render; **Ctrl/Cmd+Enter** or **F6** triggers a
  full render; **F7** exports. Bound globally in `App.tsx`.
- The worker is spawned per invocation by `spawnOpenSCAD` in
  `runner/openscad-runner.ts`. The worker mounts BrowserFS, symlinks shipped
  library zips into `/libraries/`, runs `OpenSCAD()` with the requested CLI
  args, and streams `stdout`/`stderr` back through `postMessage`.
- `state/model.ts` is the orchestrator. It debounces preview renders, applies
  customizer overrides as `-D name=value` flags, decides between OpenSCAD's
  native output and a glTF rewrite (`io/export_glb.ts`), and handles 3MF
  export with per-component coloring (`io/export_3mf.ts`).

## State

`state/app-state.ts` defines the single `State` shape. Two halves matter:

- `state.params` — what the user is *editing*: active path, sources, var
  overrides, export format, layer-color config. This is what gets persisted.
- `state.view` — what the user is *looking at*: layout, panel focus,
  customizer collapse state, color scheme, debounce setting. Also persisted.

`state/model.ts` exposes `Model`, a class wrapping the state with:

- `model.mutate(s => { s.foo = bar })` — immer-style mutation via
  `state/deep-mutate.ts`. Triggers React re-render + persistence.
- `model.render(...)`, `model.export(...)` — entry points for the WASM.
- `model.setVar(name, value)` — sets a customizer override (records it in
  `state.params.vars`).

### Persistence

Two backends, decided at boot in `src/index.tsx`:

- **Standalone (PWA)**: BrowserFS writes `state.view` + `state.params` to a
  persistent `/state.json` on the user's device. Survives reloads
  indefinitely, no URL changes.
- **Normal web page**: `fragment-state.ts` writes the same payload to the URL
  hash, compressed. This makes every URL self-contained and shareable. The
  initial state is read from the fragment on load.

`state/initial-state.ts` sets defaults (default SCAD source, layout mode based
on viewport width, axes on, color scheme `'auto'`, etc.).

## Filesystem

`src/fs/filesystem.ts` builds the BrowserFS tree the WASM sees:

- `/` is the working dir for the current edit.
- `/libraries/<name>/…` are read-only mounts of the bundled `.zip` libraries
  in `public/libraries/`. Listed in `src/fs/zip-archives.ts`.
- `/home` (PWA mode only) is a persistent IndexedDB-backed area where the user's
  own files go.

Lazy loading: a library zip is only fetched the first time the user's code or
the UI tries to read from that directory.

## Customizer

OpenSCAD's customizer reads `// description`-style comments above top-level
variables in the source and presents them as form fields. The parsing happens
inside the WASM (it spits out a `parameter-set.json`), and the React side just
renders the result.

Two pieces are non-trivial:

- **Type-aware rendering** (`components/CustomizerPanel.tsx`): number / int /
  string / bool / vector / enum, each with appropriate widgets (slider, number
  input, dropdown).
- **Override reconciliation** (`state/customizer-reconcile.ts`): when the
  source changes — either via editing or via the "Open Local…" file watcher —
  the previous set of overrides may no longer match the new parameter set.
  Overrides for removed params are dropped; type-changed overrides are dropped
  on external reload only (so the user doesn't lose work mid-edit).

## Camera and viewer

The viewport is a `<model-viewer>` element. Camera control is hand-rolled in
`src/components/CameraController.ts` because model-viewer's built-in controls
don't match the OpenSCAD/CAD conventions users expect.

- **Mouse**: RMB rotate, LMB pan, MMB pan, Shift+LMB rotate, wheel zoom.
- **Touch**: 1-finger rotate, 2-finger pan, pinch zoom.
- **Camera orbit/target** are preserved across re-renders (upstream reset on
  every customizer change).
- **Near-plane override**: model-viewer clamps the perspective camera's near
  plane to `far / 1000`. For small models this causes geometry to disappear
  when zooming close. The controller walks `Object.getOwnPropertySymbols(el)`
  to find model-viewer's internal scene (identified by its `updateNearFar`
  method), then re-asserts `near = max(1e-6, far * 1e-7)` every animation
  frame.

`components/ViewCube.tsx` is the Fusion-style cube widget in the top-right:

- The cube rotates to mirror the camera orientation (`rotateX(phi - π/2)
  rotateY(-theta)`).
- Clicking a face snaps the camera to that face (`setCameraToFace`).
- Double-clicking the same face toggles a fake-orthographic mode by collapsing
  FOV and scaling radius to keep apparent size constant.
- Pointer capture is deferred to first drag movement, so face clicks aren't
  swallowed by the wrapper.

## Editor

`components/EditorPanel.tsx` hosts a `@monaco-editor/react` instance. The
OpenSCAD language module is registered globally in
`language/openscad-register-language.ts`:

- Tokenizer (`openscad-language.ts`)
- Completion provider with a hand-curated builtin list
  (`openscad-builtins.ts`) and a lightweight pseudo-parser that resolves
  identifiers from `include`/`use` chains (`openscad-pseudoparser.ts`).
- Editor options live in `openscad-editor-options.ts`.

Edit-to-render is debounced (default 400ms, configurable via the Settings
menu). The Monaco theme tracks the resolved color scheme.

## Color scheme

Auto / Light / Dark, toggled from the Settings menu, persisted under
`state.view.colorScheme`.

`components/useResolvedColorScheme.ts` splits into two hooks:

- `useResolvedColorScheme(pref)` resolves `'auto'` against
  `matchMedia('(prefers-color-scheme: dark)')` and returns
  `'light' | 'dark'`.
- `useApplyColorScheme(resolved)` sets `data-color-scheme` on `<html>` and
  swaps the PrimeReact theme `<link>` href from
  `themes/lara-light-indigo/theme.css` to `themes/lara-dark-indigo/theme.css`
  (with a `<link rel="preload">` step to minimize FOUC).

Component-level styling reads CSS tokens defined in `src/index.css`
(`--surface-*`, `--tab-*`, `--vc-*`, `--viewer-bg`, etc.), so adding a new
panel doesn't require dark-mode bookkeeping in JS — just use the tokens.

## Export

Three export paths in `state/model.ts`:

- **glTF / GLB**: OpenSCAD outputs an OFF, then `io/export_glb.ts` builds a
  glTF document (`@gltf-transform`) so the viewer gets proper materials,
  connected components, and transparency for `%` modifiers.
- **3MF**: OpenSCAD outputs an OFF, `io/components.ts` decomposes it into
  connected components, layer-color config is mapped onto vertices via
  `io/recolor.ts`, and `io/export_3mf.ts` packs the result into the 3MF
  archive (a zip).
- **Direct**: STL / DXF / SVG / etc. — OpenSCAD writes the format natively,
  the bytes go straight to a download blob.

## Tests

- `npm run test:unit` (vitest): pure-function units. Camera math
  (`CameraController.test.ts`) and customizer reconciliation
  (`customizer-reconcile.test.ts`).
- `npm run test:e2e` (jest + puppeteer): end-to-end harness that boots the
  app, types into the editor, and verifies rendering.

## License and self-hosting

Short version: **yes, you can run this on your own server**. It's GPL — free
software in the FSF sense — and self-hosting is explicitly allowed.

The longer version, because GPL has obligations:

- The app source code is licensed **GPL v2 or later**, and is *deployed* as
  **GPL v3** because the WASM it ships links against GPLv3 and Apache-2.0
  components (OpenSCAD core, CGAL, Manifold).
- The shipped JS bundle counts as **distribution**. Anyone whose browser loads
  your page is receiving the program. Under GPL you must therefore either
  ship the corresponding source alongside, or include a written offer for it.
  In practice this means **a visible "Source" link** on the page pointing to
  this repo (or your own fork of it) is enough. Keep `LICENSE.md` in your
  deployed bundle.
- Any **modifications you distribute** must be GPL too. Local edits you don't
  publish are fine, but the moment your modified version is hosted publicly,
  the corresponding source for *your* version has to be obtainable by the
  visitors of your site.
- **Keep the attribution and license notices** intact: `LICENSE.md` and the
  vendored license files (e.g. `LICENSE.monaco`) at the repo root, the
  in-page links to OpenSCAD / Manifold / PrimeReact, and the GPL headers in
  source files.
- **GPL vs AGPL**: this is GPL v3, not AGPL. The "must offer source over the
  network" clause that's specific to AGPL does **not** apply here. But
  because the browser literally downloads the bundle, ordinary GPL
  distribution obligations *do* apply.
- **Trademark / branding**: "OpenSCAD" is the upstream project's name. You
  can rename your fork freely, but don't imply official endorsement.
- **Hosting and monetization**: GPL doesn't restrict commercial use. You can
  charge for hosting, ads, support, etc. You just can't impose further
  restrictions on the recipients of the program.

The bundled SCAD libraries have their own licenses (LGPL, BSD, MIT, GPL,
CC0). They are *not* linked into the WASM — they're loaded as data when the
user includes them. `LICENSE.md` lists each one with its terms; ship that
file as-is.
