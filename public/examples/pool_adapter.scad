// pool_adapter.scad
// Adapter from 32 mm rubber pool outlet → 50 mm PVC pool hose.
// Backplate hangs down against the curved pool wall, hex buttress
// gusset under the adapter axis prevents downward tilt.
//
// Companion parts (separate STL exports):
//   - Two-piece printed clamp that wraps the 50 mm PVC hose
//   - Optional knob caps for the clamp screws
//
// See docs/superpowers/specs/2026-05-31-pool-hose-adapter-design.md
// for design rationale.
//
// Coordinate system (USE orientation):
//   X = along adapter axis. Plate at X ∈ [-plate_thickness, 0].
//                           Body at X ∈ [0, body_length].
//   Y = sideways. Gusset centered at Y = 0, thickness in Y.
//   Z = vertical. Adapter axis at Z = 0. Plate extends downward.
//
// For printing, lay the plate flat on the build plate
// (rotate -90° about Y in the slicer, or set print_orientation = true
// below to bake the rotation into the export).


// ============================================================================
//  Parameters
// ============================================================================

/* [Receiving (32 mm) side] */
bore_32_dia              = 31.0;   // rubber pool hose OD. Measure your actual hose
                                   // (often oval — use the smaller axis for a snug
                                   // fit). Slightly undersized vs. the hose so the
                                   // major-axis side compresses ~1 mm into the bore,
                                   // which keeps the hose round and the o-ring well-
                                   // seated on both axes.
bore_32_clearance        = 0.2;    // radial slip clearance
bore_32_length           = 40.0;   // engagement length IN FRONT of the plate
wall_32                  = 4.0;    // wall thickness around bore
back_stub_length         = 0.0;    // cylindrical extension of the 32mm body BEHIND
                                   // the plate. Default 0 — the plate is the end
                                   // of the part on the pool side (flush against
                                   // the pool wall, nothing protrudes behind it).

/* [Barbed (drain-hose) side] */
// All barb dimensions are derived from the drain hose's measured inner
// diameter — change drain_hose_id and the whole barb section, hose stop,
// inner bore, and outer clamp resize automatically.
drain_hose_id            = 36.77;  // measured ID of your drain/vacuum hose
                                   // (was 50 in the original 50 mm hose design)
drain_hose_wall          = 2.0;    // approximate wall thickness (per side) of the
                                   // drain hose, used to size the outer clamp.
barb_interference        = 1.2;    // diametric: peak OD = drain_hose_id +
                                   // interference. ~1.2 mm is solid for stiff PVC,
                                   // 1.5-2 mm for softer rubber/EPDM.
barb_cliff               = 2.0;    // diametric: peak - trough. Bigger cliff =
                                   // better pull-off resistance, harder to install.
                                   // 2 mm is more aggressive than the old 1.5 mm
                                   // default and helps with water-loaded hoses.
bore_50_wall             = 1.5;    // per-side wall at the trough; minimum for PETG.
                                   // Inner bore is computed in derived values.
barb_section_length      = 40.0;   // longer = more grip area for a heavy hose.
                                   // Must be > clamp_width.
barb_count               = 5;

/* [Transition + hose stop] */
transition_length        = 10.0;
hose_stop_proud          = 1.0;    // ring proud of peak barb (per side)

/* [Cable-tie retention groove (extra pull-off resistance)] */
// When a heavy water-loaded hose is hanging off the barb section, barb
// friction alone often isn't enough — a small circumferential groove gives
// a cable tie a stable axial seat that resists slipping. Use this in ADDITION
// to the printed clamp for belt-and-suspenders retention, or instead of the
// clamp for setups where a wrap-around clamp doesn't fit.
ziptie_groove_enabled    = false;
ziptie_groove_pos        = 70.0;   // X (mm) from adapter's X=0 (the body's rear
                                   // face against the plate). Default 70 sits
                                   // ~12 mm in from the open end with the current
                                   // body_length = 90 (40 + 10 + 40). If you
                                   // change barb_section_length, update this.
ziptie_groove_width      = 3.5;    // axial width (mm) — fits a standard 3 mm tie
ziptie_groove_depth      = 1.5;    // radial depth into the barb section

/* [Body-clamp notch (cut through the gusset)] */
// The inner clamp's bottom half-ring wraps the bottom 180° of the body —
// which passes right through the gusset at Y ≈ 0. Cut a small rectangular
// notch in the gusset (centered on the clamp's X position) so the half-ring
// has somewhere to sit. The gusset on either side of the notch stays
// intact, so most of the structural support is preserved.
body_clamp_notch_enabled = true;
body_clamp_notch_x       = 20.0;   // X position (mm) of notch CENTER. Defaults
                                   // to bore_32_length/2 — set to your inner
                                   // clamp position if you move it.
body_clamp_notch_extra   = 1.0;    // extra width on each side beyond the clamp
                                   // (for tolerance / sliding the clamp in)

/* [O-ring] */
use_oring                = true;
oring_id                 = 32.0;   // (informational) — matches a typical Ø32×3 o-ring.
                                   // The actual sealing geometry is set by
                                   // oring_groove_depth/width below, not by this.
oring_cs                 = 3.0;    // cross-section (informational; same caveat).
                                   // Squeeze % = (oring_cs - oring_groove_depth)
                                   // / oring_cs. Target 15-25% for radial seals.
oring_pos_from_front     = 25.0;   // X (mm) from FRONT face of plate (= body X=0)
oring_groove_depth       = 2.5;    // radial (~17% squeeze on a 3mm o-ring)
oring_groove_width       = 3.8;    // axial (~25% slack for sideways flow)

/* [Backplate] */
plate_top_width          = 50.0;
plate_bottom_width       = 100.0;
plate_height             = 125.0;
plate_thickness          = 6.0;
plate_top_to_bore_center = 30.0;   // distance from top edge to bore center
pool_radius              = 2250.0; // 4.5 m diameter
plate_flat               = false;
plate_corner_radius      = 10.0;   // 2D: rounds the trapezoid corners
plate_edge_fillet        = 1.0;    // 3D: rounds all plate edges (uses minkowski,
                                   // SLOW — set to 0 for fast preview, 1.0+ for
                                   // pool-safe rounded edges before printing)

/* [Gusset (hex buttress)] */
gusset_thickness         = 7.0;
gusset_frame_width       = 5.0;    // solid perimeter band
gusset_hex_cell          = 9.0;   // flat-to-flat (mm)
gusset_hex_wall          = 3.0;
gusset_use_hex           = true;
gusset_bezier_droop      = 0.8;    // 0=tight to plate, 1=straight diagonal
gusset_adapter_overlap   = 5;    // how far gusset top edge intrudes into adapter
                                   // body. Needs to exceed cylinder sagitta at the
                                   // gusset's half-thickness (Y = gusset_thickness/2)
                                   // so the union is solid across the full Y range.
                                   // At gusset_thickness=7 and the 32mm-section radius
                                   // (R≈20), sagitta ≈ 0.31 mm; 1.0 mm leaves ~0.7 mm
                                   // of guaranteed overlap and still keeps ≥1 mm of
                                   // bore-wall material in the thin transition zone.
gusset_edge_fillet       = 0.0;    // 3D: rounds the gusset's outer perimeter edges
                                   // (hex hole edges stay sharp). 0 = off. 1.0 is a
                                   // gentle fillet; uses minkowski (SLOW). If you
                                   // enable this, consider also bumping
                                   // gusset_adapter_overlap by ~0.5–1.0 mm so the
                                   // rounded top edge still solidly merges with the
                                   // adapter body across the full gusset thickness.

/* [Outer clamp — wraps the drain hose over the barb section] */
clamp_width              = 30.0;   // axial length of the clamp. Wider = more
                                   // barbs gripped at once = more pull-off
                                   // resistance. Must be < barb_section_length.
// clamp_hose_od is now derived from drain_hose_id + 2*drain_hose_wall — see
// derived-values section. Don't set it here; change drain_hose_id or
// drain_hose_wall instead.
clamp_squeeze            = 1.2;    // closed-gap interference
clamp_wall               = 4.0;
clamp_flange_x           = 20.0;   // bolt must clear the ring's outer surface during
                                   // wing-thumbscrew rotation: need clamp_flange_x/2
                                   // > thumb_wing_length/2 (= wing radius). With 16
                                   // mm wings, 20 mm flange leaves ~2 mm clearance.
clamp_flange_y           = 6.0;    // flange depth from split plane

/* [Inner clamp — collar around the 32mm body section] */
// Wraps the rigid PETG body of the adapter (between the plate and the
// transition zone). With the gusset attached underneath the body, the
// clamp's split plane is oriented VERTICALLY in the assembled view so the
// two flanges extend sideways (along world Y) instead of up/down — that
// keeps both flanges well clear of the gusset (which sits at Y≈0, below
// the adapter axis). Bolts then run vertically along world Z and you
// tighten them from above.
clamp_inner_enabled      = true;   // render the body collar in "all" mode
clamp_inner_width        = 24.0;
clamp_inner_hose_od      = 39.2;   // sized to wrap the 32mm body section's OD
                                   // (= od_32_section: bore_32_dia + bore_32_clearance
                                   // + 2 × wall_32 = 31 + 0.2 + 8). Update if you
                                   // change those upstream values.
clamp_inner_squeeze      = 0.4;    // slight interference — rigid PETG doesn't
                                   // actually compress, but a small squeeze keeps
                                   // the bolted halves snug against the body
clamp_inner_wall         = 3.0;
clamp_inner_flange_x     = 20.0;   // same clearance constraint as outer clamp
clamp_inner_flange_y     = 5.0;    // slimmer than the outer clamp's 8 — keeps the
                                   // bolt-hole "cube" less chunky in tight spaces

/* [Clamp hardware — M6 metal preferred, printed M6 as backup] */
// Hex pocket sized to fit a standard DIN 934 M6 hex nut (10 mm AF × 5 mm
// thick). The printed nut module further down uses the same dimensions, so
// you can drop either kind of nut into the same clamp. The threads differ
// — metal M6 uses 1 mm pitch (standard), printed M6 uses 2.5 mm coarse for
// printability — so don't mix bolt/nut types within a single pair.
clamp_screw_dia          = 6.0;    // M6 shaft
clamp_screw_clearance    = 0.5;    // diametric clearance hole (6.5 mm hole for M6)
clamp_nut_af             = 10.0;   // DIN 934 M6 hex nut across-flats
clamp_nut_clearance      = 0.3;    // hex pocket clearance
clamp_nut_thickness      = 3.0;    // DIN 934 M6 nut height (PHYSICAL nut, used for
                                   // printed_hex_nut and as the upper cap on the
                                   // auto-adjusted pocket depth below)
flange_back_thickness    = 3.0;    // material thickness behind the nut pocket
                                   // (between pocket floor and the flange's inner
                                   // face). The pocket depth auto-adjusts to
                                   // (flange_y - this), capped at clamp_nut_thickness
                                   // and ≥ 1 mm. Higher = thicker, stronger flange
                                   // with a more exposed nut; lower = nut sits deeper
                                   // but flange has less material.

/* [Printed thumbscrew (wing-style head, no separate knob)] */
thumb_thread_pitch       = 2.5;    // coarse pitch, prints well in PETG
thumb_thread_length      = 25.0;   // shaft length (covers 2×flange_y + nut + slack)
thumb_thread_clearance   = 0.4;    // radial clearance between bolt and nut threads
thumb_wing_length        = 16.0;   // wing tip-to-tip. Constraint:
                                   //   thumb_wing_length < clamp_flange_x
                                   //   thumb_wing_length < clamp_inner_flange_x
                                   // otherwise the wings will hit the ring as they
                                   // sweep through during tightening.
thumb_wing_thickness     = 6.0;    // wing thickness along the bolt axis
thumb_wing_width         = 8.0;    // wing width perpendicular to length+axis
thumb_hub_d              = 12.0;   // hub at the root of the wings
thumb_hub_h              = 4.0;    // hub height (Y standoff above the flange)

/* [Knob (separate part)] */
knob_dia                 = 25.0;
knob_height              = 10.0;
knob_socket_depth        = 6.0;
knob_socket_clearance    = 0.15;   // across-flats clearance for M5 head
knob_knurl_count         = 16;
knob_knurl_depth         = 0.8;

/* [Render selector] */
render_part              = "all";  // [adapter, clamp, clamp_inner, thumbscrew, nut, knob, assembled, all]
print_orientation        = false;  // true = lie adapter flat on bed for export

/* [Hidden] */
$fa = 2;
$fs = 0.6;
EPS = 0.01;
OVERLAP = 0.4;


// ============================================================================
//  Derived values
// ============================================================================

body_length     = bore_32_length + transition_length + barb_section_length;
barb_pitch      = barb_section_length / barb_count;
bore_32_actual  = bore_32_dia + bore_32_clearance;
od_32_section   = bore_32_actual + 2 * wall_32;          // ~39.2

// Drain-side derivations — change drain_hose_id and these all auto-update.
barb_peak_dia   = drain_hose_id + barb_interference;     // ~37.97 default
barb_trough_dia = barb_peak_dia - barb_cliff;            // ~35.97 default
bore_50_dia     = barb_trough_dia - 2 * bore_50_wall;    // ~32.97 default
od_hose_stop    = barb_peak_dia + 2 * hose_stop_proud;   // ~39.97 default
clamp_hose_od   = drain_hose_id + 2 * drain_hose_wall;   // ~40.77 default

gusset_apex_x   = bore_32_length + transition_length;  // 60
gusset_apex_z   = -od_hose_stop / 2;                   // ~-26.25
gusset_rear_z   = -od_32_section / 2;                  // ~-20.1

plate_top_z     =  plate_top_to_bore_center;           // +30
plate_bot_z     = -(plate_height - plate_top_to_bore_center); // -95


// ============================================================================
//  Entry point
// ============================================================================

main();

module main() {
  // Assembled preview: adapter in USE orientation with both clamps shown in
  // their working positions around the hoses (ghost cylinders for context).
  // No bolts/nuts/knob — just adapter + clamp shells. Note: the inner clamp
  // sits BEHIND the plate (X < -plate_thickness) where the rubber hose is
  // exposed; placing it on the front side would collide with the gusset.
  if (render_part == "assembled") {
    adapter();

    // Outer clamp positioned inward (close to the hose-stop end of the
    // barb section) — pull-off forces concentrate at the hose's leading
    // edge, so the clamp grips most effectively when it sits over the
    // first few barbs the hose engages.
    outer_clamp_start = bore_32_length + transition_length + 2;
    translate([outer_clamp_start, 0, 0])
      rotate([0, 90, 0])
        clamp(assembled = true);

    // Inner clamp (body collar) wraps the 32 mm body section between the
    // plate and the transition zone. The clamp's bottom half-ring passes
    // through the gusset's notch (cut by body_clamp_notch_subtractor at
    // body_clamp_notch_x). Two rotations: rotate([0,0,90]) tips the split
    // plane to vertical (flanges sideways along world Y, clearing the
    // gusset's Y thickness), then rotate([0,90,0]) lines the clamp axis
    // up with the adapter axis.
    inner_clamp_start = body_clamp_notch_x - clamp_inner_width / 2;
    translate([inner_clamp_start, 0, 0])
      rotate([0, 90, 0])
        rotate([0, 0, 90])
          clamp_inner(assembled = true);

    // Ghost hoses (% = transparent) showing the assembly context.
    %union() {
      // Drain hose extending past the open end of the barb section.
      translate([bore_32_length + transition_length, 0, 0])
        rotate([0, 90, 0])
          cylinder(h = barb_section_length + 60, d = clamp_hose_od);
      // Rubber pool hose from behind the plate through the bore.
      translate([-60, 0, 0])
        rotate([0, 90, 0])
          cylinder(h = 60 + bore_32_length, d = clamp_inner_hose_od);
    }
  }

  if (render_part == "adapter" || render_part == "all") {
    if (print_orientation) {
      // Rotate so the plate lies flat on the bed (XY plane), with adapter
      // pointing up in +Z. After the rotation, the plate's rear face (was
      // X = -plate_thickness) sits at Z = -plate_thickness; translate up
      // by plate_thickness so its front face touches the build plate.
      translate([0, 0, plate_thickness])
        rotate([0, -90, 0])
          adapter();
    } else {
      adapter();
    }
  }

  // ── "all"-mode Y-offsets — each part starts past the previous one's
  //    maximum Y extent plus a 15 mm safety gap so Bambu's "split objects"
  //    treats them as separate solids and doesn't merge anything touching.
  outer_clamp_y = plate_bottom_width/2 + clamp_hose_od + clamp_flange_y + 30;
  inner_clamp_y = outer_clamp_y +
                  (clamp_hose_od/2 + clamp_inner_hose_od + clamp_inner_flange_y + 30);
  thumb_y       = inner_clamp_y + clamp_inner_hose_od/2 + 30;
  nut_y         = thumb_y + thumb_wing_length/2 + 25;
  knob_y        = nut_y + clamp_nut_af + 25;

  if (render_part == "clamp" || render_part == "all") {
    translate([0, render_part == "all" ? outer_clamp_y : 0, 0])
      clamp();
  }

  if (render_part == "clamp_inner" ||
      (render_part == "all" && clamp_inner_enabled)) {
    translate([0, render_part == "all" ? inner_clamp_y : 0, 0])
      clamp_inner();
  }

  if (render_part == "thumbscrew" || render_part == "all") {
    translate([0, render_part == "all" ? thumb_y : 0, 0])
      printed_thumbscrew();
  }

  if (render_part == "nut" || render_part == "all") {
    translate([0, render_part == "all" ? nut_y : 0, 0])
      printed_hex_nut();
  }

  if (render_part == "knob" || render_part == "all") {
    translate([0, render_part == "all" ? knob_y : 0, 0])
      knob();
  }
}


// ============================================================================
//  Adapter (plate + body + gusset)
// ============================================================================

module adapter() {
  difference() {
    union() {
      backplate();
      adapter_body();
      gusset();
    }
    bore_subtractor();
    if (use_oring) oring_groove();
    if (ziptie_groove_enabled) ziptie_groove_subtractor();
    if (body_clamp_notch_enabled) body_clamp_notch_subtractor();
  }
}


// ----- Backplate ---------------------------------------------------------

module backplate() {
  if (plate_edge_fillet > 0) {
    // 3D edge fillet via minkowski with a sphere. The body of the plate is
    // inset by fillet_r on every dimension so the final size matches.
    fr = plate_edge_fillet;
    minkowski() {
      translate([-plate_thickness + fr, 0, 0])
        difference() {
          rotate([0, 90, 0])
            linear_extrude(height = plate_thickness - 2 * fr)
              offset(r = -fr) plate_2d_rounded();
          if (!plate_flat)
            translate([-pool_radius, 0, 0])
              cylinder(h = plate_height * 3, r = pool_radius,
                       center = true, $fn = 720);
        }
      sphere(r = fr, $fn = 24);
    }
  } else {
    difference() {
      translate([-plate_thickness, 0, 0])
        rotate([0, 90, 0])
          linear_extrude(height = plate_thickness)
            plate_2d_rounded();
      if (!plate_flat) {
        translate([-plate_thickness - pool_radius, 0, 0])
          cylinder(h = plate_height * 3, r = pool_radius,
                   center = true, $fn = 720);
      }
    }
  }
}

module plate_2d_rounded() {
  // Trapezoid with rounded corners (offset trick: shrink then re-inflate).
  // If plate_corner_radius is 0, this collapses to the bare trapezoid.
  r = plate_corner_radius;
  if (r > 0)
    offset(r = r, $fn = 40)
      offset(r = -r)
        plate_2d();
  else
    plate_2d();
}

module plate_2d() {
  // 2D trapezoid. Note the rotate(90): after the call site does
  // linear_extrude(+Z) and rotate([0,90,0]), the polygon's local x-axis
  // maps to world -Z and the local y-axis maps to world Y. Without this
  // rotate, plate_top_z (a Z value semantically) would end up in world Y,
  // making the plate stick sideways. Rotating the polygon 90° CCW in 2D
  // swaps those, so plate_top_z lands on world Z (narrow top above bore)
  // and the trapezoid's width lands in world Y (sideways), as intended.
  rotate(90)
    polygon(points = [
      [-plate_top_width/2,    plate_top_z],
      [ plate_top_width/2,    plate_top_z],
      [ plate_bottom_width/2, plate_bot_z],
      [-plate_bottom_width/2, plate_bot_z]
    ]);
}


// ----- Adapter body (outer envelope only; bore is subtracted later) -----

module adapter_body() {
  union() {
    // 1. 32 mm receiving section. Extended BACKWARD by back_stub_length so the
    //    cylinder pokes out behind the plate, giving the rubber hose a clean
    //    cylindrical surface that a clamp (printed or metal) can wrap around.
    //    The plate sits at X ∈ [-plate_thickness, 0] and gets unioned with
    //    this cylinder, so it becomes a flange around the cylinder.
    section_start = -plate_thickness - back_stub_length;
    section_h     = plate_thickness + back_stub_length + bore_32_length;
    translate([section_start, 0, 0])
      rotate([0, 90, 0])
        cylinder(h = section_h, d = od_32_section);

    // 2. Transition cone: od_32_section → barb_trough_dia
    translate([bore_32_length - EPS, 0, 0])
      rotate([0, 90, 0])
        cylinder(h = transition_length + EPS,
                 d1 = od_32_section, d2 = barb_trough_dia);

    // 3. Hose-stop ring at the start of the barbed section
    translate([gusset_apex_x - 0.75, 0, 0])
      rotate([0, 90, 0])
        cylinder(h = 1.5, d = od_hose_stop);

    // 4. Barbed section
    translate([gusset_apex_x, 0, 0])
      barbed_section();
  }
}

module barbed_section() {
  // Sawtooth barbs. Each barb starts at PEAK at its low-X end and tapers
  // to TROUGH at its high-X end. Adjacent barbs share a boundary X plane
  // where the cross-section jumps UP from trough (previous barb's end) to
  // peak (next barb's start) — a vertical cliff that catches the hose
  // during pullout (+X direction). Insertion (-X) is just up-ramps.
  // (No separate base cylinder — that caused coincident surfaces with
  // the frustum starts and showed up as F5 z-fighting / striping.)
  for (i = [0 : barb_count - 1])
    translate([i * barb_pitch, 0, 0])
      rotate([0, 90, 0])
        cylinder(h = barb_pitch,
                 d1 = barb_peak_dia, d2 = barb_trough_dia);
}


// ----- Bore subtractor (cuts through plate + body) -----------------------

module bore_subtractor() {
  // Section 1: Ø(bore_32_actual) from the back face of the back stub
  // (or, if back_stub_length=0, the rear face of the plate) all the way
  // through to the end of the 32 mm receiving section.
  translate([-plate_thickness - back_stub_length - EPS, 0, 0])
    rotate([0, 90, 0])
      cylinder(h = plate_thickness + back_stub_length + bore_32_length + EPS,
               d = bore_32_actual);

  // Section 2: ramp from Ø(bore_32_actual) → Ø(bore_50_dia) through transition
  translate([bore_32_length - EPS, 0, 0])
    rotate([0, 90, 0])
      cylinder(h = transition_length + 2 * EPS,
               d1 = bore_32_actual, d2 = bore_50_dia);

  // Section 3: Ø(bore_50_dia) through the barbed section (and slightly past)
  translate([gusset_apex_x - EPS, 0, 0])
    rotate([0, 90, 0])
      cylinder(h = barb_section_length + 2 * EPS, d = bore_50_dia);
}


// ----- Body-clamp notch (cuts through the gusset) ------------------------

module body_clamp_notch_subtractor() {
  // Rectangular notch through the gusset, sized for the inner clamp's
  // bottom half-ring to pass through. Centered on the clamp's X position,
  // spans the gusset's full Y thickness (+ small clearance), and extends
  // from just below the body's underside down past the clamp's outer
  // extent. The gusset on either side of this notch stays intact.
  ic_inner_r = (clamp_inner_hose_od - clamp_inner_squeeze) / 2;
  ic_outer_r = ic_inner_r + clamp_inner_wall;

  notch_x_w = clamp_inner_width + 2 * body_clamp_notch_extra;
  notch_y_w = gusset_thickness + 2;
  notch_z_top    = -od_32_section / 2 + EPS;
  notch_z_bottom = -ic_outer_r - 2;
  notch_z_h      = notch_z_top - notch_z_bottom;

  translate([body_clamp_notch_x, 0, (notch_z_top + notch_z_bottom) / 2])
    cube([notch_x_w, notch_y_w, notch_z_h], center = true);
}


// ----- Cable-tie groove (outside the barb section) -----------------------

module ziptie_groove_subtractor() {
  // Annular slot opening radially outward from the barb section's outer
  // surface. Cuts through ANY OD geometry it overlaps (barb peak, trough,
  // hose-stop ring, transition cone), so use ziptie_groove_pos to place it
  // somewhere sensible — typically just past the last barb peak, where the
  // groove sits in a "trough" valley and doesn't eat into a barb's grip.
  groove_outer_r = max(barb_peak_dia, od_hose_stop) / 2 + 5;
  groove_inner_r = barb_peak_dia / 2 - ziptie_groove_depth;

  translate([ziptie_groove_pos - ziptie_groove_width / 2, 0, 0])
    rotate([0, 90, 0])
      difference() {
        cylinder(h = ziptie_groove_width, r = groove_outer_r);
        translate([0, 0, -EPS])
          cylinder(h = ziptie_groove_width + 2 * EPS, r = groove_inner_r);
      }
}


// ----- O-ring groove (inside the 32 mm bore) -----------------------------

module oring_groove() {
  // Annular slot opening radially inward into the bore.
  // Sits at X = oring_pos_from_front (measured from body's X=0 face).
  groove_outer_r = bore_32_actual / 2 + oring_groove_depth;
  groove_inner_r = bore_32_actual / 2 - OVERLAP;

  translate([oring_pos_from_front - oring_groove_width / 2, 0, 0])
    rotate([0, 90, 0])
      difference() {
        cylinder(h = oring_groove_width, r = groove_outer_r);
        translate([0, 0, -EPS])
          cylinder(h = oring_groove_width + 2 * EPS, r = groove_inner_r);
      }
}


// ----- Gusset (buttress fin under the adapter) ---------------------------

module gusset() {
  difference() {
    if (gusset_edge_fillet > 0) {
      // 3D edge fillet on the OUTER solid only (hex holes are cut afterward
      // through the filleted solid so the holes themselves stay sharp and
      // their original size). Inset the 2D profile by fr and the extrusion
      // thickness by 2*fr; minkowski with a sphere of radius fr re-bloats
      // back to the original outer dimensions while rounding every edge.
      fr = gusset_edge_fillet;
      inset_thickness = max(0.1, gusset_thickness - 2 * fr);
      minkowski() {
        translate([0, -inset_thickness / 2, 0])
          rotate([90, 0, 0])
            translate([0, 0, -inset_thickness])
              linear_extrude(height = inset_thickness)
                mirror([0, 1, 0])
                  offset(r = -fr)
                    gusset_profile_2d();
        sphere(r = fr, $fn = 16);
      }
    } else {
      // No fillet: plain extrude of the profile.
      translate([0, -gusset_thickness / 2, 0])
        rotate([90, 0, 0])
          translate([0, 0, -gusset_thickness])
            linear_extrude(height = gusset_thickness)
              mirror([0, 1, 0])
                gusset_profile_2d();
    }

    // Hex holes through the FINAL gusset thickness (after any fillet has
    // been applied). Holes stay hex-shaped and the full thickness; no offset
    // on the 2D shape so the visible hole size is unchanged when fillet is on.
    if (gusset_use_hex) {
      translate([0, -gusset_thickness / 2 - EPS, 0])
        rotate([90, 0, 0])
          translate([0, 0, -gusset_thickness - 2 * EPS])
            linear_extrude(height = gusset_thickness + 4 * EPS)
              mirror([0, 1, 0])
                hex_holes_2d();
    }
  }
}

module gusset_profile_2d() {
  // 2D polygon, returned in positive-Y space. The call site applies
  // mirror([0,1,0]) before extruding, which flips Y → -Y so the final
  // world Z values are negative (the gusset hangs below the adapter).
  // hex_holes_2d() consumes this polygon WITHOUT the mirror, so the
  // hex grid is also built in positive-Y space.
  //
  // Traversal order:
  //   plate-rear-top → top edge along adapter underside → apex
  //   → bezier sweep down → plate-bottom-front-corner → close up the
  //   plate face to start.

  // Top edge: sample adapter underside from X=0 to X=apex, intruding into
  // the adapter body by OVERLAP so the union has a real overlap (not just a
  // tangent line — see CLAUDE.md "CSG / boolean joints").
  // Then add an explicit apex point at the hose-stop underside, since the
  // adapter underside there is at -barb_trough/2 but the apex (where the
  // bezier starts) is at -od_hose_stop/2 (slightly lower).
  top_samples = 12;
  top_intrude = gusset_adapter_overlap;
  top = concat(
    // Leftmost point: intruded into BOTH the plate (X = -OVERLAP) and the
    // adapter body (Z = -od_32/2 + top_intrude).
    [[-OVERLAP, -od_32_section / 2 + top_intrude]],
    [
      for (i = [1 : top_samples])
        let (x = i * gusset_apex_x / top_samples)
        [x, -adapter_outer_radius_at(x) + top_intrude]
    ],
    // Explicit apex point at the hose-stop ring underside
    [[gusset_apex_x, gusset_apex_z + top_intrude]]
  );

  // Bottom/front edge: cubic Bezier from apex down to plate bottom-front
  // corner. Apex AND last point intruded by OVERLAP so the gusset overlaps
  // the adapter body and the plate (CLAUDE.md union rule).
  apex_z_int = gusset_apex_z + top_intrude;
  bez_samples = 30;
  p0 = [gusset_apex_x, apex_z_int];
  p1 = [gusset_apex_x,
        apex_z_int + (plate_bot_z - apex_z_int) * gusset_bezier_droop];
  p2 = [gusset_apex_x * (1 - gusset_bezier_droop), plate_bot_z];
  p3 = [-OVERLAP, plate_bot_z];
  bez = [
    for (i = [1 : bez_samples])
      bezier3(i / bez_samples, p0, p1, p2, p3)
  ];

  // 2D polygon Y values must end up as world Z (negative) after the
  // call-site mirror. Build with positive Y here; the mirror flips later.
  pts = [for (p = concat(top, bez)) [p[0], -p[1]]];

  polygon(points = pts);
}

function adapter_outer_radius_at(x) =
  x <= bore_32_length        ? od_32_section / 2 :
  x <= gusset_apex_x         ?
      od_32_section / 2 +
      (barb_trough_dia / 2 - od_32_section / 2) *
      ((x - bore_32_length) / transition_length) :
      barb_trough_dia / 2;

function bezier3(t, p0, p1, p2, p3) =
  let (u = 1 - t)
  pow(u, 3) * p0 +
  3 * pow(u, 2) * t * p1 +
  3 * u * pow(t, 2) * p2 +
  pow(t, 3) * p3;


// ----- Hex hole pattern (2D) ---------------------------------------------

module hex_holes_2d() {
  // Holes = (interior of gusset, inset by frame width) ∩ (hex grid).
  // Both sub-expressions live in positive-Y space (matching gusset_profile_2d
  // before the outer mirror at the call site).
  intersection() {
    offset(r = -gusset_frame_width)
      gusset_profile_2d();
    hex_grid_2d();
  }
}

module hex_grid_2d() {
  // Pointy-top hex tiling. Cell = flat-to-flat (width), so the hexes are
  // taller than they are wide. The pointed top means the upper edge of each
  // hole is a 60° peak — easy to bridge in PETG without supports.
  R       = gusset_hex_cell / sqrt(3);  // circumradius
  h_pitch = gusset_hex_cell + gusset_hex_wall;
  v_pitch = 1.5 * R + gusset_hex_wall * sqrt(3) / 2;
  off     = h_pitch / 2;

  // Cover the gusset bounding box (mirrored, so Y > 0 here).
  x_min = -gusset_hex_cell;
  x_max = gusset_apex_x + gusset_hex_cell;
  y_min = -(gusset_rear_z) - gusset_hex_cell;        // since mirrored
  y_max = -(plate_bot_z) + gusset_hex_cell;

  nx = ceil((x_max - x_min) / h_pitch) + 2;
  ny = ceil((y_max - y_min) / v_pitch) + 2;

  for (i = [0 : nx], j = [0 : ny])
    translate([x_min + i * h_pitch + (j % 2) * off,
               y_min + j * v_pitch])
      rotate(30)                       // cylinder default = flat-top; +30° = pointy-top
        circle(r = R, $fn = 6);
}


// ============================================================================
//  Clamp (two-piece split ring) — parameterized for any hose size
// ============================================================================

// Public wrappers ------------------------------------------------------------

module clamp(assembled = false) {
  // Outer clamp for the drain hose. assembled=true keeps both halves at
  // the same Y for assembled-preview rendering; false (the default) spreads
  // them apart so they can be printed flat side-by-side.
  _clamp_pair(
    hose_od   = clamp_hose_od,
    squeeze   = clamp_squeeze,
    wall      = clamp_wall,
    width     = clamp_width,
    flange_x  = clamp_flange_x,
    flange_y  = clamp_flange_y,
    assembled = assembled
  );
}

module clamp_inner(assembled = false) {
  _clamp_pair(
    hose_od   = clamp_inner_hose_od,
    squeeze   = clamp_inner_squeeze,
    wall      = clamp_inner_wall,
    width     = clamp_inner_width,
    flange_x  = clamp_inner_flange_x,
    flange_y  = clamp_inner_flange_y,
    assembled = assembled
  );
}


// Implementation -------------------------------------------------------------

module _clamp_pair(hose_od, squeeze, wall, width, flange_x, flange_y,
                   assembled = false) {
  // assembled=true: both halves at Y=0 (touching at the split plane) for
  // visualizing the clamped state. assembled=false: bottom half offset in
  // -Y so both halves print flat side-by-side on the bed.
  _clamp_half(is_top = true,  hose_od = hose_od, squeeze = squeeze,
              wall = wall, width = width,
              flange_x = flange_x, flange_y = flange_y);
  translate([0, assembled ? 0 : -(hose_od / 2 + flange_y + 8), 0])
    _clamp_half(is_top = false, hose_od = hose_od, squeeze = squeeze,
                wall = wall, width = width,
                flange_x = flange_x, flange_y = flange_y);
}

module _clamp_half(is_top, hose_od, squeeze, wall, width, flange_x, flange_y) {
  inner_r = (hose_od - squeeze) / 2;
  outer_r = inner_r + wall;
  sign    = is_top ? 1 : -1;

  difference() {
    union() {
      // Half-ring (annulus clipped to one Y half-space)
      linear_extrude(height = width)
        intersection() {
          difference() {
            circle(r = outer_r);
            circle(r = inner_r);
          }
          _half_space_2d(sign, outer_r, flange_x);
        }

      // Two flanges: each extends INWARD to X = inner_r so it covers the
      // ring's full annular wall thickness at the tip (much stronger union
      // than the previous tangent contact at outer_r).
      for (xs = [-1, 1])
        translate([xs * outer_r, 0, 0])
          mirror([xs < 0 ? 1 : 0, 0, 0])
            linear_extrude(height = width)
              _flange_outline_2d(sign = sign, wall = wall,
                                 flange_x = flange_x, flange_y = flange_y);
    }

    // Bolt holes along Y, centered in width
    for (xs = [-1, 1])
      translate([xs * (outer_r + flange_x / 2), 0, width / 2])
        rotate([90, 0, 0])
          cylinder(h = 4 * flange_y,
                   d = clamp_screw_dia + clamp_screw_clearance,
                   center = true);

    // Hex nut pockets on the bottom half only — open from the OUTER face
    // (Y = -flange_y) so a hex nut can be dropped in before assembly.
    // Pocket depth auto-adjusts per clamp: deep enough to capture the nut
    // (up to its full height) but shallow enough to leave at least
    // flange_back_thickness mm of material behind it. For thin flanges
    // (e.g. inner clamp flange_y = 5), this gives a shallow ~2 mm recess
    // that just keeps the nut from rotating — the rest of the nut sits
    // proud of the flange's outer face.
    if (!is_top) {
      pocket_d     = clamp_nut_af / cos(30) + clamp_nut_clearance;
      pocket_depth = min(clamp_nut_thickness,
                         max(1.0, flange_y - flange_back_thickness));
      for (xs = [-1, 1])
        translate([xs * (outer_r + flange_x / 2),
                   -flange_y + pocket_depth,
                   width / 2])
          rotate([90, 0, 0])
            cylinder(h = pocket_depth + EPS,
                     d = pocket_d, $fn = 6);
    }
  }
}

module _flange_outline_2d(sign, wall, flange_x, flange_y) {
  // Flange spans local X from -wall (= inner_r in clamp-half world) to
  // flange_x (the outer end). The inward extension by `wall` gives a large
  // overlap with the ring's annular tip — about 16× the area of the old
  // tangent-only contact, so the flange unions solidly with the ring.
  // The flange's inner edge (at X = inner_r in world) coincides with the
  // bore wall, so the flange does NOT extend into the bore.
  full_x = wall + flange_x;
  if (sign > 0)
    translate([-wall, 0])
      square([full_x, flange_y]);
  else
    translate([-wall, -flange_y])
      square([full_x, flange_y]);
}

module _half_space_2d(sign, outer_r, flange_x) {
  // Large square covering one Y half-space, sized to the clamp's extent.
  S = max(outer_r, flange_x) * 4;
  if (sign > 0)
    translate([-S/2, 0]) square([S, S]);
  else
    translate([-S/2, -S]) square([S, S]);
}


// ============================================================================
//  Printed thumbscrew + hex nut (all-PETG hardware option)
// ============================================================================

module printed_thumbscrew() {
  // Threaded shaft along +Z, wing head at the top.
  // The bolt is intended to thread through the top clamp half's clearance
  // hole, through the bottom half's clearance hole, and into the hex pocket
  // of the bottom half where a printed M6 hex nut is captured.
  printed_external_thread(d_major = clamp_screw_dia,
                          pitch   = thumb_thread_pitch,
                          length  = thumb_thread_length);

  // Smooth neck blending into the hub
  translate([0, 0, thumb_thread_length - EPS])
    cylinder(d = clamp_screw_dia, h = 1.0, $fn = 32);

  // Hub + wings
  translate([0, 0, thumb_thread_length + 1.0 - EPS])
    union() {
      cylinder(d = thumb_hub_d, h = thumb_hub_h, $fn = 32);
      // Wings: two-ended rounded bar centered on the bolt axis. Tip
      // diameter = wing_width so the wing ends are half-circles.
      translate([0, 0, thumb_hub_h / 2])
        hull() {
          translate([(thumb_wing_length - thumb_wing_width) / 2, 0, 0])
            cylinder(d = thumb_wing_width, h = thumb_wing_thickness,
                     center = true, $fn = 32);
          translate([-(thumb_wing_length - thumb_wing_width) / 2, 0, 0])
            cylinder(d = thumb_wing_width, h = thumb_wing_thickness,
                     center = true, $fn = 32);
        }
    }
}

module printed_hex_nut() {
  // M6 hex nut. Outer hex sized to clamp_nut_af (across flats); inner
  // threaded bore subtracted via an oversized external-thread helix.
  // Rotated 30° so a flat (not a vertex) faces +X, matching how a real
  // hex nut would sit in the rectangular hex pocket of the flange.
  rotate([0, 0, 30])
    difference() {
      cylinder(d = clamp_nut_af / cos(30), h = clamp_nut_thickness, $fn = 6);
      translate([0, 0, -EPS])
        printed_external_thread(
          d_major = clamp_screw_dia + thumb_thread_clearance,
          pitch   = thumb_thread_pitch,
          length  = clamp_nut_thickness + 2 * EPS);
    }
}

module printed_external_thread(d_major, pitch, length) {
  // Right-handed external thread, swept as a linear_extrude+twist of a
  // 2D profile (cylinder cross-section + one trapezoidal tooth).
  // Trapezoidal profile is more printable in PETG than a sharp V — the
  // narrower top + wider root prints reliably with no support and has
  // tolerant fits even at coarse pitch.
  thread_h = pitch * 0.5;
  d_minor  = d_major - 2 * thread_h;
  w_top    = pitch * 0.30;
  w_bot    = pitch * 0.50;
  twist    = -360 * length / pitch;
  slices   = max(20, ceil(length * 8 / pitch));

  linear_extrude(height = length, twist = twist, slices = slices, convexity = 6)
    union() {
      circle(d = d_minor, $fn = 32);
      polygon([
        [d_minor / 2 - 0.01, -w_bot / 2],
        [d_major / 2,        -w_top / 2],
        [d_major / 2,         w_top / 2],
        [d_minor / 2 - 0.01,  w_bot / 2]
      ]);
    }
}


// ============================================================================
//  Knob (optional cap that grips an M5 hex screw head)
// ============================================================================

module knob() {
  difference() {
    knurled_cylinder(knob_dia, knob_height,
                     knob_knurl_count, knob_knurl_depth);
    // Hex socket on the bottom (opens at Z = 0)
    translate([0, 0, -EPS])
      cylinder(h = knob_socket_depth + EPS,
               d = clamp_nut_af / cos(30) + knob_socket_clearance,
               $fn = 6);
  }
}

module knurled_cylinder(d, h, n, depth) {
  difference() {
    cylinder(h = h, d = d);
    for (i = [0 : n - 1])
      rotate([0, 0, (i + 0.5) * 360 / n])
        translate([d / 2, 0, -EPS])
          cylinder(h = h + 2 * EPS, d = depth * 2);
  }
}
