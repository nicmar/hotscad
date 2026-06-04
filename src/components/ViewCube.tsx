import React, { useEffect, useRef, useState, useCallback } from 'react';

/**
 * Fusion-style view cube. Clicking a face snaps the main viewer's camera to that face.
 * Double-clicking the SAME face toggles between perspective and a fake-orthographic mode
 * (achieved by collapsing field-of-view to ~1deg while scaling radius to preserve framing).
 *
 * Drag-to-orbit is handled by the main viewer's CameraController; this widget just
 * mirrors the camera's orientation and exposes face-click navigation.
 */
type ModelViewerEl = HTMLElement & {
  getCameraOrbit: () => { theta: number; phi: number; radius: number; toString: () => string };
  cameraOrbit: string;
  fieldOfView: string;
  getFieldOfView?: () => number;
};

type FaceId = 'front' | 'back' | 'left' | 'right' | 'top' | 'bottom';

// Maps each face to the (theta, phi) the camera should be at to look AT that face.
const FACE_ORBITS: Record<FaceId, [number, number]> = {
  front:  [0,            Math.PI / 2],
  back:   [Math.PI,      Math.PI / 2],
  right:  [Math.PI / 2,  Math.PI / 2],
  left:   [-Math.PI / 2, Math.PI / 2],
  top:    [0,            0.0001],
  bottom: [0,            Math.PI - 0.0001],
};

const FACE_LABEL: Record<FaceId, string> = {
  front: 'FRONT', back: 'BACK', right: 'RIGHT',
  left: 'LEFT', top: 'TOP', bottom: 'BOTTOM',
};

export function ViewCube({
  modelViewerRef,
  onHomeClick,
  onFitClick,
}: {
  modelViewerRef: React.MutableRefObject<ModelViewerEl | undefined>;
  onHomeClick: () => void;
  onFitClick: () => void;
}) {
  const [orbit, setOrbit] = useState<{theta: number; phi: number}>({theta: Math.PI / 4, phi: Math.PI / 4});
  const lastClickRef = useRef<{face: FaceId; time: number} | null>(null);
  const isOrthoRef = useRef<boolean>(false);
  const savedFovRef = useRef<number | null>(null);

  // Poll/listen for camera-change to sync the cube's rotation.
  useEffect(() => {
    const el = modelViewerRef.current;
    if (!el) return;
    const onCameraChange = () => {
      try {
        const o = el.getCameraOrbit();
        setOrbit({theta: o.theta, phi: o.phi});
      } catch { /* ignore */ }
    };
    onCameraChange();
    el.addEventListener('camera-change', onCameraChange);
    return () => el.removeEventListener('camera-change', onCameraChange);
  }, [modelViewerRef.current]);

  const setCameraToFace = useCallback((face: FaceId) => {
    const el = modelViewerRef.current;
    if (!el) return;
    try {
      const [theta, phi] = FACE_ORBITS[face];
      const cur = el.getCameraOrbit();
      el.cameraOrbit = `${theta}rad ${phi}rad ${cur.radius}m`;
    } catch { /* ignore */ }
  }, [modelViewerRef.current]);

  const toggleOrtho = useCallback(() => {
    const el = modelViewerRef.current;
    if (!el) return;
    try {
      if (!isOrthoRef.current) {
        // Switch to fake ortho: collapse FOV, push radius outward to preserve apparent size.
        const fov = el.getFieldOfView?.() ?? 45;
        savedFovRef.current = fov;
        const cur = el.getCameraOrbit();
        const newFov = 1;
        const factor = Math.tan(fov * Math.PI / 360) / Math.tan(newFov * Math.PI / 360);
        el.fieldOfView = `${newFov}deg`;
        el.cameraOrbit = `${cur.theta}rad ${cur.phi}rad ${cur.radius * factor}m`;
        isOrthoRef.current = true;
      } else {
        const fov = savedFovRef.current ?? 45;
        const newFov = 1;
        const cur = el.getCameraOrbit();
        const factor = Math.tan(newFov * Math.PI / 360) / Math.tan(fov * Math.PI / 360);
        el.fieldOfView = `${fov}deg`;
        el.cameraOrbit = `${cur.theta}rad ${cur.phi}rad ${cur.radius * factor}m`;
        isOrthoRef.current = false;
      }
    } catch { /* ignore */ }
  }, [modelViewerRef.current]);

  const handleFaceClick = useCallback((face: FaceId) => {
    const now = performance.now();
    const last = lastClickRef.current;
    if (last && last.face === face && (now - last.time) < 600) {
      // Second click on the same face → toggle ortho.
      toggleOrtho();
      lastClickRef.current = null;
    } else {
      setCameraToFace(face);
      lastClickRef.current = {face, time: now};
    }
  }, [setCameraToFace, toggleOrtho]);

  // Drag-to-rotate. Sets cameraOrbit on the main viewer; the cube re-renders via
  // the camera-change listener.
  const dragRef = useRef<{x: number; y: number; pointerId: number} | null>(null);
  const dragMovedRef = useRef<boolean>(false);

  const onPointerDownCube = useCallback((e: React.PointerEvent) => {
    if (e.button !== 0) return; // LMB only
    const el = modelViewerRef.current;
    if (!el) return;
    dragRef.current = {x: e.clientX, y: e.clientY, pointerId: e.pointerId};
    dragMovedRef.current = false;
    // Intentionally NOT calling setPointerCapture here: capturing on pointerdown
    // routes the subsequent click event to the wrapper, stealing it from the
    // face div's onClick. We capture only once a real drag is detected.
  }, []);

  const onPointerMoveCube = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.x;
    const dy = e.clientY - drag.y;
    if (!dragMovedRef.current && Math.abs(dx) + Math.abs(dy) > 3) {
      dragMovedRef.current = true;
      try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
    }
    if (!dragMovedRef.current) return;
    drag.x = e.clientX;
    drag.y = e.clientY;
    const el = modelViewerRef.current;
    if (!el) return;
    try {
      const o = el.getCameraOrbit();
      const sens = 0.012;
      const newTheta = o.theta - dx * sens;
      let newPhi = o.phi - dy * sens;
      newPhi = Math.max(0.01, Math.min(Math.PI - 0.01, newPhi));
      el.cameraOrbit = `${newTheta}rad ${newPhi}rad ${o.radius}m`;
    } catch { /* ignore */ }
  }, []);

  const onPointerUpCube = useCallback((e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
    dragRef.current = null;
  }, []);

  // Clicks on faces should fire ONLY if drag didn't move (otherwise drag-release would also snap).
  const handleFaceClickWithDragGuard = useCallback((face: FaceId) => {
    if (dragMovedRef.current) {
      dragMovedRef.current = false;
      return;
    }
    handleFaceClick(face);
  }, [handleFaceClick]);

  // The cube needs to show what the camera sees. The camera orbits the model;
  // the cube must rotate so its currently-visible face matches the camera's direction.
  // In model-viewer convention (Y-up, theta = azimuth, phi = polar from +Y):
  //   theta = 0,  phi = PI/2  → camera at +Z, looking at origin → user sees FRONT face
  // We rotate the cube by inverse of camera rotation: rotateX(phi - PI/2) then rotateY(-theta).
  const rx = (orbit.phi - Math.PI / 2) * 180 / Math.PI;
  const ry = -orbit.theta * 180 / Math.PI;

  const faceStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0, top: 0,
    width: '60px', height: '60px',
    background: 'var(--vc-face-bg)',
    border: '1px solid var(--surface-border-strong)',
    color: 'var(--vc-face-fg)',
    font: '600 11px/60px Helvetica, Arial, sans-serif',
    textAlign: 'center',
    userSelect: 'none',
    cursor: 'pointer',
    backfaceVisibility: 'hidden',
    boxSizing: 'border-box',
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: '8px',
        right: '8px',
        zIndex: 11,
        width: '110px',
        height: '110px',
        userSelect: 'none',
        pointerEvents: 'none',
      }}
    >
      {/* Home (top-left) - reset to default isometric */}
      <button
        title="Home view"
        onClick={onHomeClick}
        style={{
          position: 'absolute',
          top: 0, left: 0,
          width: '22px', height: '22px',
          background: 'var(--vc-btn-bg)',
          border: '1px solid var(--surface-border-strong)',
          color: 'var(--vc-face-fg)',
          borderRadius: '3px',
          cursor: 'pointer',
          padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'auto',
        }}
      >
        <i className="pi pi-home" style={{fontSize: '12px'}} />
      </button>

      {/* Fit-to-view (top-right) - keep current angle, frame the model */}
      <button
        title="Fit to view"
        onClick={onFitClick}
        style={{
          position: 'absolute',
          top: 0, right: 0,
          width: '22px', height: '22px',
          background: 'var(--vc-btn-bg)',
          border: '1px solid var(--surface-border-strong)',
          color: 'var(--vc-face-fg)',
          borderRadius: '3px',
          cursor: 'pointer',
          padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'auto',
        }}
      >
        <i className="pi pi-arrows-alt" style={{fontSize: '12px'}} />
      </button>

      {/* The cube */}
      <div
        style={{
          position: 'absolute',
          top: '24px',
          left: '24px',
          width: '60px',
          height: '60px',
          perspective: '300px',
          pointerEvents: 'auto',
          cursor: 'grab',
        }}
        onPointerDown={onPointerDownCube}
        onPointerMove={onPointerMoveCube}
        onPointerUp={onPointerUpCube}
        onPointerCancel={onPointerUpCube}
      >
        <div
          style={{
            position: 'relative',
            width: '60px',
            height: '60px',
            transformStyle: 'preserve-3d',
            transform: `rotateX(${rx}deg) rotateY(${ry}deg)`,
            transition: dragRef.current ? 'none' : 'transform 0.18s ease-out',
          }}
        >
          {/* Each face is positioned and rotated to its cube position. 30px = half-side. */}
          <div onClick={() => handleFaceClickWithDragGuard('front')}  style={{...faceStyle, transform: 'translateZ(30px)'}}>{FACE_LABEL.front}</div>
          <div onClick={() => handleFaceClickWithDragGuard('back')}   style={{...faceStyle, transform: 'rotateY(180deg) translateZ(30px)'}}>{FACE_LABEL.back}</div>
          <div onClick={() => handleFaceClickWithDragGuard('right')}  style={{...faceStyle, transform: 'rotateY(90deg) translateZ(30px)'}}>{FACE_LABEL.right}</div>
          <div onClick={() => handleFaceClickWithDragGuard('left')}   style={{...faceStyle, transform: 'rotateY(-90deg) translateZ(30px)'}}>{FACE_LABEL.left}</div>
          <div onClick={() => handleFaceClickWithDragGuard('top')}    style={{...faceStyle, transform: 'rotateX(90deg) translateZ(30px)'}}>{FACE_LABEL.top}</div>
          <div onClick={() => handleFaceClickWithDragGuard('bottom')} style={{...faceStyle, transform: 'rotateX(-90deg) translateZ(30px)'}}>{FACE_LABEL.bottom}</div>
        </div>
      </div>

      {/* Small XYZ tripod indicator below the cube */}
      <svg
        width="40"
        height="40"
        viewBox="-20 -20 40 40"
        style={{
          position: 'absolute',
          bottom: 0,
          left: '35px',
          pointerEvents: 'none',
        }}
      >
        <Tripod theta={orbit.theta} phi={orbit.phi} />
      </svg>
    </div>
  );
}

/**
 * Tiny X/Y/Z arrows in a square SVG, oriented to match the camera. Same projection
 * as the main viewer.
 */
function Tripod({theta, phi}: {theta: number; phi: number}) {
  // Project a unit vector along each world axis to screen space using the same
  // basis derivation as projectToViewport. We only need 2D direction here.
  // model-viewer's orientation="0deg -90deg 0deg" remaps (x,y,z)_OFF → (x,z,-y)_scene.
  // For the indicator we just want the screen direction of each axis as seen through
  // the camera. Construct (right, up) basis from (theta, phi), then for each axis
  // (X, Y, Z in scene-space) compute the (right·axis, up·axis) projection.

  const ct = Math.cos(theta), st = Math.sin(theta);
  const cp = Math.cos(phi),   sp = Math.sin(phi);

  // Camera basis vectors (scene space)
  const right: [number, number, number] = [ct, 0, -st];
  const up: [number, number, number]    = [-cp * st, sp, -cp * ct];

  // Axes in scene space (after the orientation="0deg -90deg 0deg" remap from OFF/Z-up).
  // OFF +X → scene +X. OFF +Y → scene +Z. OFF +Z → scene -Y. But here we just label
  // the arrows by what they look like in the model — keep it simple and use scene axes.
  const project = (a: [number, number, number]) => [
    right[0] * a[0] + right[1] * a[1] + right[2] * a[2],
    -(up[0] * a[0] + up[1] * a[1] + up[2] * a[2]), // flip y for SVG screen
  ] as [number, number];

  const len = 14;
  const xp = project([1, 0, 0]);
  const yp = project([0, 0, -1]); // OFF +Y → scene -Z
  const zp = project([0, 1, 0]);  // OFF +Z → scene +Y

  const arrow = (p: [number, number], color: string, label: string, key: string) => (
    <g key={key}>
      <line x1={0} y1={0} x2={p[0] * len} y2={p[1] * len} stroke={color} strokeWidth={1.5} />
      <text x={p[0] * (len + 4)} y={p[1] * (len + 4) + 3} fontSize={9} fill={color} textAnchor="middle">{label}</text>
    </g>
  );

  return (
    <>
      {arrow(xp, '#d33', 'X', 'x')}
      {arrow(yp, '#3a3', 'Y', 'y')}
      {arrow(zp, '#36c', 'Z', 'z')}
      <circle cx={0} cy={0} r={1.5} fill="#555" />
    </>
  );
}
