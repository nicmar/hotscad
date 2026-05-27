# OpenSCAD Playground Local Fork: UX & Local-File Workflow Modifications

**Date:** 2026-05-26
**Status:** Approved (brainstorming complete)
**Repo baseline:** Tarball of `openscad/openscad-playground` main, extracted to `/workspace`. Upstream remote: `https://github.com/openscad/openscad-playground.git`. (Sandbox prevents `git init`; user will initialize git themselves after the implementation is complete.)

## Goals

Three behavior changes to the OpenSCAD Playground, intended for personal use against a local working copy:

1. **Mouse remap in the 3D viewer.** RMB drag rotates. LMB drag pans. MMB drag pans. Shift+LMB drag rotates (trackpad convenience). Wheel still zooms. Touch: 1-finger rotate, pinch zoom, 2-finger pan. Right-click context menu suppressed inside the viewer.
2. **Load and watch a local file.** Pick a local `.scad` file from disk; the editor auto-reloads its content whenever the file changes externally; customizer parameter overrides survive the reload (with reconciliation when the SCAD file's param set changes).
3. **Preserve camera view across edits and param changes.** When the rendered model is replaced (because the user edited code or moved a param slider), the viewer's orbit, target, and zoom must not reset.

Non-goals:

- Building any GitHub remote or PR workflow.
- Exposing remappable controls in the UI (mapping is hard-coded).
- Cross-tab/cross-window file sync.
- Watching `include <...>` / `use <...>` siblings (only the primary file).
- Surviving the watched-file handle across full browser closes (we *do* persist across reloads via IndexedDB; we do *not* guarantee survival across browser/OS restarts since permission may require re-grant).

## Current code reality (key facts that constrain the design)

- Viewer is in `src/components/ViewerPanel.tsx`. It renders `<model-viewer>` (Google web component) with `camera-controls` attribute and **a hardcoded `camera-orbit={originalOrbit}` prop set on every React render** (line 216). This is the camera-reset bug: each re-render re-applies the initial orbit.
- Customizer state in `src/state/app-state.ts` already separates **defaults** (`state.parameterSet.parameters[].initial`) from **overrides** (`state.params.vars: {[name]: any}`). `CustomizerPanel.tsx` reads override via `(state.params.vars ?? {})[param.name]` and falls back to `param.initial`. Setting an override calls `model.setVar(name, value)` in `src/state/model.ts`, which triggers a preview render.
- `model.ts` defines `openFile`, `source` getter/setter, `setVar`, `processSource`, `checkSyntax`, `render`. `source` setter triggers `processSource()` which re-runs the syntax checker (populating `parameterSet`) and re-renders.
- `model-viewer` exposes `getCameraOrbit()` returning `{theta, phi, radius, toString()}`, `getCameraTarget()` returning `{x, y, z}`, and accepts `cameraOrbit = "..."` and `cameraTarget = "..."` assignments at runtime (already used in `ViewerPanel.tsx` lines 116-119 and 156-157 for axes-viewer sync).
- `state.params.sources` is a `Source[]` of `{path, content?, url?}`. `state.params.activePath` selects the active source.

## Approach

### Feature A: Mouse remap (overlay + camera API)

Implementation strategy: **disable `<model-viewer>`'s built-in `camera-controls` and drive the camera ourselves via its public API.** This is cleaner than synthesizing pointer events with adjusted modifier flags (the alternative approach), because model-viewer's input handling is undocumented and version-fragile, while `cameraOrbit` and `cameraTarget` setters are public.

New module: `src/components/CameraController.ts`.

Exports `attachCameraController(modelViewerEl: HTMLElement): () => void` — a function that wires pointer/wheel/touch/contextmenu listeners and returns a cleanup function.

Inside `ViewerPanel.tsx`:
- Remove the `camera-controls` attribute on the main `<model-viewer>`.
- Remove the hardcoded `camera-orbit={originalOrbit}` prop (this also fixes Feature C).
- In a `useEffect` keyed on the main viewer ref, call `attachCameraController(modelViewerRef.current, {axesViewerRef})` and return the cleanup.
- Keep the axes viewer wired exactly as before (it currently has `disable-pan`, `disable-zoom`, `disable-tap` and uses a click-to-cycle handler; that behavior is unchanged).
- **Replace** the existing `camera-change` cross-sync (`ViewerPanel.tsx:113-125`): with `camera-controls` removed on the main viewer, model-viewer's internal SmoothControls no longer fires `camera-change` events with `source: 'user-interaction'`, so the current guard (`if (e.detail.source === 'user-interaction')`) silently breaks the main→axes sync. Two options, both safe:
  1. *Drop the source guard* for the main→axes direction (cheapest).
  2. *Have CameraController push to axes directly* — on every camera update, also write `axesViewerRef.current.cameraOrbit = mainOrbit.toString()` (more explicit; preferred).
  We will go with option 2. Pass `axesViewerRef` to `attachCameraController` and update both viewers in one place.

Behavior table (mouse):

| Input | Action |
|---|---|
| LMB drag | Pan |
| Shift+LMB drag | Rotate |
| MMB drag | Pan |
| RMB drag | Rotate |
| Wheel | Zoom (radius scaled by 1.1^direction) |
| Right-click | Context menu suppressed (preventDefault on `contextmenu`) |

Behavior table (touch):

| Input | Action |
|---|---|
| 1-finger drag | Rotate |
| 2-finger drag | Pan |
| Pinch | Zoom |

Math:

model-viewer convention: Y is up; `theta` is azimuth around +Y; `phi` is polar measured **from +Y** (phi=0 is top, phi=PI is bottom, phi=PI/2 is equator). Camera position relative to target: `cam = r * (sin(phi)*sin(theta), cos(phi), sin(phi)*cos(theta))`.

- **Rotate**: `theta -= dx * 0.005; phi -= dy * 0.005`. Clamp `phi` to `[0.01, PI - 0.01]` to prevent flipping.
- **Pan**:
  - `right = (cos(theta), 0, -sin(theta))` — derived as `normalize(d cam / d theta)`.
  - `up = (-cos(phi)*sin(theta), sin(phi), -cos(phi)*cos(theta))` — derived as `-normalize(d cam / d phi)` (negation because increasing phi moves camera *down* on screen).
  - `target -= dx * panScale * right` (drag right → world point stays under cursor → target shifts left).
  - `target += dy * panScale * up` (screen-down drag → +dy → world point stays under cursor → target shifts up in world).
  - `panScale = radius * 0.001`.
  - **Sanity checks** (encoded as unit tests in `CameraController.test.ts`):
    - At `phi=PI/2, theta=0`: `right=(1,0,0)`, `up=(0,1,0)`. Camera at `(0,0,r)` looking at origin, world +Y straight up on screen.
    - At `phi=PI/2, theta=PI/2`: `right=(0,0,-1)`, `up=(0,1,0)`. Camera at `(r,0,0)`, +Y still up on screen.
    - At `phi=PI/2, theta=PI/4`: `right=(√2/2, 0, -√2/2)`, `up=(0,1,0)`. Off-axis case, catches sign errors in `right`.
    - At `phi=PI/4, theta=0`: `right=(1,0,0)`, `up=(0, √2/2, -√2/2)`. Up has both +Y and -Z components (we're looking down from northeast).
- **Zoom (wheel)**: `radius *= e.deltaY > 0 ? 1.1 : 1/1.1` (wheel down = zoom out, conventional). Clamp to a captured-at-first-load range: `[0.01 * frameRadius, 100 * frameRadius]` where `frameRadius` is `el.getCameraOrbit().radius` at the first `load` event (before any user input). Reason: with `camera-controls` removed, model-viewer's `auto` framing radius is not enforced; we capture it once and bound around it.
- **Zoom (pinch)**: `radius *= prevDistance / currDistance`. Same clamp.

**Event hygiene constraints (added per spec review):**
- Call `preventDefault()` only on `contextmenu` and `wheel`. **Do not** preventDefault on `mousedown` / `mouseup` / `pointerdown` / `pointerup` — the existing window-level `mousedown` / `mouseup` listeners in `ViewerPanel.tsx:162-169` drive the axes-viewer click-cycle behavior. Use `stopPropagation()` if needed, never `preventDefault()` on those.
- Pointer capture via `setPointerCapture(e.pointerId)` and release on `pointerup` / `pointercancel`.

Touch implementation uses Pointer Events with `pointerType === 'touch'` and tracks active pointers in a `Map<pointerId, {x, y}>`. When the active-pointer count is 1, it's rotate; 2, it's pan + pinch zoom (computed from the centroid delta and inter-pointer distance change).

Pointer capture is set on the model-viewer element on `pointerdown` so drags continue if the cursor leaves the element. Drag end is on `pointerup` or `pointercancel`.

`contextmenu` listener calls `preventDefault()` so RMB drag never raises the OS menu.

### Feature B: Local file load + watch + override reconciliation

New module: `src/io/local_file_watcher.ts`.

Exports:

```ts
export type LocalFileSession = {
  fileName: string;
  handle: FileSystemFileHandle | null; // null for fallback mode
  read(): Promise<string>;
  onChange(callback: (content: string) => void): () => void; // returns unsubscribe
  stop(): void;
};

export async function openLocalFile(): Promise<LocalFileSession | null>;
export async function restoreLastLocalFile(): Promise<LocalFileSession | null>;
```

**Path A (Chromium):**
- `openLocalFile()` calls `showOpenFilePicker({types: [{accept: {'application/x-openscad': ['.scad']}}]})`, gets a `FileSystemFileHandle`.
- Verify/request `readwrite`-or-`read` permission.
- Persist the handle in IndexedDB (key `"localFileHandle"`) so the session can be restored on reload (subject to permission re-grant, which Chromium prompts for automatically when permission is `prompt`).
- Start a polling loop: every 500ms, call `handle.getFile()`, compare `.lastModified` to the previously seen value. On change, read text and call all `onChange` callbacks. Skip if a read is already in flight.
- `stop()` clears the interval.

**Path B (Firefox/Safari fallback):**
- `openLocalFile()` uses an `<input type="file" accept=".scad">` ad-hoc element (or accepts a `File` from drag-drop). Returns a session where `handle` is `null` and `read()` returns the cached text from the initial selection.
- No polling. The UI must show a visible **"Reload from disk"** button that re-opens the file picker, or accept drag-drop of the same file again.
- `restoreLastLocalFile()` returns `null` (we cannot persist `File` objects).

**Detection of which path to use:** `'showOpenFilePicker' in window`.

**UI surface (in `EditorPanel.tsx` toolbar or as a new control near `FilePicker`):**
- Button: "Open Local File…" → calls `openLocalFile()`.
- When a session is active, show the filename and a small indicator:
  - Chromium: green "watching" dot.
  - Fallback: orange "manual reload" indicator with a refresh button that calls `read()` again.
- Button to detach: closes session, clears IndexedDB.

**Multiple-open behavior:** If the user clicks "Open Local File…" while a session is already active, the existing session is stopped (polling cancelled, IndexedDB entry replaced) and the new file becomes the watched one. No prompt, no merge.

**Integrating with model state:**
- New optional state field: `state.params.watchedLocalFile?: {name: string, lastModified: number}` — purely informational, used for UI. The actual `LocalFileSession` lives in a `useRef` inside a new `useLocalFileWatcher(model)` hook (it's not serializable).
- On `openLocalFile()` success: the session's initial content is loaded into `state.params.sources` under a fixed path (e.g., `/local.scad` or `/${fileName}`), and `state.params.activePath` is set to that path. The watched-file metadata is written into state.
- On file change: the hook calls `model.source = newContent`. The existing `processSource()` machinery re-checks syntax and re-renders, populating `state.parameterSet`.

**Param override reconciliation:**

Add `reconcileVarsWithParameterSet(vars, parameterSet, isExternalReload)` as a **pure function** in a new module `src/state/customizer-reconcile.ts`. It returns `{vars: newVars, removed: string[], typeChanged: string[]}`.

It is invoked from **inside `model.checkSyntax()` immediately after the mutate that sets `state.parameterSet`** — NOT from `processSource()`. Reason: `processSource()` calls `checkSyntax()` without awaiting (`model.ts:181`) and then schedules `render()` (line 183); if reconciliation lived in `processSource` it would race the render. It must live where `parameterSet` actually lands in state.

**The `isExternalReload` flag is plumbed through these entry points:**

| Entry point in `model.ts` | Default | When `true` |
|---|---|---|
| `init()` (model.ts:24) | `false` | — |
| `set source` (model.ts:159) | `false` | — (user edit in Monaco) |
| `openFile()` (model.ts:121) | `false` | — (switching active source within VFS) |
| **new** `loadExternalSource(content)` | `true` | called only by the local-file-watcher hook |

Plumbing: `processSource(isExternalReload = false)` → `checkSyntax(isExternalReload = false)`. The new `loadExternalSource(content: string)` method:
```ts
async loadExternalSource(content: string) {
  // mutate() returns true iff state actually changed (model.ts:36-46).
  if (this.mutate(s => {
    s.params.sources = s.params.sources.map(src =>
      src.path === s.params.activePath ? {...src, content} : src);
  })) {
    await this.processSource(/*isExternalReload=*/ true);
  }
}
```
Note: `processSource` becomes `async` and the local edit path (`set source`) keeps fire-and-forget; only the external-reload path awaits.

Why guard on origin: if the user is mid-edit in Monaco, we don't want to drop their override just because syntax is momentarily invalid. For local in-editor edits, reconciliation runs in a **lighter mode** that only drops overrides for params explicitly missing from the new set (it does not drop type-mismatched overrides; user might still be typing).

**Note on alternative (debounced) design:** A simpler alternative is a single mode that always reconciles after a "no edits for 750ms" debounce. We've gone with the two-mode approach because the external-reload path is naturally one-shot (no debounce needed) and the in-editor path benefits from skipping type checks during transient invalid states. If the two-mode logic causes confusion in practice, we'll switch to the debounce.

The reconciliation rules (matches what the user approved in brainstorming):

1. For each entry in `state.params.vars`:
   - If no param with that name exists in the new `parameterSet`: drop the override.
   - If the param exists but its **type** differs from the override's runtime type (number → string, etc.): drop the override; on external reload only, surface a toast "Param `X` reset (type changed)".
   - Otherwise: keep the override.
2. New params or unchanged-default params with no override: no action (the customizer naturally falls back to `param.initial`).
3. Changed default for an un-overridden param: no action needed; `param.initial` flows from `parameterSet` automatically.

Type detection: a runtime helper `vartype(v): 'number' | 'string' | 'boolean' | 'array' | 'unknown'`. Compared against `parameter.type` (already typed in `customizer-types.ts`).

### Feature C: Preserve view/zoom across re-renders

The fix is mostly subtractive:

1. **Remove the hardcoded `camera-orbit={originalOrbit}` prop** on the main `<model-viewer>` in `ViewerPanel.tsx`. Set the initial orbit imperatively via `useEffect` on first mount only, not on every render.
2. **Capture before commit; restore after load.** model-viewer does *not* reset its camera DOM attributes synchronously when `src` changes — the camera persists in the DOM until the new GLB finishes loading and (potentially) auto-reframes. We exploit this: a `useLayoutEffect` cleanup runs **before** the next effect for the new `modelUri` commits, so at that moment the DOM still holds the previous model's camera. Code sketch:

   ```ts
   const stashedCameraRef = useRef<{orbit: string; target: string} | null>(null);

   useLayoutEffect(() => {
     // No-op on mount; the cleanup is what captures.
     return () => {
       const el = modelViewerRef.current;
       if (!el) return;
       stashedCameraRef.current = {
         orbit: el.getCameraOrbit().toString(),
         target: el.getCameraTarget().toString(),
       };
     };
   }, [modelUri]);
   ```

   In the existing `onLoad` callback (after the thumbhash capture, before yielding to user input), restore if a stash exists:
   ```ts
   if (stashedCameraRef.current && modelViewerRef.current) {
     modelViewerRef.current.cameraOrbit = stashedCameraRef.current.orbit;
     modelViewerRef.current.cameraTarget = stashedCameraRef.current.target;
   }
   ```

   The stash is `null` on first load — no restoration happens, so the model frames naturally.
3. **No key churn.** Verified during review: `PanelSwitcher.tsx:39` keys panel containers by `id`, but `<model-viewer>` itself receives no `key`. No fix needed; just don't introduce one.

**Interaction with `onLoad` thumbhash capture (ViewerPanel.tsx:85-97):** the existing `onLoad` already calls `toDataURL` and writes a `preview` to state. We hook *after* that step — restoration must happen before the user can interact, but the thumbhash capture is fine to run first (it's a single GPU readback).

Persistence across full page reloads is already implemented elsewhere in the codebase via `StatePersister` and `fragment-state.ts`. We are *not* extending that to camera state in this work; we only ensure intra-session camera stability.

## Files touched

- **New**: `src/components/CameraController.ts` (~200 lines).
- **New**: `src/io/local_file_watcher.ts` (~150 lines).
- **New**: `src/components/useLocalFileWatcher.ts` (hook, ~80 lines).
- **New**: `src/components/LocalFileButton.tsx` (UI button + indicator, ~80 lines).
- **Edit**: `src/components/ViewerPanel.tsx` — remove hardcoded `camera-orbit`, remove `camera-controls`, wire `CameraController`, add src-swap orbit/target preservation.
- **Edit**: `src/state/model.ts` — make `processSource` and `checkSyntax` accept an `isExternalReload` flag (default `false`); invoke reconciliation inside `checkSyntax` after the mutate that sets `parameterSet`; add public `loadExternalSource(content: string)` method used by the file watcher.
- **New**: `src/state/customizer-reconcile.ts` — pure `reconcileVarsWithParameterSet(vars, parameterSet, isExternalReload) → {vars, removed, typeChanged}`.
- **Edit**: `src/state/app-state.ts` — add optional `params.watchedLocalFile?: {name, lastModified}` field.
- **Edit**: `src/components/EditorPanel.tsx` — mount `<LocalFileButton />` in the toolbar.
- **No edit**: `CustomizerPanel.tsx` (override semantics already use `vars` correctly).

## Testing strategy

The repo has Jest + Puppeteer (`jest-puppeteer.config.js`, `tests/`). The high-value tests we will add:

1. **Unit (vitest/jest)** for `reconcileVarsWithParameterSet`:
   - Drops missing-name overrides.
   - Keeps type-matching overrides.
   - Drops type-mismatched overrides on external reload.
   - Pure function over `(vars, parameterSet, isExternalReload) → newVars`.
2. **Unit** for `CameraController` math helpers (rotate clamp, pan vector derivation given known theta/phi).
3. **Manual smoke** (documented, not automated since model-viewer + WASM is heavy):
   - Open a `.scad`, edit slowly while orbiting — camera does not jump.
   - Drag RMB → rotates. Drag LMB → pans. Shift+LMB → rotates. Wheel → zooms. Right-click does not show OS menu.
   - On Chromium: open local file, edit it externally with another editor, see auto-reload within ~500ms; toggle a customizer param, edit file again, override survives. Remove that param from the file, override is dropped silently (toast in case of type change).
   - On Firefox/Safari: "Open Local File…" still works through `<input type=file>` path; auto-reload is disabled; manual reload button works.

We will not invest in E2E Puppeteer coverage for the mouse remap — it's both fragile (real input events on web components) and not worth the time for personal use.

## Open risks

- **model-viewer pointer event capture inside shadow DOM.** Need to verify pointer events on the host element are sufficient and that we don't need to dig into the shadow root. If they aren't, the fallback is dispatching the listeners on a sibling overlay `<div>` with `pointer-events: auto` placed above `<model-viewer>`. Both alternatives are cheap; we'll start with host-element listeners and switch if needed.
- **Permission re-prompt UX on Chromium.** `requestPermission()` requires a user gesture; we'll trigger it from the "Open Local File…" button click (which is always user-gestured) and surface a clear error toast if the user denies.
- **Polling 500ms cost.** Negligible for a single file; `handle.getFile()` is fast in Chromium. Polling stops when the session ends.

## Rollout

Single development branch (no PR upstream). Order of work: Feature C fix first (subtractive, low-risk, immediate value), then Feature A (mouse remap), then Feature B (file watching + reconciliation). Each phase ships independently to keep the working tree always-runnable.
