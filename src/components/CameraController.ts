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

type AttachOptions = {
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
  let frameRadius = NaN;

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
    const sens = 0.015;
    updateOrbit(orbit.theta - dx * sens, orbit.phi - dy * sens, orbit.radius);
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
    if (button === 2) return 'rotate';
    if (button === 1) return 'pan';
    if (button === 0) return shift ? 'rotate' : 'pan';
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
