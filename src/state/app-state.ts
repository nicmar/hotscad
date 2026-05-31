// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import * as monaco from 'monaco-editor/esm/vs/editor/editor.api';
import { ParameterSet } from './customizer-types.ts';
import { VALID_EXPORT_FORMATS_2D, VALID_EXPORT_FORMATS_3D } from './formats.ts';

export type MultiLayoutComponentId = 'editor' | 'viewer' | 'customizer';
export type SingleLayoutComponentId = MultiLayoutComponentId;

export type Source = {
  // If path ends w/ /, it's a directory, and URL should contain a ZIP file that can be mounted
  path: string,
  url?: string,
  content?: string,
};

export interface FileOutput {
  outFile: File,
  outFileURL: string,
  displayFile?: File,
  displayFileURL?: string,
  elapsedMillis: number,
  formattedElapsedMillis: string,
  formattedOutFileSize: string,
}

export type LayerSpan = { from: number; color: string };
export type LayerColorsConfig = Array<{ layers: LayerSpan[] }>;

export interface State {
  params: {
    activePath: string,
    sources: Source[],
    vars?: {[name: string]: any},
    features: string[],
    exportFormat2D: keyof typeof VALID_EXPORT_FORMATS_2D,
    exportFormat3D: keyof typeof VALID_EXPORT_FORMATS_3D,
    extruderColors?: string[],
    watchedLocalFile?: { name: string; lastModified: number },
    layerColors?: LayerColorsConfig,
  },

  
  preview?: {
    thumbhash?: string,
    blurhash?: string,
  },

  view: {
    logs?: boolean,
    extruderPickerVisibility?: 'editing' | 'exporting',
    layout: {
      mode: 'single',
      focus: SingleLayoutComponentId,
    } | ({
      mode: 'multi',
    } & { [K in MultiLayoutComponentId]: boolean })

    collapsedCustomizerTabs?: string[],
    
    color: string,
    showAxes?: boolean,
    showDimensions?: boolean,
    lineNumbers?: boolean,
    rightTab?: 'customize' | 'layerColors',
    editorDebounceMs?: number,
    colorScheme?: 'light' | 'dark' | 'auto',
  }

  currentRunLogs?: ['stderr'|'stdout', string][],

  lastCheckerRun?: {
    logText: string,
    markers: monaco.editor.IMarkerData[],
  }
  rendering?: boolean,
  previewing?: boolean,
  exporting?: boolean,
  checkingSyntax?: boolean,

  parameterSet?: ParameterSet,
  error?: string,
  is2D?: boolean,
  output?: FileOutput & {
    isPreview: boolean,
    componentBboxes?: Array<{
      min: [number, number, number],
      max: [number, number, number],
      center: [number, number, number],
      size: [number, number, number],
    }>,
  },
  export?: FileOutput,
};

export interface StatePersister {
  set(state: State): Promise<void>;
}

export {}