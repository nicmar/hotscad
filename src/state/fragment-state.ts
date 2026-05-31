// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { LayerColorsConfig, State } from "./app-state.ts";
import { VALID_EXPORT_FORMATS_2D, VALID_EXPORT_FORMATS_3D } from './formats.ts';
import { validateArray, validateBoolean, validateString, validateStringEnum } from "../utils.ts";
import { createInitialState, defaultModelColor, defaultSourcePath } from "./initial-state.ts";

function validateLayerColors(input: unknown): LayerColorsConfig | undefined {
  if (!Array.isArray(input)) return undefined;
  const out: LayerColorsConfig = [];
  for (const entry of input) {
    if (!entry || typeof entry !== 'object') {
      out.push({ layers: [] });
      continue;
    }
    const layersIn = (entry as any).layers;
    const layers: { from: number; color: string }[] = [];
    if (Array.isArray(layersIn)) {
      for (const l of layersIn) {
        if (!l || typeof l !== 'object') continue;
        const from = typeof l.from === 'number' ? l.from : NaN;
        const color = typeof l.color === 'string' ? l.color : '';
        if (!Number.isFinite(from) || !color) continue;
        // Note: older fragments may carry a `to` field; we silently drop it
        // since the model is now from-only.
        layers.push({ from, color });
      }
    }
    out.push({ layers });
  }
  return out.length > 0 ? out : undefined;
}

export function buildUrlForStateParams(state: State) {//partialState: {params: State['params'], view: State['view']}) {
  return `${location.protocol}//${location.host}${location.pathname}#${encodeStateParamsAsFragment(state)}`;
}
export async function writeStateInFragment(state: State) {
  history.replaceState(state, '', '#' + await encodeStateParamsAsFragment(state));
}
async function compressString(input: string): Promise<string> {
  return btoa(String.fromCharCode(...new Uint8Array(await new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode(input));
      controller.close();
    }
  }).pipeThrough(new CompressionStream('gzip'))).arrayBuffer())));
}

async function decompressString(compressedInput: string): Promise<string> {
  return new TextDecoder().decode(await new Response(new ReadableStream({
    start(controller) {
      controller.enqueue(Uint8Array.from(atob(compressedInput), c => c.charCodeAt(0)));
      controller.close();
    }
  }).pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
}

// async function addFile(path: string, content: string) {
//   const state = JSON.parse(await decompressString(window.location.hash.substring(1)));
//   // console.log(JSON.stringify(state, null, 2)); // Put a breakpoint here if you wanna peek into the state
//   state.params.sources.push({ path, content });
//   window.history.pushState(state, '', '#' + await compressString(JSON.stringify(state)));
//   window.location.reload();
// }

export function encodeStateParamsAsFragment(state: State) {
  const json = JSON.stringify({
    params: state.params,
    view: state.view,
    preview: state.preview,
  });
  // return encodeURIComponent(json);
  return compressString(json);
}
export async function readStateFromFragment(): Promise<State | null> {
  if (window.location.hash.startsWith('#') && window.location.hash.length > 1) {
    try {
      const serialized = window.location.hash.substring(1);
      if (serialized === 'blank') {
        return createInitialState(null, {content: ''});
      } else if (serialized.startsWith('src=')) {
        // For testing
        const src = decodeURIComponent(serialized.substring('src='.length));
        return createInitialState(null, {content: src});
      } else if (serialized.startsWith('path=')) {
        const path = decodeURIComponent(serialized.substring('path='.length));
        return createInitialState(null, {path}); 
      } else if (serialized.startsWith('url=')) {
        // For testing
        const url = decodeURIComponent(serialized.substring('url='.length));
        const path = '/' + new URL(url).pathname.split('/').pop();
        return createInitialState(null, {path, url});
      }
      let obj;
      try {
        obj = JSON.parse(await decompressString(serialized));
      } catch (e) {
        // Backwards compatibility
        obj = JSON.parse(decodeURIComponent(serialized));
      }
      const {params, view, preview} = obj;
      return {
        params: {
          activePath: validateString(params?.activePath, () => defaultSourcePath),
          features: validateArray(params?.features, validateString),
          vars: params?.vars, // TODO: validate!
          // Source deserialization also handles legacy links (source + sourcePath)
          sources: params?.sources ?? (params?.source ? [{path: params?.sourcePath, content: params?.source}] : undefined), // TODO: validate!
          exportFormat2D: validateStringEnum(params?.exportFormat2D, Object.keys(VALID_EXPORT_FORMATS_2D), s => 'svg'),
          exportFormat3D: validateStringEnum(params?.exportFormat3D, Object.keys(VALID_EXPORT_FORMATS_3D), s => 'stl'),
          extruderColors: validateArray(params?.extruderColors, validateString, () => undefined as any as []),
          layerColors: validateLayerColors(params?.layerColors),
        },
        preview: preview ? {
          thumbhash: preview.thumbhash ? validateString(preview.thumbhash) : undefined,
          blurhash: preview.blurhash ? validateString(preview.blurhash) : undefined,
        } : undefined,
        view: {
          logs: validateBoolean(view?.logs),
          extruderPickerVisibility: validateStringEnum(view?.extruderPickerVisibility, ['editing', 'exporting'], s => undefined),
          layout: {
            mode: validateStringEnum(view?.layout?.mode, ['multi', 'single']),
            focus: validateStringEnum(view?.layout?.focus, ['editor', 'viewer', 'customizer'], s => false),
            editor: validateBoolean(view?.layout['editor']),
            viewer: validateBoolean(view?.layout['viewer']),
            customizer: validateBoolean(view?.layout['customizer']),
          },
          collapsedCustomizerTabs: validateArray(view?.collapsedCustomizerTabs, validateString),
          color: validateString(view?.color, () => defaultModelColor),
          showAxes: validateBoolean(view?.layout?.showAxis, () => true),
          showDimensions: validateBoolean(view?.showDimensions, () => false),
          lineNumbers: validateBoolean(view?.layout?.lineNumbers, () => false),
          rightTab: validateStringEnum(view?.rightTab, ['customize', 'layerColors'], () => 'customize'),
          editorDebounceMs: typeof view?.editorDebounceMs === 'number' ? view.editorDebounceMs : undefined,
        }
      };
    } catch (e) {
      console.error(e);
    }
  }
  return null;
}
