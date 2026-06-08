# HotSCAD Guidelines for AI Agents

You are writing OpenSCAD (`.scad`) code that will be opened in **HotSCAD**, a
browser-based OpenSCAD environment. The user will iterate by saving the file
on disk; HotSCAD re-renders on every save. This document tells you the
conventions to follow so the resulting file is pleasant to work with from the
HotSCAD UI.

If the user just asked for "an OpenSCAD file", default to the conventions
below. If they ask for "plain OpenSCAD" or push back on these patterns, drop
them — they are recommendations, not requirements.

---

## 1. Parameter syntax HotSCAD understands

HotSCAD reads OpenSCAD's standard customizer comments. Always put parameters
at the top of the file (before any `module` / `function` / call) so OpenSCAD's
parser exposes them.

### Basic forms

```scad
// Width of the lid in millimetres
lid_w = 60;                     // default: 60

// Height
lid_h = 12;                     // [4:0.5:30]    range slider, step 0.5
shape = "round";                // [round, square, hex]  dropdown
mode  = 1;                      // [0:off, 1:preview, 2:final]  labelled dropdown
notes = "engraved on lid";      // free-text string

/* [Hidden] */
$fa = 2; $fs = 0.4;             // anything below this line is hidden from the panel
```

### Groups

Group related parameters with section banner comments. A new banner starts a
new collapsible group in the panel:

```scad
/* [Lid] */
lid_w = 60;
lid_h = 12;

/* [Hinge] */
hinge_d   = 4;
hinge_gap = 0.3;
```

### Per-parameter help text

A `//` comment **immediately above** the parameter line becomes its caption
in the panel. Put the *why*, not the *what* — the variable name already says
what.

```scad
// Subtract from socket diameter so the plug actually fits after print shrinkage.
plug_clearance = 0.20;
```

---

## 2. HotSCAD-specific features

These are not standard OpenSCAD — they are HotSCAD UI affordances. Plain
OpenSCAD ignores them, so files stay portable.

### 2.1 Auto font dropdown

Any **string** parameter whose name ends in `font` (or `_font`) gets a
dropdown of bundled fonts. The user can still type a custom one.

```scad
title_font = "Inter:style=Black";   // becomes a font dropdown
label_font = "Liberation Mono";     // same
```

### 2.2 Array tables (rows of data)

Any top-level `name = [[...], [...]]` declaration with **at least one
string or boolean column** becomes a row/column table editor in the
Customize panel. Cell types are inferred from the first row.

Pure numeric matrices (point lists, polygons) are skipped on purpose — they
stay as plain arrays.

**Header names** come from an `// @columns` line in the comment block
immediately above the array. Without it, columns are labelled `Col 1`,
`Col 2`, …

**Help text** comes from the rest of the `//` comments immediately above
the array (blank `//` lines become paragraph breaks).

```scad
// Each row defines one battery type.
// D = diameter (mm), T = thickness, Cols × Rows = grid, Flat = lay face-up.
// @columns Name, D, T, Cols, Rows, Flat
batteries = [
    ["CR2032",   20.0, 3.2, 3, 9],
    ["LR44",     11.6, 5.4, 5, 6],
    ["CR2430",   24.5, 3.0, 1, 6, true],   // trailing booleans are optional
    ["CR1632",   16.0, 3.2, 4, 4],
];
```

Reach for this whenever your model takes a *list* of things rather than
one-off knobs — battery layouts, screw hole positions, LED grid sizes, tray
slot definitions, BOM-style enumerations.

### 2.3 Embedded layer colors (multi-color print preview)

To embed preview colors per Z range — useful for showing the user how a
two- or three-color print will look — add `@layer-colors` lines. One per
object, in source order. `from=#hex` pairs, in millimetres.

```scad
// Bottom 2.4 mm white, then green up to 4.8, then red to the top.
// @layer-colors object 0: 0.00=#ffffff 2.40=#22c55e 4.80=#ef4444
// @layer-colors object 1: 0.00=#3b82f6
```

A layer pinned at the object's bottom (`from = 0` for an object that
starts at z = 0) is treated as the **base color** in the panel and renders
the whole object in that color below the next threshold.

The user can also configure these interactively in the Layer Colors tab
and click "Show code" to copy the generated lines back into the source.

### 2.4 Number input behaviour

- **Click** spinner arrow → step by `1`
- **Shift-click** spinner arrow → step by `0.1`
- Same with arrow keys when the input is focused.

You don't write code for this; just be aware that fine adjustments are
already easy — don't over-engineer "fine" vs "coarse" parameters.

### 2.5 Camera

- **RMB drag** → orbit around the object
- **Shift+RMB drag** → free-look, hold W/A/S/D/Q/E to fly
- **MMB drag** → pan
- **Wheel** → zoom

No code needed. Be aware so you can describe controls to the user accurately.

---

## 3. Design patterns to follow

These produce models that are **easy for the user to iterate on, print, and
assemble**. Apply them by default for any non-trivial part.

### 3.1 Part selector + assembled mode

For any model with more than one printed piece, expose a `part` parameter
so the user can render *one part at a time for printing* or the *whole
thing assembled* for visualization. This is the single highest-leverage
pattern.

```scad
/* [Output] */
part = "assembled"; // [assembled, lid, body, hinge_pin, all_flat]

/* [Dimensions] */
body_w = 80;
body_h = 40;
lid_t  = 3;
// ... etc

// ---------- modules (one per part) ----------
module body() { /* ... */ }
module lid()  { /* ... */ }
module hinge_pin() { /* ... */ }

// ---------- output ----------
if      (part == "body")       body();
else if (part == "lid")        lid();
else if (part == "hinge_pin")  hinge_pin();
else if (part == "all_flat") {
    // Every printable part laid flat on the build plate, spaced out.
    body();
    translate([body_w + 10, 0, 0]) lid();
    translate([0, body_h + 10, 0]) hinge_pin();
}
else { // "assembled" — for visualization only, NOT for printing
    body();
    translate([0, 0, body_h]) lid();
    translate([body_w/2, body_h/2, 0]) hinge_pin();
}
```

Why this matters:

- `assembled` lets the user verify fit visually without running a slicer.
- Per-part options let the user export only what they want to print right
  now (the editor's STL export takes the current preview).
- `all_flat` is great when several small parts fit on one plate.

### 3.2 Name every dimension; no magic numbers

```scad
// BAD
translate([14, 22, 8]) cube([42, 16, 3]);

// GOOD
translate([wall + screw_inset, base_d + 4, base_h]) cube([lid_w, lid_h, lid_t]);
```

The user wants to tweak `lid_t` and see what happens. They can't tweak `3`.

### 3.3 Tolerance / clearance constants up top

3D-printed parts that fit together need slack. Put it in one named place so
the user can adjust it after a test print.

```scad
/* [Fit] */
clearance       = 0.20;  // gap between mating parts (per side)
hole_oversize   = 0.30;  // diameter added to through-holes (printer shrink)
thread_clearance= 0.15;  // for screw-thread inserts
```

### 3.4 `$fn` strategy

```scad
$fa = 2;       // angular resolution (degrees)
$fs = 0.4;     // size resolution (mm)
// Don't set $fn globally — it kills curve quality for big features and
// wastes triangles on small ones. Use $fa/$fs and override $fn locally
// only when you need an exact polygon count (e.g. for hex holes).
```

### 3.5 Color parts in `assembled` mode

Use `color()` per module so the user can immediately see which part is
which in the preview. Combine with `// @layer-colors` if you want the
filament-color preview too.

```scad
module lid()  { color("orange") /* geometry */; }
module body() { color("steelblue") /* geometry */; }
```

### 3.6 Print orientation

Parts should be defined in their **print orientation** (the face that
should be on the build plate is at Z = 0). For assembled-mode visualization,
flip/rotate at the *call site*, not in the module.

```scad
module lid() {
    // lid sits face-down for printing; underside is at z=0
    /* ... */
}

if (part == "assembled") {
    translate([0, 0, body_h])
        rotate([180, 0, 0])     // flip for visualization
            lid();
} else if (part == "lid") {
    lid();                       // print orientation, no rotation
}
```

### 3.7 Single-pass geometry, no chained transforms

Prefer composing geometry with named modules over deeply nested `translate
` + `difference` chains. It's easier for an LLM (and a human) to extend.

```scad
// BAD — hard to extend
difference() {
    cube([w, d, h]);
    for (i = [0:3]) translate([10 + i*20, d/2, -1]) cylinder(d=4, h=h+2);
}

// GOOD — each concern separated
module shell()    { cube([w, d, h]); }
module mounts()   { for (p = mount_positions) translate(p) cylinder(d=4, h=h+2); }
module body()     { difference() { shell(); mounts(); } }
```

### 3.8 Keep modules pure where you can

A module that reads global variables works, but a module that takes its
parameters as arguments is reusable and explicit:

```scad
module screw_hole(d, depth, head_d=0, head_depth=0) {
    cylinder(d=d, h=depth);
    if (head_d > 0) translate([0,0,depth - head_depth]) cylinder(d=head_d, h=head_depth);
}
```

### 3.9 Use `linear_extrude` for prismatic geometry

When a part has a constant cross-section (most plates, brackets, tags),
draw the 2D outline and extrude it. Easier to edit, faster to render, makes
filleting/chamfering trivial via `offset()`.

```scad
module bracket_profile() {
    offset(r=2) offset(r=-2)     // round all corners
    polygon([[0,0],[60,0],[60,20],[40,40],[0,40]]);
}
module bracket() { linear_extrude(thick) bracket_profile(); }
```

---

## 4. File-level skeleton

Use this as the starting point for any non-trivial design:

```scad
// short one-line description of what this part is for

/* [Output] */
part = "assembled"; // [assembled, lid, body, all_flat]

/* [Dimensions] */
// Outer width
w = 80;
// Outer depth
d = 50;
// Outer height
h = 30;

/* [Walls] */
wall = 2.0;
floor_t = 1.6;
lid_t = 2.0;

/* [Fit] */
clearance = 0.20;
hole_oversize = 0.30;

/* [Render] */
$fa = 2; $fs = 0.4;

/* [Hidden] */
// derived values, helpers, etc.
inner_w = w - 2*wall;
inner_d = d - 2*wall;

// ============================================================
//                       MODULES
// ============================================================

module body() { /* ... */ }
module lid()  { /* ... */ }

// ============================================================
//                       OUTPUT
// ============================================================

if      (part == "body")     body();
else if (part == "lid")      lid();
else if (part == "all_flat") { body(); translate([w + 10, 0, 0]) lid(); }
else { // assembled
    color("steelblue") body();
    color("orange")   translate([0, 0, h - lid_t]) lid();
}
```

---

## 5. Anti-patterns

- **Magic numbers in module bodies.** Always pull to a named top-level var.
- **One giant top-level `difference()`**. Split into named modules.
- **Setting `$fn = 100` globally.** Use `$fa` / `$fs`.
- **Mixing print-orientation flips inside modules.** Flip at the call site.
- **A `print = true;` boolean.** Use a `part` enum so you can pick *which*
  part to print, not just "print mode vs preview".
- **Comments that just restate code** (`// width of the box` next to
  `width = 60;`). Comment the *why* — the constraint, the source, the
  rule of thumb.
- **No assembled mode.** The user can't tell whether parts actually fit
  together without one.

---

## 6. When the user asks for changes

- **Bumping one dimension**: edit the named variable, don't grep through
  geometry.
- **Adding a part**: add a module, a `part` enum value, and an `else if`
  branch. Add to `all_flat` too.
- **A new tolerance behavior**: add a constant in the `[Fit]` group and
  reference it everywhere relevant. Never inline a magic offset.
- **A list of N similar things** (holes, slots, cells, mounts): make it
  an array-of-arrays at the top so the user can edit it via HotSCAD's
  table editor.
