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
  const min = 0.0001 * frameRadius, max = 10000 * frameRadius;
  return Math.min(max, Math.max(min, radius));
}

export type CameraSettings = {
  primaryMouseButton: 'pan' | 'rotate';
  wasdNav: boolean;
};

type AttachOptions = {
  axesViewerEl?: HTMLElement | null;
  // Reads current settings each time. Returning a fresh object every call is
  // fine; we don't memoize. The controller polls this in event handlers and
  // in the per-frame loop, so updates take effect immediately.
  getSettings?: () => CameraSettings;
  // Fires every time the model-viewer's 'load' event resolves, AFTER the
  // controller has captured the new auto-framed radius. Letting the caller
  // know the radius lets it scale stashed camera state when the bbox changes
  // between models (so e.g. swapping a font doesn't break the camera).
  onFrameRadiusUpdate?: (radius: number) => void;
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
  let frameRadius = NaN;

  // Re-capture frameRadius on every 'load' so the clamp range stays accurate
  // even when the model bbox changes (e.g. font swap). Defer one rAF: at the
  // moment 'load' fires, model-viewer hasn't always materialized the auto-
  // framed orbit yet, so getCameraOrbit().radius can return a relative '%'
  // value (a tiny unitless number) instead of the settled absolute meter
  // value. Waiting one frame avoids capturing that garbage.
  const onAnyLoad = () => {
    requestAnimationFrame(() => {
      try {
        const r = el.getCameraOrbit().radius;
        if (Number.isFinite(r) && r > 0) {
          frameRadius = r;
          opts.onFrameRadiusUpdate?.(r);
        }
      } catch {}
    });
  };
  el.addEventListener('load', onAnyLoad);

  // Near-plane override. model-viewer's internal `updateNearFar` clamps the
  // camera near to `far / 1000`, so once you zoom closer than ~0.1% of the
  // bounding box, geometry between camera and near gets clipped and the model
  // appears to vanish. The scene + camera live on symbol-keyed properties of
  // the element (not `el.scene` / `el.camera`), so we walk own symbols to find
  // the scene object — it's identified by having an `updateNearFar` method.
  // We re-assert near every animation frame because model-viewer re-clamps it
  // on its own schedule.
  type ThreeCameraLike = { near: number; far: number; updateProjectionMatrix?: () => void };
  type ModelSceneLike = { camera?: ThreeCameraLike; getCamera?: () => ThreeCameraLike; updateNearFar: (n: number, f: number) => void };

  let cachedScene: ModelSceneLike | null = null;
  function findScene(): ModelSceneLike | null {
    if (cachedScene) return cachedScene;
    const anyEl = el as unknown as Record<string | symbol, unknown>;
    for (const sym of Object.getOwnPropertySymbols(el)) {
      const v = anyEl[sym] as ModelSceneLike | undefined;
      if (v && typeof v.updateNearFar === 'function') {
        cachedScene = v;
        return v;
      }
    }
    return null;
  }
  function getCamera(scene: ModelSceneLike): ThreeCameraLike | null {
    return scene.getCamera?.() ?? scene.camera ?? null;
  }

  const defaultSettings: CameraSettings = { primaryMouseButton: 'pan', wasdNav: true };
  const readSettings = (): CameraSettings => opts.getSettings?.() ?? defaultSettings;

  type Mode = 'rotate' | 'pan' | null;
  const activePointers = new Map<number, { x: number; y: number; type: string }>();
  let mode: Mode = null;
  let lastCentroidX = 0, lastCentroidY = 0;
  let lastPinchDist = 0;

  // Keys currently held for WASD/QE walk-mode (active only while a mouse-rotate
  // gesture is in progress — Unity scene-view convention: hold the rotate
  // button to fly).
  const heldKeys = new Set<string>();
  let lastFrameTs = 0;

  let rafId = 0;
  const tick = (ts: number) => {
    // 1) Near-plane override
    const scene = findScene();
    const cam = scene ? getCamera(scene) : null;
    if (cam && Number.isFinite(cam.far) && cam.far > 0) {
      const desiredNear = Math.max(1e-6, cam.far * 1e-7);
      if (cam.near !== desiredNear) {
        cam.near = desiredNear;
        cam.updateProjectionMatrix?.();
      }
    }

    // 2) WASD/QE walk while the rotate mouse button is held
    const settings = readSettings();
    const dt = lastFrameTs ? (ts - lastFrameTs) / 1000 : 0;
    lastFrameTs = ts;
    if (
      settings.wasdNav &&
      mode === 'rotate' &&
      heldKeys.size > 0 &&
      dt > 0 && dt < 0.25
    ) {
      stepWalk(dt);
    }

    rafId = requestAnimationFrame(tick);
  };
  rafId = requestAnimationFrame(tick);

  function updateOrbit(theta: number, phi: number, radius: number) {
    const orbit = el.getCameraOrbit();
    orbit.theta = theta;
    orbit.phi = clampPhi(phi);
    orbit.radius = Number.isFinite(frameRadius) ? clampRadius(radius, frameRadius) : radius;
    el.cameraOrbit = orbit.toString();
    if (opts.axesViewerEl) {
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
    // Unity scene-view feels around 0.005 rad/pixel for RMB look.
    const sens = readSettings().wasdNav ? 0.005 : 0.02;
    const newTheta = orbit.theta - dx * sens;
    const newPhi = clampPhi(orbit.phi - dy * sens);

    if (readSettings().wasdNav) {
      // Free-look (FPS-style): pivot is the camera itself, not the target.
      // model-viewer computes camera position from target + sphericalOffset, so
      // to rotate the camera in place we change the angles AND move target so
      // the resulting camera position is identical to before.
      //   camera = target + (sin φ · sin θ, cos φ, sin φ · cos θ) · radius
      const target = el.getCameraTarget();
      const sp0 = Math.sin(orbit.phi),   cp0 = Math.cos(orbit.phi);
      const st0 = Math.sin(orbit.theta), ct0 = Math.cos(orbit.theta);
      const camX = target.x + sp0 * st0 * orbit.radius;
      const camY = target.y + cp0       * orbit.radius;
      const camZ = target.z + sp0 * ct0 * orbit.radius;

      const sp1 = Math.sin(newPhi),   cp1 = Math.cos(newPhi);
      const st1 = Math.sin(newTheta), ct1 = Math.cos(newTheta);
      updateTarget(
        camX - sp1 * st1 * orbit.radius,
        camY - cp1       * orbit.radius,
        camZ - sp1 * ct1 * orbit.radius,
      );
    }
    updateOrbit(newTheta, newPhi, orbit.radius);
  }

  function pan(dx: number, dy: number) {
    const orbit = el.getCameraOrbit();
    const { right, up } = sphericalBasis(orbit.theta, orbit.phi);
    const target = el.getCameraTarget();
    const scale = orbit.radius * 0.0025;
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
    // Primary = LMB, Secondary = RMB. The user's `primaryMouseButton` setting
    // says what the primary button does; the other gets the opposite. MMB is
    // always pan. Shift inverts the primary action.
    const primary = readSettings().primaryMouseButton;
    const secondary: Mode = primary === 'pan' ? 'rotate' : 'pan';
    if (button === 1) return 'pan';
    if (button === 2) return secondary;
    if (button === 0) {
      if (shift) return secondary;
      return primary;
    }
    return null;
  }

  // Walk-step: translates camera target along the camera's own basis (true
  // free-fly relative to where the camera is currently looking).
  //   W/S = forward / backward along the look direction (tilts with the view).
  //   A/D = strafe along camera-right.
  //   Q/E = up / down along camera-up (perpendicular to look, in screen-up).
  function stepWalk(dt: number) {
    const orbit = el.getCameraOrbit();
    const target = el.getCameraTarget();

    let fwdAmt = 0, rightAmt = 0, upAmt = 0;
    if (heldKeys.has('w')) fwdAmt   += 1;
    if (heldKeys.has('s')) fwdAmt   -= 1;
    if (heldKeys.has('d')) rightAmt += 1;
    if (heldKeys.has('a')) rightAmt -= 1;
    if (heldKeys.has('q')) upAmt    += 1;
    if (heldKeys.has('e')) upAmt    -= 1;
    if (fwdAmt === 0 && rightAmt === 0 && upAmt === 0) return;

    // Speed proportional to radius so it feels right whether zoomed in tight
    // or pulled back. Tuned so a held key crosses ~1 radius/sec.
    const speed = orbit.radius * 1.2;

    // Camera-relative basis. `right` and `up` come from sphericalBasis; the
    // forward (look) direction is the negated camera-from-target offset for
    // model-viewer's orbital convention: cam = (sin φ sin θ, cos φ, sin φ cos θ).
    const { right, up } = sphericalBasis(orbit.theta, orbit.phi);
    const st = Math.sin(orbit.theta), ct = Math.cos(orbit.theta);
    const sp = Math.sin(orbit.phi),   cp = Math.cos(orbit.phi);
    const fwd: [number, number, number] = [-sp * st, -cp, -sp * ct];

    const sF = fwdAmt   * speed * dt;
    const sR = rightAmt * speed * dt;
    const sU = upAmt    * speed * dt;

    const nx = target.x + sF * fwd[0] + sR * right[0] + sU * up[0];
    const ny = target.y + sF * fwd[1] + sR * right[1] + sU * up[1];
    const nz = target.z + sF * fwd[2] + sR * right[2] + sU * up[2];
    updateTarget(nx, ny, nz);
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

    if (e.pointerType !== 'mouse') {
      mode = activePointers.size === 1 ? 'rotate' : 'pan';
    }

    if (mode === 'rotate') rotate(dx, dy);
    else if (mode === 'pan') pan(dx, dy);

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
      const c = centroid();
      lastCentroidX = c.x;
      lastCentroidY = c.y;
      lastPinchDist = pinchDistance();
      mode = e.pointerType === 'mouse' ? null : 'rotate';
    }
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    // Exponential scaling: smooth for trackpads (small deltaY), responsive for mouse wheels (big deltaY).
    // deltaY≈100 (one mouse-wheel notch) → ~1.65x; deltaY≈10 (trackpad tick) → ~1.05x.
    const factor = Math.exp(e.deltaY * 0.005);
    zoom(factor);
  };

  const onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  // WASD/QE work only while the rotate mouse button is held — Unity scene-view
  // fly mode. Listening on window so focus state doesn't matter mid-drag.
  const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'q', 'e']);
  const onKeyDown = (e: KeyboardEvent) => {
    if (!readSettings().wasdNav) return;
    if (mode !== 'rotate') return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key.toLowerCase();
    if (!WALK_KEYS.has(k)) return;
    heldKeys.add(k);
    e.preventDefault();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    const k = e.key.toLowerCase();
    if (heldKeys.has(k)) {
      heldKeys.delete(k);
      e.preventDefault();
    }
  };
  const onBlur = () => { heldKeys.clear(); };

  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('wheel', onWheel, { passive: false });
  el.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    el.removeEventListener('pointerdown', onPointerDown);
    el.removeEventListener('pointermove', onPointerMove);
    el.removeEventListener('pointerup', onPointerUp);
    el.removeEventListener('pointercancel', onPointerUp);
    el.removeEventListener('wheel', onWheel);
    el.removeEventListener('contextmenu', onContextMenu);
    el.removeEventListener('load', onAnyLoad);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    cancelAnimationFrame(rafId);
  };
}
