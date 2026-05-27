// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ModelContext } from './contexts.ts';
import { attachCameraController } from './CameraController';
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
    if (stashedCameraRef.current && modelViewerRef.current) {
      try {
        modelViewerRef.current.cameraOrbit = stashedCameraRef.current.orbit;
        modelViewerRef.current.cameraTarget = stashedCameraRef.current.target;
      } catch {
        // restoration failed, ignore
      }
    }
    if (!modelViewerRef.current) return;

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


  useEffect(() => {
    const mv = modelViewerRef.current;
    if (!mv) return;
    const cleanup = attachCameraController(mv, { axesViewerEl: null });
    return cleanup;
  }, [modelViewerRef.current]);

  useLayoutEffect(() => {
    return () => {
      const el = modelViewerRef.current;
      if (!el) return;
      // Only stash if the previous model actually finished loading. Otherwise we'd
      // capture model-viewer's pre-load defaults (radius=auto/NaN, target=origin)
      // and restore them onto the first real model, sending the camera off-screen.
      if (!el.loaded) return;
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

  const fitToView = useCallback(() => {
    const el = modelViewerRef.current;
    if (!el) return;
    stashedCameraRef.current = null;
    try {
      el.cameraTarget = 'auto auto auto';
      el.cameraOrbit = '45deg 75deg 105%';
    } catch {
      // ignore
    }
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
      <ViewCube modelViewerRef={modelViewerRef} onHomeClick={fitToView} />
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
