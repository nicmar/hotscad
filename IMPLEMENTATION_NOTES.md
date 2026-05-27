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

    npm install                # already done in the sandbox; rerun outside if needed
    npm run build:libs         # downloads/clones OpenSCAD libs (needs git)
    npm run start              # http://localhost:4000

## What changed vs upstream

- **Mouse:** RMB rotate, LMB pan, MMB pan, Shift+LMB rotate, wheel zoom.
  Touch: 1-finger rotate, 2-finger pan, pinch zoom.
  Right-click context menu suppressed inside the viewer.
- **Camera orbit/target preserved** across re-renders and src swaps (the
  upstream behaviour reset the camera on every customizer change).
- **New "Open Local…" button** in the editor toolbar: watches a `.scad` on disk
  for changes (Chromium-based browsers via File System Access API) or supports
  manual reload (Firefox/Safari). Customizer overrides survive external
  reloads, with reconciliation: overrides for removed params are dropped,
  type-changed overrides are dropped on external reload only.

## New files

- src/components/CameraController.ts
- src/components/CameraController.test.ts
- src/state/customizer-reconcile.ts
- src/state/customizer-reconcile.test.ts
- src/io/local_file_watcher.ts
- src/components/useLocalFileWatcher.ts
- src/components/LocalFileButton.tsx
- vitest.config.ts
- docs/superpowers/specs/2026-05-26-openscad-playground-mods-design.md
- docs/superpowers/plans/2026-05-26-openscad-playground-mods.md

## Modified files

- src/components/ViewerPanel.tsx
- src/state/model.ts
- src/state/app-state.ts
- src/components/EditorPanel.tsx
- package.json (vitest devDep + test:unit script)

## Tests

Unit tests via vitest:

    npm run test:unit

13 tests covering the pure camera-math helpers and the customizer
reconciliation function. The existing puppeteer E2E suite is unchanged:

    npm run test:e2e

## Known sandbox limitations

The sandbox blocks `git` and `git clone`, so `npm run build:libs` (which
clones OpenSCAD library repos) was never executed here. You'll need to run
that yourself before the dev server can actually render OpenSCAD geometry.
