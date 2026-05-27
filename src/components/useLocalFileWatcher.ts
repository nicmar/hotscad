import { useEffect, useRef, useState } from 'react';
import { LocalFileSession, openLocalFile, clearLastLocalFile } from '../io/local_file_watcher';
import { Model } from '../state/model';

export type LocalFileStatus = {
  fileName: string;
  isWatching: boolean;
} | null;

export function useLocalFileWatcher(model: Model | null) {
  const sessionRef = useRef<LocalFileSession | null>(null);
  const pendingRef = useRef<boolean>(false);
  const [status, setStatus] = useState<LocalFileStatus>(null);

  function stopSession() {
    sessionRef.current?.stop();
    sessionRef.current = null;
    setStatus(null);
    clearLastLocalFile();
    if (model) {
      model.mutate(s => {
        delete s.params.watchedLocalFile;
      });
    }
  }

  async function openSession() {
    if (pendingRef.current) return;
    pendingRef.current = true;
    try {
      if (!model) return;
      if (sessionRef.current) sessionRef.current.stop();

      const session = await openLocalFile();
      if (!session) return;

      sessionRef.current = session;
      setStatus({ fileName: session.fileName, isWatching: session.isWatching });

      const initial = await session.read();
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

      if (session.isWatching) {
        session.onChange(async (content) => {
          await model.loadExternalSource(content);
          model.mutate(s => {
            if (s.params.watchedLocalFile) {
              s.params.watchedLocalFile.lastModified = Date.now();
            }
          });
        });
      }
    } finally {
      pendingRef.current = false;
    }
  }

  async function manualReload() {
    if (!model) return;
    // Fallback mode can't re-read from disk without a fresh user gesture; reopen the picker.
    await openSession();
  }

  useEffect(() => {
    return () => { sessionRef.current?.stop(); };
  }, []);

  return { status, openSession, stopSession, manualReload };
}
