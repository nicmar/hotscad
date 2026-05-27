# OpenSCAD Playground Mods Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three behavior changes to a local fork of `openscad-playground` — camera state preserved across edits, RMB-rotate / LMB-MMB-pan mouse remap, and local file watching with customizer-override reconciliation.

**Architecture:** Pure-function modules where possible (camera math, override reconciliation). DOM-side modules (`CameraController`, `local_file_watcher`) own all browser-API interactions. React components stay thin wrappers. `<model-viewer>` is driven via its public `cameraOrbit` / `cameraTarget` setters instead of its built-in `camera-controls` attribute.

**Tech Stack:** React 18, TypeScript, Webpack, PrimeReact, `@google/model-viewer`. New: `vitest` for unit tests of pure functions. File watching uses File System Access API (Chromium) with `<input type=file>` fallback.

**Spec:** `/workspace/docs/superpowers/specs/2026-05-26-openscad-playground-mods-design.md`

---

## Sandbox notes

- **Git is blocked in this sandbox.** `git init`, `git add`, `git commit` all error. Commit steps in this plan are kept for documentation and for when the user initializes git themselves. During execution, **announce each "commit" step but do not run `git`**; the implementer should instead write a short log line saying "would commit: <message>".
- **`npm run build:libs` likely fails in the sandbox** because it requires `git clone` for OpenSCAD libraries. The dev server (`npm run start`) can still start but the WASM runtime won't be available — actual rendering won't work end-to-end inside the sandbox. The user will run `build:libs` outside the sandbox afterwards. Verification of feature behavior is therefore code-review based + targeted unit tests, with manual browser testing deferred to the user.
- **`timeout 30 npm run start` exits non-zero from the timeout itself.** Smoke checks should not rely on exit code; instead, search the captured output for actual webpack error markers (`Module not found`, `Type error`, `SyntaxError`). The implementer should grep accordingly when interpreting Step 5 of Task 2.3 / Step 5 of Task 3.5.
- **`processSource` becomes `async` in Task 3.2.** Existing callers (`init()`, `openFile()`, `set source`) currently fire-and-forget. After the change they will produce floating-promise lint warnings (or worse, swallow rejections). The implementer should leave the existing call sites unchanged (they remain functionally correct: the now-async `processSource` is still kicked off without `await`) but if the project enables `@typescript-eslint/no-floating-promises`, suppress with `void this.processSource()` at those call sites. Do not change call-site semantics beyond making the floating-promise explicit.
- **React hooks dependency on `ref.current`:** the existing codebase uses `[modelViewerRef.current, ...]` as effect deps, which is a known React anti-pattern (refs don't trigger re-renders). The plan continues this pattern for consistency. Do not "fix" this unilaterally — it's outside scope and the existing code relies on parent re-renders to re-fire the effects.

---

## File Structure

**New files:**

- `src/state/customizer-reconcile.ts` — pure `reconcileVarsWithParameterSet`.
- `src/state/customizer-reconcile.test.ts` — vitest unit tests.
- `src/components/CameraController.ts` — pointer/wheel/touch handlers + math helpers; exports `attachCameraController(modelViewerEl, axesViewerEl, opts) → cleanup`.
- `src/components/CameraController.test.ts` — vitest unit tests for math helpers.
- `src/io/local_file_watcher.ts` — `openLocalFile`, `restoreLastLocalFile`, IndexedDB helpers, polling loop.
- `src/components/useLocalFileWatcher.ts` — React hook bridging `LocalFileSession` to `model.loadExternalSource`.
- `src/components/LocalFileButton.tsx` — UI button + status indicator.
- `vitest.config.ts` — minimal unit-test config (does not collide with the existing Jest+Puppeteer E2E setup).

**Modified files:**

- `src/components/ViewerPanel.tsx` — remove hardcoded `camera-orbit`, remove `camera-controls`, wire `CameraController`, add stash/restore for orbit+target across `src` swaps.
- `src/state/model.ts` — make `processSource`/`checkSyntax` accept `isExternalReload`, invoke reconciliation inside `checkSyntax`, add `loadExternalSource(content)`.
- `src/state/app-state.ts` — add optional `params.watchedLocalFile?: {name, lastModified}`.
- `src/components/EditorPanel.tsx` — mount `<LocalFileButton />`.
- `package.json` — add `vitest` and `@vitest/expect` (or equivalent) as devDeps; add `test:unit` script.

---

## Phase 0 — Bootstrap

### Task 0.1: Install dependencies

**Files:** none modified.

- [ ] **Step 1:** Run `cd /workspace && npm install` and confirm it completes without unrecoverable errors (peer-dep warnings are OK; missing prebuilt binaries for puppeteer are OK).

Run:
```bash
cd /workspace && npm install 2>&1 | tail -30
```
Expected: `added N packages` or similar success message. If puppeteer fails to download Chromium, that's expected in the sandbox and does not block this work — the E2E tests aren't being modified.

- [ ] **Step 2:** Verify TypeScript compiles the existing codebase.

Run:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -20
```
Expected: no errors, or at most warnings about declaration files. If errors exist on `main`, capture them as baseline so we can distinguish from regressions.

- [ ] **Step 3 (commit, sandbox-skipped):** Would commit: `chore: npm install baseline`.

### Task 0.2: Add vitest for unit tests

**Files:**
- Modify: `package.json`
- Create: `vitest.config.ts`

- [ ] **Step 1:** Install vitest as a dev dep.

Run:
```bash
cd /workspace && npm install --save-dev vitest@^2 2>&1 | tail -10
```
Expected: package added.

- [ ] **Step 2:** Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    exclude: ['tests/**'], // tests/ is the existing puppeteer suite
    environment: 'node',
    globals: false,
  },
});
```

- [ ] **Step 3:** Add a `test:unit` script to `package.json` scripts:

```json
"test:unit": "vitest run"
```

(Insert after the existing `"test:e2e": "jest"` line.)

- [ ] **Step 4:** Run vitest with no tests to confirm setup.

Run:
```bash
cd /workspace && npm run test:unit 2>&1 | tail -10
```
Expected: `No test files found` (this is success; vitest will pick tests up once we add them).

- [ ] **Step 5 (commit, sandbox-skipped):** Would commit: `chore: add vitest for unit tests`.

---

## Phase 1 — Feature C (camera persistence)

This phase is intentionally first: it is purely subtractive + a small addition, validates the workflow, and provides immediate user value.

### Task 1.1: Strip hardcoded camera-orbit + add stash/restore

**Files:**
- Modify: `src/components/ViewerPanel.tsx`

- [ ] **Step 1:** Read the current `ViewerPanel.tsx` end-to-end to locate the precise lines to change. Confirm `camera-orbit={originalOrbit}` is at line 216 and the main `<model-viewer>` element spans lines 205-226.

- [ ] **Step 2:** Remove the hardcoded `camera-orbit={originalOrbit}` prop from the **main** `<model-viewer>` element (line 216). Leave it on the axes viewer (line 240) — the axes viewer's orbit is driven separately and resetting it to the default on every render is harmless and even desirable.

- [ ] **Step 3:** Add a `useRef<{orbit: string; target: string} | null>(null)` right under the existing `useRef`s near line 60: `const stashedCameraRef = useRef<{orbit: string; target: string} | null>(null);`.

- [ ] **Step 4:** Add a `useLayoutEffect` whose cleanup function captures the pre-swap camera, keyed on `modelUri`:

```tsx
useLayoutEffect(() => {
  return () => {
    const el = modelViewerRef.current;
    if (!el) return;
    try {
      stashedCameraRef.current = {
        orbit: el.getCameraOrbit().toString(),
        target: el.getCameraTarget().toString(),
      };
    } catch {
      // model-viewer may not be initialized yet
    }
  };
}, [modelUri]);
```

Place this after the existing `onLoad` and `camera-change` effects.

- [ ] **Step 5:** Extend the existing `onLoad` callback (lines 85-97) to restore the stashed camera **as early as possible** — immediately after `setLoadedUri(modelUri)`, BEFORE the `await modelViewerRef.current.toDataURL(...)` line. Reason: model-viewer can auto-reframe between `load` and any awaited work, so the restoration must happen synchronously inside the same microtask. Place this block right after `setLoadedUri(modelUri);` (currently line 86):

```ts
if (stashedCameraRef.current && modelViewerRef.current) {
  try {
    modelViewerRef.current.cameraOrbit = stashedCameraRef.current.orbit;
    modelViewerRef.current.cameraTarget = stashedCameraRef.current.target;
  } catch {
    // restoration failed, ignore
  }
}
```

Do NOT place this after the `await` — by then auto-reframing may have already shifted the camera.

- [ ] **Step 6:** Import `useLayoutEffect` in the file's React import line.

- [ ] **Step 7:** Re-run TypeScript:

```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 8 (commit, sandbox-skipped):** Would commit: `fix(viewer): preserve camera orbit/target across re-renders and src swaps`.

---

## Phase 2 — Feature A (mouse remap)

### Task 2.1: Pure camera-math helpers + tests (TDD)

**Files:**
- Create: `src/components/CameraController.ts` (math helpers section only)
- Create: `src/components/CameraController.test.ts`

- [ ] **Step 1:** Write the failing test file `src/components/CameraController.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { sphericalBasis, clampPhi, clampRadius } from './CameraController';

const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) < eps;
const closeVec = (a: number[], b: number[]) => a.every((v, i) => close(v, b[i]));

describe('sphericalBasis', () => {
  it('phi=PI/2, theta=0 (front view)', () => {
    const { right, up } = sphericalBasis(0, Math.PI / 2);
    expect(closeVec(right, [1, 0, 0])).toBe(true);
    expect(closeVec(up, [0, 1, 0])).toBe(true);
  });

  it('phi=PI/2, theta=PI/2 (right view)', () => {
    const { right, up } = sphericalBasis(Math.PI / 2, Math.PI / 2);
    expect(closeVec(right, [0, 0, -1])).toBe(true);
    expect(closeVec(up, [0, 1, 0])).toBe(true);
  });

  it('phi=PI/2, theta=PI/4 (off-axis horizontal)', () => {
    const { right, up } = sphericalBasis(Math.PI / 4, Math.PI / 2);
    const s2 = Math.SQRT2 / 2;
    expect(closeVec(right, [s2, 0, -s2])).toBe(true);
    expect(closeVec(up, [0, 1, 0])).toBe(true);
  });

  it('phi=PI/4, theta=0 (looking down from north)', () => {
    const { right, up } = sphericalBasis(0, Math.PI / 4);
    const s2 = Math.SQRT2 / 2;
    expect(closeVec(right, [1, 0, 0])).toBe(true);
    expect(closeVec(up, [0, s2, -s2])).toBe(true);
  });
});

describe('clampPhi', () => {
  it('clamps to (0.01, PI - 0.01)', () => {
    expect(clampPhi(-1)).toBe(0.01);
    expect(clampPhi(Math.PI)).toBeCloseTo(Math.PI - 0.01);
    expect(clampPhi(1)).toBe(1);
  });
});

describe('clampRadius', () => {
  it('clamps to [0.01*frame, 100*frame]', () => {
    expect(clampRadius(0.001, 10)).toBe(0.1);
    expect(clampRadius(99999, 10)).toBe(1000);
    expect(clampRadius(15, 10)).toBe(15);
  });
});
```

- [ ] **Step 2:** Run the test, expect failure (module not found).

```bash
cd /workspace && npm run test:unit -- CameraController 2>&1 | tail -15
```
Expected: failure with "Cannot find module" or similar.

- [ ] **Step 3:** Create `src/components/CameraController.ts` with the pure helpers only (event wiring comes next task):

```ts
// Pure math helpers for the camera controller.

export function sphericalBasis(theta: number, phi: number): { right: [number, number, number]; up: [number, number, number] } {
  // model-viewer convention: Y is up; theta is azimuth around +Y;
  // phi is polar measured from +Y (0 = top, PI/2 = equator, PI = bottom).
  // right  = normalize(d cam / d theta)
  // up     = -normalize(d cam / d phi)
  const ct = Math.cos(theta), st = Math.sin(theta);
  const cp = Math.cos(phi),   sp = Math.sin(phi);
  return {
    right: [ct, 0, -st],
    up:    [-cp * st, sp, -cp * ct],
  };
}

export function clampPhi(phi: number): number {
  const min = 0.01, max = Math.PI - 0.01;
  return Math.min(max, Math.max(min, phi));
}

export function clampRadius(radius: number, frameRadius: number): number {
  const min = 0.01 * frameRadius, max = 100 * frameRadius;
  return Math.min(max, Math.max(min, radius));
}
```

- [ ] **Step 4:** Run the test, expect pass.

```bash
cd /workspace && npm run test:unit -- CameraController 2>&1 | tail -15
```
Expected: `4 passed` for sphericalBasis, `1 passed` each for clampPhi and clampRadius (6 total).

- [ ] **Step 5 (commit, sandbox-skipped):** Would commit: `feat(viewer): add pure camera-math helpers for custom controls`.

### Task 2.2: CameraController event wiring

**Files:**
- Modify: `src/components/CameraController.ts` (append event-handler code)

This task adds the imperative event-handling code below the pure helpers. There are no unit tests here (DOM-bound, integration-tested manually).

- [ ] **Step 1:** Append to `CameraController.ts`:

```ts
type AttachOptions = {
  // The axes viewer to mirror orbit changes into. May be null.
  axesViewerEl?: HTMLElement | null;
};

type ModelViewerEl = HTMLElement & {
  getCameraOrbit: () => { theta: number; phi: number; radius: number; toString: () => string };
  getCameraTarget: () => { x: number; y: number; z: number; toString: () => string };
  cameraOrbit: string;
  cameraTarget: string;
};

export function attachCameraController(
  modelViewerEl: ModelViewerEl,
  opts: AttachOptions = {}
): () => void {
  const el = modelViewerEl;
  let frameRadius = NaN; // captured on first load

  // Capture frameRadius once on the first load event.
  const onFirstLoad = () => {
    try {
      frameRadius = el.getCameraOrbit().radius;
    } catch {}
    el.removeEventListener('load', onFirstLoad);
  };
  el.addEventListener('load', onFirstLoad);

  type Mode = 'rotate' | 'pan' | null;
  const activePointers = new Map<number, { x: number; y: number; type: string }>();
  let mode: Mode = null;
  let lastCentroidX = 0, lastCentroidY = 0;
  let lastPinchDist = 0;

  function updateOrbit(theta: number, phi: number, radius: number) {
    const orbit = el.getCameraOrbit();
    orbit.theta = theta;
    orbit.phi = clampPhi(phi);
    orbit.radius = Number.isFinite(frameRadius) ? clampRadius(radius, frameRadius) : radius;
    const s = orbit.toString();
    el.cameraOrbit = s;
    if (opts.axesViewerEl) {
      // Axes viewer mirrors theta/phi but keeps its own radius.
      try {
        const axesAny = opts.axesViewerEl as ModelViewerEl;
        const ao = axesAny.getCameraOrbit();
        ao.theta = orbit.theta;
        ao.phi = orbit.phi;
        axesAny.cameraOrbit = ao.toString();
      } catch {}
    }
  }

  function updateTarget(x: number, y: number, z: number) {
    el.cameraTarget = `${x}m ${y}m ${z}m`;
  }

  function rotate(dx: number, dy: number) {
    const orbit = el.getCameraOrbit();
    const sens = 0.005;
    updateOrbit(orbit.theta - dx * sens, orbit.phi - dy * sens, orbit.radius);
  }

  function pan(dx: number, dy: number) {
    const orbit = el.getCameraOrbit();
    const { right, up } = sphericalBasis(orbit.theta, orbit.phi);
    const target = el.getCameraTarget();
    const scale = orbit.radius * 0.001;
    const nx = target.x - dx * scale * right[0] + dy * scale * up[0];
    const ny = target.y - dx * scale * right[1] + dy * scale * up[1];
    const nz = target.z - dx * scale * right[2] + dy * scale * up[2];
    updateTarget(nx, ny, nz);
  }

  function zoom(factor: number) {
    const orbit = el.getCameraOrbit();
    updateOrbit(orbit.theta, orbit.phi, orbit.radius * factor);
  }

  function modeForMouse(button: number, shift: boolean): Mode {
    if (button === 2) return 'rotate';                  // RMB
    if (button === 1) return 'pan';                     // MMB
    if (button === 0) return shift ? 'rotate' : 'pan';  // LMB / Shift+LMB
    return null;
  }

  function centroid(): { x: number; y: number } {
    let sx = 0, sy = 0, n = 0;
    for (const p of activePointers.values()) { sx += p.x; sy += p.y; n++; }
    return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
  }

  function pinchDistance(): number {
    const pts = Array.from(activePointers.values());
    if (pts.length < 2) return 0;
    const dx = pts[0].x - pts[1].x;
    const dy = pts[0].y - pts[1].y;
    return Math.hypot(dx, dy);
  }

  const onPointerDown = (e: PointerEvent) => {
    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    try { el.setPointerCapture(e.pointerId); } catch {}

    if (e.pointerType === 'mouse') {
      mode = modeForMouse(e.button, e.shiftKey);
    } else if (e.pointerType === 'touch' || e.pointerType === 'pen') {
      mode = activePointers.size === 1 ? 'rotate' : 'pan';
    }
    const c = centroid();
    lastCentroidX = c.x;
    lastCentroidY = c.y;
    lastPinchDist = pinchDistance();
    // Do NOT preventDefault on pointerdown; window-level mousedown drives the axes-click cycle.
  };

  const onPointerMove = (e: PointerEvent) => {
    const prev = activePointers.get(e.pointerId);
    if (!prev) return;
    prev.x = e.clientX; prev.y = e.clientY;

    if (mode == null) return;
    const c = centroid();
    const dx = c.x - lastCentroidX;
    const dy = c.y - lastCentroidY;
    lastCentroidX = c.x;
    lastCentroidY = c.y;

    // Touch: re-evaluate mode based on active pointer count (transition 1↔2 fingers)
    if (e.pointerType !== 'mouse') {
      mode = activePointers.size === 1 ? 'rotate' : 'pan';
    }

    if (mode === 'rotate') rotate(dx, dy);
    else if (mode === 'pan') pan(dx, dy);

    // Pinch zoom when two touch pointers are active.
    if (e.pointerType !== 'mouse' && activePointers.size >= 2) {
      const d = pinchDistance();
      if (lastPinchDist > 0 && d > 0) zoom(lastPinchDist / d);
      lastPinchDist = d;
    }
  };

  const onPointerUp = (e: PointerEvent) => {
    activePointers.delete(e.pointerId);
    try { el.releasePointerCapture(e.pointerId); } catch {}
    if (activePointers.size === 0) {
      mode = null;
    } else {
      // Reset baselines for remaining pointers
      const c = centroid();
      lastCentroidX = c.x;
      lastCentroidY = c.y;
      lastPinchDist = pinchDistance();
      mode = e.pointerType === 'mouse' ? null : 'rotate';
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.1 : 1 / 1.1);
  };

  const onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContextMenu);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', onContextMenu);
    el.removeEventListener('load', onFirstLoad);
  };
}
```

- [ ] **Step 2:** Re-run TypeScript:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10
```
Expected: no new errors.

- [ ] **Step 3:** Re-run unit tests (math helpers still pass):
```bash
cd /workspace && npm run test:unit -- CameraController 2>&1 | tail -15
```
Expected: math tests still pass.

- [ ] **Step 4 (commit, sandbox-skipped):** Would commit: `feat(viewer): add CameraController with custom mouse/touch input`.

### Task 2.3: Integrate CameraController in ViewerPanel

**Files:**
- Modify: `src/components/ViewerPanel.tsx`

- [ ] **Step 1:** Import the new module:
```ts
import { attachCameraController } from './CameraController';
```

- [ ] **Step 2:** Remove the `camera-controls` attribute on the **main** `<model-viewer>` (line 221). Leave it off; we drive the camera ourselves.

- [ ] **Step 3:** Replace the existing `camera-change`-mirroring effect (lines 108-126) — the `for (const ref of [...])` block — with a single effect that attaches `CameraController` to the main viewer, passing the axes viewer ref:

```tsx
useEffect(() => {
  const mv = modelViewerRef.current;
  if (!mv) return;
  const cleanup = attachCameraController(mv, { axesViewerEl: axesViewerRef.current ?? null });
  return cleanup;
}, [modelViewerRef.current, axesViewerRef.current]);
```

(The old block was bidirectional sync via `camera-change`. CameraController now pushes from main → axes explicitly. The axes-click handler at lines 129-170 already writes back to both viewers' `cameraOrbit` directly, so axes → main still works.)

- [ ] **Step 4:** Re-run TypeScript and unit tests:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10 && npm run test:unit 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 5:** Start the dev server and load the app at http://localhost:4000 (this will fail to render geometry without `build:libs` but the React app should mount).
```bash
cd /workspace && timeout 30 npm run start 2>&1 | tail -20
```
Expected: webpack-dev-server starts; no runtime React errors in the captured stderr.

- [ ] **Step 6 (commit, sandbox-skipped):** Would commit: `feat(viewer): wire CameraController, remove built-in camera-controls`.

---

## Phase 3 — Feature B (file watch + reconciliation)

### Task 3.1: Pure `reconcileVarsWithParameterSet` + tests (TDD)

**Files:**
- Create: `src/state/customizer-reconcile.ts`
- Create: `src/state/customizer-reconcile.test.ts`

- [ ] **Step 1:** Read `src/state/customizer-types.ts` to confirm the `Parameter` / `ParameterSet` shape:
```bash
cat /workspace/src/state/customizer-types.ts
```
Note the `type` field on parameters (one of `'number' | 'string' | 'boolean'`).

- [ ] **Step 2:** Write the failing test file `src/state/customizer-reconcile.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { reconcileVarsWithParameterSet, vartype } from './customizer-reconcile';
import type { ParameterSet } from './customizer-types';

const ps = (params: any[]): ParameterSet => ({ parameters: params } as any);

describe('vartype', () => {
  it('detects primitives', () => {
    expect(vartype(1)).toBe('number');
    expect(vartype('a')).toBe('string');
    expect(vartype(true)).toBe('boolean');
    expect(vartype([1, 2])).toBe('array');
    expect(vartype(null)).toBe('unknown');
    expect(vartype(undefined)).toBe('unknown');
  });
});

describe('reconcileVarsWithParameterSet', () => {
  it('keeps type-matching overrides', () => {
    const result = reconcileVarsWithParameterSet(
      { width: 20 },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      false,
    );
    expect(result.vars).toEqual({ width: 20 });
    expect(result.removed).toEqual([]);
    expect(result.typeChanged).toEqual([]);
  });

  it('drops missing-name overrides', () => {
    const result = reconcileVarsWithParameterSet(
      { width: 20, legacy: 5 },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      false,
    );
    expect(result.vars).toEqual({ width: 20 });
    expect(result.removed).toEqual(['legacy']);
  });

  it('drops type-mismatched overrides only when external reload', () => {
    const external = reconcileVarsWithParameterSet(
      { width: 'twenty' },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      true,
    );
    expect(external.vars).toEqual({});
    expect(external.typeChanged).toEqual(['width']);

    const internal = reconcileVarsWithParameterSet(
      { width: 'twenty' },
      ps([{ name: 'width', type: 'number', initial: 10 }]),
      false,
    );
    expect(internal.vars).toEqual({ width: 'twenty' });
    expect(internal.typeChanged).toEqual([]);
  });

  it('handles undefined parameterSet by leaving vars unchanged', () => {
    const result = reconcileVarsWithParameterSet({ a: 1 }, undefined, true);
    expect(result.vars).toEqual({ a: 1 });
  });

  it('handles empty/undefined vars', () => {
    expect(reconcileVarsWithParameterSet(undefined, ps([{ name: 'a', type: 'number', initial: 0 }]), true).vars).toEqual({});
    expect(reconcileVarsWithParameterSet({}, ps([{ name: 'a', type: 'number', initial: 0 }]), true).vars).toEqual({});
  });

  it('treats array overrides as type "array"', () => {
    const result = reconcileVarsWithParameterSet(
      { points: [1, 2] },
      ps([{ name: 'points', type: 'number', initial: [0, 0] }]),
      true,
    );
    // Param.type is 'number' (model-viewer's vector params), array override is allowed.
    // Implementation choice: arrays for array-default params are allowed.
    expect(result.vars).toEqual({ points: [1, 2] });
  });
});
```

- [ ] **Step 3:** Run, expect failure (module not found).
```bash
cd /workspace && npm run test:unit -- customizer-reconcile 2>&1 | tail -20
```

- [ ] **Step 4:** Create `src/state/customizer-reconcile.ts`:

```ts
import type { ParameterSet } from './customizer-types';

export type VarType = 'number' | 'string' | 'boolean' | 'array' | 'unknown';

export function vartype(v: unknown): VarType {
  if (Array.isArray(v)) return 'array';
  if (typeof v === 'number') return 'number';
  if (typeof v === 'string') return 'string';
  if (typeof v === 'boolean') return 'boolean';
  return 'unknown';
}

export type ReconcileResult = {
  vars: { [name: string]: any };
  removed: string[];
  typeChanged: string[];
};

export function reconcileVarsWithParameterSet(
  vars: { [name: string]: any } | undefined,
  parameterSet: ParameterSet | undefined,
  isExternalReload: boolean,
): ReconcileResult {
  const out: { [name: string]: any } = {};
  const removed: string[] = [];
  const typeChanged: string[] = [];

  const inputVars = vars ?? {};
  if (!parameterSet) {
    return { vars: { ...inputVars }, removed, typeChanged };
  }

  const byName = new Map<string, any>();
  for (const p of parameterSet.parameters ?? []) {
    byName.set(p.name, p);
  }

  for (const [name, value] of Object.entries(inputVars)) {
    const param = byName.get(name);
    if (!param) {
      removed.push(name);
      continue;
    }
    const vt = vartype(value);
    // Array overrides are allowed when the param's initial is also array-shaped.
    const paramIsArray = Array.isArray(param.initial);
    const typeOk = vt === param.type || (vt === 'array' && paramIsArray);
    if (!typeOk) {
      if (isExternalReload) {
        typeChanged.push(name);
        continue; // drop on external reload
      }
      // Keep on in-editor edit (user might be mid-typing).
    }
    out[name] = value;
  }

  return { vars: out, removed, typeChanged };
}
```

- [ ] **Step 5:** Run tests, expect pass:
```bash
cd /workspace && npm run test:unit -- customizer-reconcile 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 6 (commit, sandbox-skipped):** Would commit: `feat(state): pure reconcileVarsWithParameterSet`.

### Task 3.2: Wire reconciliation into `model.checkSyntax` + add `loadExternalSource`

**Files:**
- Modify: `src/state/model.ts`

- [ ] **Step 1:** Import the reconciler at the top of `model.ts`:
```ts
import { reconcileVarsWithParameterSet } from './customizer-reconcile';
```

- [ ] **Step 2:** Change `processSource(): Promise<void>` signature to `processSource(isExternalReload: boolean = false): Promise<void>` (line 165). At the end of `processSource`, where it calls `this.checkSyntax();` (line 181), change to `await this.checkSyntax(isExternalReload);`. (Making this `await` ensures reconciliation completes before the subsequent `render`.)

- [ ] **Step 3:** Change `checkSyntax(): Promise<void>` signature to `checkSyntax(isExternalReload: boolean = false): Promise<void>` (line 187). After the existing `mutate` that sets `parameterSet` (lines 194-198), add the reconciliation step:

```ts
this.mutate(s => {
  const newSet = s.parameterSet;
  const reconciled = reconcileVarsWithParameterSet(s.params.vars, newSet, isExternalReload);
  s.params.vars = reconciled.vars;
  // Surface type-change notices via a side channel later; for now keep it in console.
  if (reconciled.typeChanged.length > 0) {
    console.warn('Customizer params reset due to type change:', reconciled.typeChanged);
  }
  if (reconciled.removed.length > 0) {
    console.log('Customizer overrides dropped (no matching param):', reconciled.removed);
  }
});
```

Place this immediately after the existing checker-run mutate.

- [ ] **Step 4:** Add `loadExternalSource` method on `Model` (place near `set source`):

```ts
async loadExternalSource(content: string): Promise<void> {
  if (this.mutate(s => {
    s.params.sources = s.params.sources.map(src =>
      src.path === s.params.activePath ? { ...src, content } : src
    );
  })) {
    await this.processSource(/* isExternalReload= */ true);
  }
}
```

- [ ] **Step 5:** Type-check:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 6:** Run all unit tests:
```bash
cd /workspace && npm run test:unit 2>&1 | tail -15
```
Expected: all pass.

- [ ] **Step 7 (commit, sandbox-skipped):** Would commit: `feat(state): plumb isExternalReload, add loadExternalSource, reconcile vars`.

### Task 3.3: `LocalFileWatcher` module

**Files:**
- Create: `src/io/local_file_watcher.ts`

- [ ] **Step 1:** Create the module:

```ts
// Local-file open/watch with FileSystemAccess API (Chromium) + manual fallback.

const IDB_NAME = 'openscad-playground-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'localFileHandle';

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type LocalFileSession = {
  fileName: string;
  isWatching: boolean;
  read(): Promise<string>;
  onChange(cb: (content: string) => void): () => void;
  stop(): void;
};

export const hasFileSystemAccess = (): boolean =>
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

async function makeWatchingSession(handle: any): Promise<LocalFileSession> {
  let lastModified = -1;
  let stopped = false;
  const callbacks = new Set<(c: string) => void>();
  let polling = false;

  async function readOnce(): Promise<string> {
    const file = await handle.getFile();
    lastModified = file.lastModified;
    return await file.text();
  }

  const initial = await handle.getFile();
  lastModified = initial.lastModified;
  const fileName = initial.name;

  const intervalId = setInterval(async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const file = await handle.getFile();
      if (file.lastModified !== lastModified) {
        lastModified = file.lastModified;
        const text = await file.text();
        callbacks.forEach(cb => cb(text));
      }
    } catch (e) {
      console.warn('local file watch read failed:', e);
    } finally {
      polling = false;
    }
  }, 500);

  return {
    fileName,
    isWatching: true,
    read: readOnce,
    onChange(cb) { callbacks.add(cb); return () => callbacks.delete(cb); },
    stop() { stopped = true; clearInterval(intervalId); callbacks.clear(); },
  };
}

function makeManualSession(file: File): LocalFileSession {
  let cached: string | null = null;
  let cachedFor: File = file;

  return {
    fileName: file.name,
    isWatching: false,
    async read() {
      if (cached !== null && cachedFor === file) return cached;
      cached = await file.text();
      cachedFor = file;
      return cached;
    },
    onChange() { return () => {}; },
    stop() { /* nothing to do */ },
  };
}

export async function openLocalFile(): Promise<LocalFileSession | null> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'OpenSCAD', accept: { 'application/x-openscad': ['.scad'] } }],
        excludeAcceptAllOption: false,
        multiple: false,
      });
      const perm = await (handle as any).queryPermission?.({ mode: 'read' });
      if (perm && perm !== 'granted') {
        const req = await (handle as any).requestPermission({ mode: 'read' });
        if (req !== 'granted') return null;
      }
      await idbSet(handle).catch(() => {});
      return await makeWatchingSession(handle);
    } catch (e) {
      // User cancelled or denied.
      console.log('openLocalFile cancelled or failed:', e);
      return null;
    }
  }

  // Fallback: synthetic <input type=file>
  return await new Promise<LocalFileSession | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.scad';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? makeManualSession(file) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function restoreLastLocalFile(): Promise<LocalFileSession | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle: any = await idbGet();
    if (!handle) return null;
    const perm = await handle.queryPermission?.({ mode: 'read' });
    if (perm === 'granted') {
      return await makeWatchingSession(handle);
    }
    // Permission is 'prompt' or 'denied' — we cannot prompt without a user gesture here.
    return null;
  } catch {
    return null;
  }
}

export async function clearLastLocalFile(): Promise<void> {
  await idbDelete().catch(() => {});
}
```

- [ ] **Step 2:** Type-check:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10
```
Expected: clean (or only `any` warnings tolerable).

- [ ] **Step 3 (commit, sandbox-skipped):** Would commit: `feat(io): local file open + watch (FSA + fallback)`.

### Task 3.4: `useLocalFileWatcher` hook + state field

**Files:**
- Modify: `src/state/app-state.ts`
- Create: `src/components/useLocalFileWatcher.ts`

- [ ] **Step 1:** Add the optional watched-file field to `State`. In `src/state/app-state.ts`, inside the `params:` block, add:

```ts
watchedLocalFile?: { name: string; lastModified: number },
```

- [ ] **Step 2:** Create `src/components/useLocalFileWatcher.ts`:

```ts
import { useEffect, useRef, useState } from 'react';
import { LocalFileSession, openLocalFile, clearLastLocalFile } from '../io/local_file_watcher';
import { Model } from '../state/model';

export type LocalFileStatus = {
  fileName: string;
  isWatching: boolean;
} | null;

export function useLocalFileWatcher(model: Model | null) {
  const sessionRef = useRef<LocalFileSession | null>(null);
  const [status, setStatus] = useState<LocalFileStatus>(null);

  function stopSession() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStatus(null);
    clearLastLocalFile();
    if (model) {
      model.mutate(s => {
        delete s.params.watchedLocalFile;
        // Note: we leave the /local/<name> source in s.params.sources so the
        // user can still see and edit the loaded content. Detach is about
        // ending the *watch*, not throwing away the loaded file.
      });
    }
  }

  async function openSession() {
    if (!model) return;
    if (sessionRef.current) sessionRef.current.stop();

    const session = await openLocalFile();
    if (!session) return;

    sessionRef.current = session;
    setStatus({ fileName: session.fileName, isWatching: session.isWatching });

    const initial = await session.read();
    // Choose a dedicated VFS path so we don't clobber the current active source.
    const localPath = `/local/${session.fileName}`;

    // Add the source if not present, switch activePath, then load content
    // (which is re-applied below via loadExternalSource to drive the reconcile path).
    model.mutate(s => {
      const existing = s.params.sources.find(src => src.path === localPath);
      if (existing) {
        existing.content = initial;
      } else {
        s.params.sources = [...s.params.sources, { path: localPath, content: initial }];
      }
      s.params.activePath = localPath;
      // Clear stale derived state so the new file gets a fresh render.
      s.lastCheckerRun = undefined;
      s.output = undefined;
      s.export = undefined;
      s.preview = undefined;
      s.currentRunLogs = undefined;
      s.error = undefined;
      s.is2D = undefined;
      s.params.watchedLocalFile = { name: session.fileName, lastModified: Date.now() };
    });
    // Now run the external-reload path so reconciliation happens.
    await model.loadExternalSource(initial);

    if (session.isWatching) {
      session.onChange(async (content) => {
        await model.loadExternalSource(content);
        model.mutate(s => {
          if (s.params.watchedLocalFile) {
            s.params.watchedLocalFile.lastModified = Date.now();
          }
        });
      });
    }
  }

  async function manualReload() {
    if (!model || !sessionRef.current) return;
    const content = await sessionRef.current.read();
    await model.loadExternalSource(content);
    model.mutate(s => {
      if (s.params.watchedLocalFile) {
        s.params.watchedLocalFile.lastModified = Date.now();
      }
    });
  }

  useEffect(() => {
    return () => { sessionRef.current?.stop(); };
  }, []);

  return { status, openSession, stopSession, manualReload };
}
```

- [ ] **Step 3:** Type-check:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 4 (commit, sandbox-skipped):** Would commit: `feat(components): useLocalFileWatcher hook + watchedLocalFile state`.

### Task 3.5: `LocalFileButton` UI + mount in EditorPanel

**Files:**
- Create: `src/components/LocalFileButton.tsx`
- Modify: `src/components/EditorPanel.tsx`

- [ ] **Step 1:** First, read `EditorPanel.tsx` to find a good mounting point (likely the toolbar at the top):
```bash
cat /workspace/src/components/EditorPanel.tsx | head -80
```

- [ ] **Step 2:** Create `src/components/LocalFileButton.tsx`:

```tsx
import React, { useContext } from 'react';
import { Button } from 'primereact/button';
import { ModelContext } from './contexts';
import { useLocalFileWatcher } from './useLocalFileWatcher';
import { hasFileSystemAccess } from '../io/local_file_watcher';

export function LocalFileButton() {
  const model = useContext(ModelContext);
  const { status, openSession, stopSession, manualReload } = useLocalFileWatcher(model);

  if (!status) {
    return (
      <Button
        icon="pi pi-folder-open"
        label="Open Local…"
        size="small"
        tooltip={hasFileSystemAccess() ? 'Open a local .scad file (auto-watched)' : 'Open a local .scad file (manual reload)'}
        tooltipOptions={{ position: 'bottom' }}
        onClick={openSession}
        className="p-button-text"
      />
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span
        title={status.isWatching ? 'Watching for external changes' : 'Manual reload required'}
        style={{
          width: 8, height: 8, borderRadius: 4,
          background: status.isWatching ? '#22c55e' : '#f59e0b',
        }}
      />
      <span style={{ fontSize: 12, opacity: 0.8 }}>{status.fileName}</span>
      {!status.isWatching && (
        <Button
          icon="pi pi-refresh"
          size="small"
          className="p-button-text"
          tooltip="Reload from disk"
          tooltipOptions={{ position: 'bottom' }}
          onClick={manualReload}
        />
      )}
      <Button
        icon="pi pi-times"
        size="small"
        className="p-button-text"
        tooltip="Detach local file"
        tooltipOptions={{ position: 'bottom' }}
        onClick={stopSession}
      />
    </div>
  );
}
```

- [ ] **Step 3:** Mount the button in `EditorPanel.tsx`. Locate the toolbar JSX (typically a `<div>` near the top of the returned tree containing existing buttons). Add `<LocalFileButton />` near the file-picker or save-project area. Import:
```ts
import { LocalFileButton } from './LocalFileButton';
```
The exact placement: choose somewhere visible alongside existing toolbar buttons; the implementer should match the surrounding spacing/styling.

- [ ] **Step 4:** Type-check + unit tests:
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -10 && npm run test:unit 2>&1 | tail -10
```
Expected: clean.

- [ ] **Step 5:** Sanity-start the dev server (will not actually render geometry without build:libs, but the React app should mount and the new button should appear):
```bash
cd /workspace && timeout 30 npm run start 2>&1 | tail -15
```
Expected: webpack starts; no build errors.

- [ ] **Step 6 (commit, sandbox-skipped):** Would commit: `feat(ui): LocalFileButton with watch/manual-reload UI`.

---

## Phase 4 — Final verification

### Task 4.1: Full-tree type + unit tests

- [ ] **Step 1:**
```bash
cd /workspace && npx tsc --noEmit 2>&1 | tail -20
```
Expected: no errors.

- [ ] **Step 2:**
```bash
cd /workspace && npm run test:unit 2>&1 | tail -20
```
Expected: all pass.

- [ ] **Step 3:** Quick scan of files modified to ensure no stray `console.log` debug noise beyond the intentional reconcile-result logs:
```bash
cd /workspace && grep -n "console\." src/components/CameraController.ts src/components/ViewerPanel.tsx src/state/model.ts src/state/customizer-reconcile.ts src/io/local_file_watcher.ts src/components/useLocalFileWatcher.ts src/components/LocalFileButton.tsx 2>&1
```
Expected: only the intentional `console.warn` and `console.log` lines from the reconciliation step and the watcher's error handler.

### Task 4.2: User handoff notes

Write a short note `/workspace/IMPLEMENTATION_NOTES.md` summarizing what was done, the sandbox limitations (no git, no build:libs), and how the user should pick this up:

```md
# Implementation notes for local openscad-playground fork

This repo was extracted from a tarball of `openscad/openscad-playground` main
in a sandboxed environment that disallows `git`. To turn this into a real
working copy:

    cd /workspace
    git init -b main
    git remote add upstream https://github.com/openscad/openscad-playground.git
    git add -A
    git commit -m "Initial import + local mods"

Then to actually run:

    npm install                # already done in sandbox; rerun outside if needed
    npm run build:libs         # downloads/clones OpenSCAD libs (needs git)
    npm run start              # http://localhost:4000

## What changed vs upstream

- Mouse: RMB rotate, LMB pan, MMB pan, Shift+LMB rotate, wheel zoom.
  Touch: 1-finger rotate, 2-finger pan, pinch zoom.
  Right-click context menu suppressed inside the viewer.
- Camera orbit/target preserved across re-renders and src swaps.
- New "Open Local…" button: watches a `.scad` on disk for changes (Chromium)
  or supports manual reload (Firefox/Safari). Customizer overrides survive
  external reloads, with reconciliation when params are renamed/retyped.

## New files

- src/components/CameraController.ts
- src/components/CameraController.test.ts
- src/state/customizer-reconcile.ts
- src/state/customizer-reconcile.test.ts
- src/io/local_file_watcher.ts
- src/components/useLocalFileWatcher.ts
- src/components/LocalFileButton.tsx
- vitest.config.ts

## Modified files

- src/components/ViewerPanel.tsx
- src/state/model.ts
- src/state/app-state.ts
- src/components/EditorPanel.tsx
- package.json (vitest devDep + test:unit script)
```

- [ ] **Step 1:** Create the file with the content above.

---

## Stop conditions

- If TypeScript starts emitting unrelated errors after `npm install`, stop and report. Do not "fix" things that aren't in scope.
- If a unit test fails after implementing the corresponding code, debug it (use superpowers:systematic-debugging). Do not skip or comment out tests.
- If a phase's `npm run start` smoke check reports actual build errors (not just sandbox quirks like missing WASM), stop and report.
