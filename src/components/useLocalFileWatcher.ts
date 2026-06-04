import { useEffect, useRef, useState } from 'react';
import { LocalFileSession, openLocalFile, clearLastLocalFile } from '../io/local_file_watcher';
import { Model } from '../state/model';

export type LocalFileStatus = {
  fileName: string;
  isWatching: boolean;
  /** True when the last content we read from disk differs from the model source. */
  outOfSync: boolean;
} | null;

export function useLocalFileWatcher(model: Model | null) {
  const sessionRef = useRef<LocalFileSession | null>(null);
  const pendingRef = useRef<boolean>(false);
  const [status, setStatus] = useState<LocalFileStatus>(null);
  const [diskContent, setDiskContent] = useState<string | null>(null);

  function stopSession() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStatus(null);
    setDiskContent(null);
    clearLastLocalFile();
    if (model) {
      model.mutate(s => {
        delete s.params.watchedLocalFile;
      });
    }
  }

  // Recompute outOfSync whenever the model source or the last-read disk
  // content changes. Out-of-sync = disk content known and not equal to source.
  const currentSource = model?.source ?? '';
  const outOfSync = diskContent !== null && diskContent !== currentSource;
  useEffect(() => {
    setStatus(prev => prev ? { ...prev, outOfSync } : prev);
  }, [outOfSync]);

  async function openSession() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      if (!model) return;
      if (sessionRef.current) sessionRef.current.stop();

      const session = await openLocalFile();
      if (!session) return;

      sessionRef.current = session;
      setStatus({ fileName: session.fileName, isWatching: session.isWatching, outOfSync: false });

      const initial = await session.read();
      setDiskContent(initial);
      const localPath = `/local/${session.fileName}`;

      model.mutate(s => {
        const existing = s.params.sources.find(src => src.path === localPath);
        if (existing) {
          existing.content = '';   // will be set by the subsequent loadExternalSource
        } else {
          s.params.sources = [...s.params.sources, { path: localPath, content: '' }];
        }
        s.params.activePath = localPath;
        s.lastCheckerRun = undefined;
        s.output = undefined;
        s.export = undefined;
        s.preview = undefined;
        s.currentRunLogs = undefined;
        s.error = undefined;
        s.is2D = undefined;
        s.params.watchedLocalFile = { name: session.fileName, lastModified: Date.now() };
      });
      await model.loadExternalSource(initial);

      session.onChange(async (content) => {
        setDiskContent(content);
        await model.loadExternalSource(content);
        model.mutate(s => {
          if (s.params.watchedLocalFile) {
            s.params.watchedLocalFile.lastModified = Date.now();
          }
        });
      });
    } finally {
      pendingRef.current = false;
    }
  }

  async function manualReload() {
    if (!model) return;
    const session = sessionRef.current;
    if (session) {
      const content = await session.forceReread();
      if (content !== null) setDiskContent(content);
      return;
    }
    // No session left (e.g. permission revoked in fallback mode): reopen the picker.
    await openSession();
  }

  useEffect(() => {
    return () => { sessionRef.current?.stop(); };
  }, []);

  return { status, openSession, stopSession, manualReload };
}
