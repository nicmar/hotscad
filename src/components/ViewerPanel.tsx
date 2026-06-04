// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ModelContext } from './contexts.ts';
import { attachCameraController, CameraSettings } from './CameraController';
import { ViewCube } from './ViewCube';
import { projectToViewport } from '../io/components.ts';
import { Toast } from 'primereact/toast';
import { blurHashToImage, imageToBlurhash, imageToThumbhash, thumbHashToImage } from '../io/image_hashes.ts';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": any;
    }
  }
}

export default function ViewerPanel({className, style}: {className?: string, style?: CSSProperties}) {
  const model = useContext(ModelContext);
  if (!model) throw new Error('No model');

  const state = model.state;
  const modelViewerRef = useRef<any>();
  const toastRef = useRef<Toast>(null);
  // Stash the entire camera state (orbit + target) across model reloads so a
  // param edit doesn't move the camera at all — the user expects to keep
  // looking at exactly what they were looking at, just with new geometry.
  const stashedCameraRef = useRef<{orbit: string; target: string} | null>(null);

  const [loadedUri, setLoadedUri] = useState<string | undefined>();

  const [cachedImageHash, setCachedImageHash] = useState<{hash: string, uri: string} | undefined>(undefined);

  const modelUri = state.output?.displayFileURL ?? state.output?.outFileURL ?? '';
  const loaded = loadedUri === modelUri;

  if (state?.preview) {
    let {hash, uri} = cachedImageHash ?? {};
    if (state.preview.blurhash && hash !== state.preview.blurhash) {
      hash = state.preview.blurhash;
      uri = blurHashToImage(hash, 100, 100);
      setCachedImageHash({hash, uri});
    } else if (state.preview.thumbhash && hash !== state.preview.thumbhash) {
      hash = state.preview.thumbhash;
      uri = thumbHashToImage(hash);
      setCachedImageHash({hash, uri});
    }
  } else if (cachedImageHash) {
    setCachedImageHash(undefined);
  }

  const onLoad = useCallback(async (e: any) => {
    setLoadedUri(modelUri);
    if (!modelViewerRef.current) return;
    const mv = modelViewerRef.current;

    // Re-apply the stashed orbit + target verbatim. New model loads in place;
    // the camera doesn't move. (On first ever load there's no stash, so we
    // leave model-viewer's auto-framing alone.)
    if (stashedCameraRef.current) {
      try {
        mv.cameraOrbit = stashedCameraRef.current.orbit;
        mv.cameraTarget = stashedCameraRef.current.target;
      } catch { /* ignore */ }
    }

    // Snap to goal so the user sees what we just set instead of an
    // intermediate lerp frame. Defer one rAF so the auto-frame (when no stash
    // exists) has time to materialize into concrete numbers before we snap.
    requestAnimationFrame(() => {
      try { mv.jumpCameraToGoal?.(); } catch { /* ignore */ }
    });

    const uri = await modelViewerRef.current.toDataURL('image/png', 0.5);
    const preview = {blurhash: await imageToBlurhash(uri)};
    // const preview = {thumbhash: await imageToThumbhash(uri)};

    model?.mutate(s => s.preview = preview);
  }, [model, modelUri, setLoadedUri, modelViewerRef.current]);

  useEffect(() => {
    if (!modelViewerRef.current) return;

    const element = modelViewerRef.current;
    element.addEventListener('load', onLoad);
    return () => element.removeEventListener('load', onLoad);
  }, [modelViewerRef.current, onLoad]);


  // Live camera settings: the controller polls this ref, so changes take effect
  // immediately without re-attaching all event listeners.
  const cameraSettingsRef = useRef<CameraSettings>({
    primaryMouseButton: state.view.primaryMouseButton ?? 'pan',
    wasdNav: state.view.wasdNav !== false,
  });
  useEffect(() => {
    cameraSettingsRef.current = {
      primaryMouseButton: state.view.primaryMouseButton ?? 'pan',
      wasdNav: state.view.wasdNav !== false,
    };
  }, [state.view.primaryMouseButton, state.view.wasdNav]);

  useEffect(() => {
    const mv = modelViewerRef.current;
    if (!mv) return;
    const cleanup = attachCameraController(mv, {
      axesViewerEl: null,
      getSettings: () => cameraSettingsRef.current,
    });
    return cleanup;
  }, [modelViewerRef.current]);

  useLayoutEffect(() => {
    return () => {
      const el = modelViewerRef.current;
      if (!el) return;
      // Only stash if the previous model actually finished loading. Otherwise we'd
      // capture pre-load defaults (radius=NaN, target=origin) and restore them
      // onto the first real model, sending the camera off-screen.
      if (!el.loaded) return;
      try {
        const o = el.getCameraOrbit();
        const t = el.getCameraTarget();
        if (!Number.isFinite(o.theta) || !Number.isFinite(o.phi) || !Number.isFinite(o.radius)) return;
        if (!Number.isFinite(t.x) || !Number.isFinite(t.y) || !Number.isFinite(t.z)) return;
        stashedCameraRef.current = {
          orbit: o.toString(),
          target: t.toString(),
        };
      } catch {
        // model-viewer may not be initialized yet
      }
    };
  }, [modelUri]);

  const goHome = useCallback(() => {
    const el = modelViewerRef.current;
    if (!el) return;
    stashedCameraRef.current = null;
    try {
      el.cameraTarget = 'auto auto auto';
      el.cameraOrbit = '45deg 75deg 105%';
    } catch { /* ignore */ }
  }, []);

  const fitToView = useCallback(() => {
    const el = modelViewerRef.current;
    if (!el) return;
    stashedCameraRef.current = null;
    try {
      // Preserve current orbit angle; just reframe radius+target.
      const o = el.getCameraOrbit();
      el.cameraTarget = 'auto auto auto';
      el.cameraOrbit = `${o.theta}rad ${o.phi}rad 105%`;
    } catch { /* ignore */ }
  }, []);

  // Per-object label projection: track screen positions of bounding-box centers,
  // updated on every camera-change.
  const [labelPositions, setLabelPositions] = useState<Array<{
    x: number, y: number, sizeX: number, sizeY: number, sizeZ: number,
  }>>([]);

  useEffect(() => {
    const el = modelViewerRef.current;
    if (!el) return;
    if (!state.view.showDimensions) {
      setLabelPositions([]);
      return;
    }
    const boxes = state.output?.componentBboxes;
    if (!boxes || boxes.length === 0) {
      setLabelPositions([]);
      return;
    }

    const updatePositions = () => {
      try {
        const o = el.getCameraOrbit();
        const t = el.getCameraTarget();
        const fov = el.getFieldOfView?.() ?? 45;
        const rect = el.getBoundingClientRect();
        const w = rect.width, h = rect.height;
        const next = boxes.map(box => {
          // Transform OFF (Z-up) → scene (Y-up) per model-viewer orientation="0deg -90deg 0deg":
          // (x, y, z)_OFF → (x, z, -y)_scene
          // Anchor the label at the BOTTOM of the bbox (lowest OFF Z) so it sits "below the item."
          const sceneX = box.center[0];                 // OFF x → scene x
          const sceneY = box.min[2];                    // OFF min z → scene min y (bottom)
          const sceneZ = -box.center[1];                // OFF y → scene -z (centered)
          const [u, v, vz] = projectToViewport(
            [sceneX, sceneY, sceneZ],
            [t.x, t.y, t.z],
            o.theta, o.phi, o.radius, fov, w, h,
          );
          return {
            x: u,
            y: v,
            sizeX: box.size[0],
            sizeY: box.size[1],
            sizeZ: box.size[2],
            visible: vz > 0,
          };
        }).filter(p => (p as any).visible) as any;
        setLabelPositions(next);
      } catch { /* ignore */ }
    };

    updatePositions();
    el.addEventListener('camera-change', updatePositions);
    window.addEventListener('resize', updatePositions);
    return () => {
      el.removeEventListener('camera-change', updatePositions);
      window.removeEventListener('resize', updatePositions);
    };
  }, [state.view.showDimensions, state.output?.componentBboxes, modelViewerRef.current, loaded]);

  return (
    <div className={className}
          style={{
              display: 'flex',
              flexDirection: 'column', 
              position: 'relative',
              flex: 1, 
              width: '100%',
              ...(style ?? {})
          }}>
      <Toast ref={toastRef} position='top-right'  />
      <style>
        {`
          @keyframes pulse {
            0% { opacity: 0.4; }
            50% { opacity: 0.7; }
            100% { opacity: 0.4; }
          }
        `}
      </style>

      {!loaded && cachedImageHash && 
        <img
        src={cachedImageHash.uri}
        style={{
          animation: 'pulse 1.5s ease-in-out infinite',
          position: 'absolute',
          pointerEvents: 'none',
          width: '100%',
          height: '100%'
        }} />
      }

      <model-viewer
        orientation="0deg -90deg 0deg"
        class="main-viewer"
        src={modelUri}
        style={{
          transition: 'opacity 0.5s',
          opacity: loaded ? 1 : 0,
          position: 'absolute',
          width: '100%',
          height: '100%',
        }}
        interaction-prompt="none"
        environment-image="./skybox-lights.jpg"
        max-camera-orbit="auto 180deg 100000m"
        min-camera-orbit="auto 0deg 0m"
        ar
        ref={modelViewerRef}
      >
        <span slot="progress-bar"></span>
      </model-viewer>
      <ViewCube modelViewerRef={modelViewerRef} onHomeClick={goHome} onFitClick={fitToView} />
      {state.output?.isEmpty && (
        <div
          role="status"
          style={{
            position: 'absolute',
            top: 12,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 12,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '8px 14px',
            background: 'rgba(245, 158, 11, 0.16)',
            border: '1px solid rgba(245, 158, 11, 0.55)',
            color: 'var(--surface-fg-strong, #f59e0b)',
            borderRadius: 999,
            font: '500 12.5px/1.3 Inter, system-ui, sans-serif',
            letterSpacing: '-0.005em',
            backdropFilter: 'blur(8px)',
            WebkitBackdropFilter: 'blur(8px)',
            maxWidth: 'calc(100% - 24px)',
          }}
          title="The render finished but produced no geometry. The viewer is still showing the last non-empty model."
        >
          <i className="pi pi-exclamation-triangle" style={{ fontSize: 13, color: '#f59e0b' }} />
          <span>Render produced no geometry — showing previous model</span>
        </div>
      )}
      {state.view.showDimensions && loaded && labelPositions.map((p, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${p.x}px`,
            top: `${p.y + 8}px`,
            transform: 'translateX(-50%)',
            zIndex: 10,
            padding: '3px 6px',
            background: 'rgba(0,0,0,0.7)',
            color: '#fff',
            font: '11px/1.3 monospace',
            borderRadius: '3px',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
          title="Bounding box of this object"
        >
          {`${p.sizeX.toFixed(2)} × ${p.sizeY.toFixed(2)} × ${p.sizeZ.toFixed(2)} mm`}
        </div>
      ))}
    </div>
  )
}
