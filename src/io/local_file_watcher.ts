const IDB_NAME = 'openscad-playground-fs';
const IDB_STORE = 'handles';
const IDB_KEY = 'localFileHandle';

async function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(): Promise<T | undefined> {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(value: unknown): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(value, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(): Promise<void> {
  const db = await openDb();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export type LocalFileSession = {
  fileName: string;
  isWatching: boolean;
  read(): Promise<string>;
  /** Re-read from disk unconditionally and notify subscribers. */
  forceReread(): Promise<string | null>;
  /** Most recent content seen on disk (null until first successful read). */
  lastContent(): string | null;
  onChange(cb: (content: string) => void): () => void;
  stop(): void;
};

export const hasFileSystemAccess = (): boolean =>
  typeof window !== 'undefined' && 'showOpenFilePicker' in window;

async function makeWatchingSession(handle: any): Promise<LocalFileSession> {
  // Content-based comparison rather than lastModified: some filesystems and
  // editors produce identical mtimes for back-to-back writes, which let
  // changes slip through the old timestamp gate.
  let lastText: string | null = null;
  let stopped = false;
  const callbacks = new Set<(c: string) => void>();
  let polling = false;

  async function readOnce(): Promise<string> {
    const file = await handle.getFile();
    const text = await file.text();
    lastText = text;
    return text;
  }

  const initial = await handle.getFile();
  lastText = await initial.text();
  const fileName = initial.name;

  const intervalId = setInterval(async () => {
    if (stopped || polling) return;
    polling = true;
    try {
      const file = await handle.getFile();
      const text = await file.text();
      if (text !== lastText) {
        lastText = text;
        callbacks.forEach(cb => cb(text));
      }
    } catch (e) {
      console.warn('local file watch read failed:', e);
    } finally {
      polling = false;
    }
  }, 500);

  async function forceReread(): Promise<string | null> {
    try {
      const file = await handle.getFile();
      const text = await file.text();
      lastText = text;
      callbacks.forEach(cb => cb(text));
      return text;
    } catch (e) {
      console.warn('forceReread failed:', e);
      return null;
    }
  }

  return {
    fileName,
    isWatching: true,
    read: readOnce,
    forceReread,
    lastContent: () => lastText,
    onChange(cb) { callbacks.add(cb); return () => callbacks.delete(cb); },
    stop() { stopped = true; clearInterval(intervalId); callbacks.clear(); },
  };
}

function makeManualSession(file: File): LocalFileSession {
  let cached: string | null = null;
  let cachedFor: File = file;
  const callbacks = new Set<(c: string) => void>();

  return {
    fileName: file.name,
    isWatching: false,
    async read() {
      if (cached !== null && cachedFor === file) return cached;
      cached = await file.text();
      cachedFor = file;
      return cached;
    },
    async forceReread() {
      cached = await file.text();
      cachedFor = file;
      callbacks.forEach(cb => cb(cached!));
      return cached;
    },
    lastContent: () => cached,
    onChange(cb) { callbacks.add(cb); return () => callbacks.delete(cb); },
    stop() { callbacks.clear(); },
  };
}

export async function openLocalFile(): Promise<LocalFileSession | null> {
  if (hasFileSystemAccess()) {
    try {
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'OpenSCAD', accept: { 'application/x-openscad': ['.scad'] } }],
        excludeAcceptAllOption: false,
        multiple: false,
      });
      const perm = await (handle as any).queryPermission?.({ mode: 'read' });
      if (perm && perm !== 'granted') {
        const req = await (handle as any).requestPermission({ mode: 'read' });
        if (req !== 'granted') return null;
      }
      await idbSet(handle).catch(() => {});
      return await makeWatchingSession(handle);
    } catch (e) {
      console.log('openLocalFile cancelled or failed:', e);
      return null;
    }
  }

  return await new Promise<LocalFileSession | null>((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.scad';
    input.onchange = () => {
      const file = input.files?.[0];
      resolve(file ? makeManualSession(file) : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

export async function restoreLastLocalFile(): Promise<LocalFileSession | null> {
  if (!hasFileSystemAccess()) return null;
  try {
    const handle: any = await idbGet();
    if (!handle) return null;
    const perm = await handle.queryPermission?.({ mode: 'read' });
    if (perm === 'granted') {
      return await makeWatchingSession(handle);
    }
    return null;
  } catch {
    return null;
  }
}

export async function clearLastLocalFile(): Promise<void> {
  await idbDelete().catch(() => {});
}
