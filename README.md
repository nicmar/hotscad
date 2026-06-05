<p align="center">
  <img src="public/favicon.svg" width="96" alt="HotSCAD" />
</p>

<h1 align="center">HotSCAD</h1>

<p align="center">
  <strong>OpenSCAD for agentic CAD design: every save renders.</strong><br>
  Instant feedback whether Claude is at the keyboard or you are.
</p>

<p align="center">
  <a href="https://nicmar.nu/hotscad">▶ Try it live at nicmar.nu/hotscad</a>
</p>

<p align="center">
  <!-- Drop the screencap in once recorded: docs/hot-reload.gif -->
  <img src="docs/hot-reload.gif" alt="Editing a .scad file in VS Code while HotSCAD re-renders on every save" width="720" />
</p>

## What this is

A fork of [openscad-playground](https://github.com/openscad/openscad-playground)
by Olivier Chafik (which solved the speed problem by getting OpenSCAD to run
in the browser via WebAssembly). HotSCAD layers on the UX changes I needed to
actually live in it day-to-day — most importantly, hot-reload from a file on
disk so an AI agent (or your editor) can be the one doing the typing.

Open a `.scad` file on your computer, edit it in your favorite editor — or
hand it to Claude, Codex or Gemini — and HotSCAD re-renders the preview the
moment the file is saved. No copy-paste. No reload. Nothing to install.

> **Your files never leave your computer.** HotSCAD reads the picked file via
> the browser's File System Access API; nothing is uploaded anywhere. Every
> render, preview, and customizer value runs locally in your browser tab. The
> site itself is static; there's no backend to send anything to.

## A note before you start agent-coding your CAD

**Results vary, a lot.** Different LLMs handle OpenSCAD with different levels
of competence, and even the good ones occasionally hand you back something
that looks nothing like what you asked for. Sometimes a part shows up in
seconds; sometimes the agent will burn fifteen minutes of back-and-forth
chasing a single chamfer.

If you already know CAD and you're optimizing for speed, this workflow can
feel frustrating. **If you don't know CAD — or just don't want to learn it —
but you still want to design and print real things, this is the easiest way
in.** Describe what you want in plain English, iterate on the result, print
it. That's the loop HotSCAD is built around.

## What HotSCAD adds

Grouped by the part of the app it lives in. Only features HotSCAD itself adds
or meaningfully improves over the upstream playground are listed.

### Getting started

| Feature | What it does |
|---|---|
| **Open file, hot reload in the browser** | Click **Open Local…** in the editor toolbar, pick a `.scad` on your machine. HotSCAD watches the file and re-renders every time you save it — from VS Code, Cursor, Sublime, anywhere. Same loop works if Claude / Codex / Gemini is the one doing the editing. |
| **Sync status indicator** | 🟢 watching · 🟡 manual reload mode (Firefox / Safari) · 🔴 disk differs from editor (one click pulls the latest). |
| **Dark mode (finally)** | The whole app — editor, viewer, customizer, dialogs — now renders dark by default. Switch to light any time from Settings; HotSCAD remembers your choice and follows your OS preference on Auto. |

### View

| Feature | What it does |
|---|---|
| **Camera steady on re-render** | Tweaking a parameter doesn't snap the view back to default. The camera holds its position through every render. |
| **ViewCube** | Click a face (Front, Top, a corner) to snap to that view. Drag the cube to orbit. Fusion-style. |
| **Home + Fit** buttons | Home snaps back to a 3/4 view. Fit frames the current model exactly to the panel. |
| **LMB pan, RMB rotate** | Fusion-style mouse mapping by default. Pan with the primary button, orbit with the secondary, scroll to zoom. Swap in Settings if you prefer otherwise. |
| **WASD navigation** | Game-style mouse/keyboard. Hold RMB to rotate and aim, press W to move forward. Q/E move down/up. Game-changer for inspecting under a model without manually orbiting around. |
| **Show dimensions** | A toggle prints bounding-box dimensions next to each component, in millimeters. Useful for checking print volume without opening a slicer. |

### Customize

| Feature | What it does |
|---|---|
| **Auto font dropdown** | Any string parameter ending in `font` turns into a dropdown of bundled fonts — Inter Black / SemiBold, Liberation Sans / Serif / Mono, Noto Sans. Still editable for custom font names. |
| **Filter parameters** | Search box that filters customizer parameters by name. |
| **Show customized** | Hide every parameter you haven't touched, so the panel only shows what you've actually changed. |
| **Revert all values** | One click puts every customizer override back to the source defaults. |
| **Click to nudge, Shift-click for fine** | Click the spinner arrows on a number input to step by `1`; Shift-click (or Shift + arrow keys) to step by `0.1`. |
| **Layer-colors panel** | Preview how the model looks with filament colors swapped at specific Z heights. Useful for planning a two- or three-color print without going to the slicer. |
| **Empty-render warning** | When OpenSCAD produces no geometry, the viewer keeps the previous model on screen and shows a pill explaining why nothing changed. |

## Run it locally

You don't need to install anything to use HotSCAD — just
[open HotSCAD in your browser](https://nicmar.nu/hotscad). But if you want to
hack on it or run it on your own machine:

Prerequisites:
- Node.js ≥ 18.12
- npm
- git
- `zip` (used during library build)

```bash
git clone https://github.com/nicmar/hotscad.git
cd hotscad
npm run build:libs   # one-time: download OpenSCAD WASM + bundled libraries
npm install
npm run start
# open http://localhost:4000/
```

For a production-style build:

```bash
npm run build:all
```

## Deploying

Copy `.env.example` to `.env` and edit the deploy target / publish command for
your setup:

```bash
cp .env.example .env
./deploy.sh
```

`deploy.sh` runs the build, copies `dist/` to `$DEPLOY_TARGET`, then runs
`$DEPLOY_COMMAND` (e.g. an alias that pushes a personal site). With `MIRROR=1`
it uses `rsync --delete` so the target stays in sync exactly with `dist/`.

## Adding OpenSCAD libraries

The build reads `libs-config.json` to manage every library dependency. To add
a new library, search for `BOSL2` for a worked example and edit three files:

- [`libs-config.json`](./libs-config.json) — repo URL, branch, files to include / exclude
- [`src/fs/zip-archives.ts`](./src/fs/zip-archives.ts) — wire the zip into the UI file picker and auto-imports
- [`LICENSE.md`](./LICENSE.md) — paste the library's license, or link to one of the existing standard ones

Library entry format:

```json
{
  "name": "LibraryName",
  "repo": "https://github.com/user/repo.git",
  "branch": "main",
  "zipIncludes": ["*.scad", "LICENSE", "examples"],
  "zipExcludes": ["**/tests/**"],
  "workingDir": "."
}
```

Build commands:

| Command                          | What it does                                 |
|----------------------------------|----------------------------------------------|
| `npm run build:libs`             | Build all libraries                          |
| `npm run build:libs:clean`       | Clean library build artifacts                |
| `npm run build:libs:wasm`        | Just the WASM binary                         |
| `npm run build:libs:fonts`       | Just the bundled fonts                       |
| `npm run build`                  | Production app build                         |
| `npm run build:all`              | Libraries + app                              |

## Building your own WASM binary

The build pulls a prebuilt OpenSCAD WebAssembly binary. To build your own,
optionally pointed at your local OpenSCAD checkout:

```bash
rm -fR libs/openscad
ln -s $PWD/../absolute/path/to/your/openscad libs/openscad
rm -fR libs/openscad/build      # if you previously did a native build

npm run build:libs:wasm
npm run build:libs
npm run start
```

Add `WASM_BUILD=Debug` to the env if you need to debug crashes inside WASM.

## About

Made by @nicmar with Claude Code. Check out my
[profile on MakerWorld](https://makerworld.com/en/@nicmar).

I'm a newbie 3D-printer and CAD designer, but a lifelong tinkerer and maker
at heart. If I see a problem, I gotta fix it, and if I can 3D-print it, even
better.

HotSCAD itself was built with agent assistance — the same agentic coding loop
the app is designed for.

## Credit

HotSCAD is a fork of [**openscad/openscad-playground**](https://github.com/openscad/openscad-playground)
by Olivier Chafik. The underlying [OpenSCAD](https://openscad.org) language
and engine are by Marius Kintel and contributors, the WASM build is based on
[DSchroer/openscad-wasm](https://github.com/DSchroer/openscad-wasm), and the
fast geometry backend is [Manifold](https://github.com/elalish/manifold) by
Emmett Lalish.

If you want to send a PR upstream so a fix lands for everyone, please do —
the playground accepts contributions at the link above.

## License

GPL v2 or later; deployed under GPL v3 because of dependency licensing. See
[LICENSE.md](./LICENSE.md) for the full breakdown including bundled libraries.
