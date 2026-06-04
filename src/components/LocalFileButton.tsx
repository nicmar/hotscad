import React, { useContext } from 'react';
import { Button } from 'primereact/button';
import { ModelContext } from './contexts';
import { useLocalFileWatcher } from './useLocalFileWatcher';
import { hasFileSystemAccess } from '../io/local_file_watcher';

export function LocalFileButton() {
  const model = useContext(ModelContext);
  const { status, openSession, stopSession, manualReload } = useLocalFileWatcher(model);

  if (!status) {
    return (
      <Button
        icon="pi pi-folder-open"
        label="Open Local…"
        size="small"
        tooltip={hasFileSystemAccess() ? 'Open a local .scad file (auto-watched)' : 'Open a local .scad file (manual reload)'}
        tooltipOptions={{ position: 'bottom' }}
        onClick={openSession}
        className="p-button-text"
      />
    );
  }

  const dotColor = status.outOfSync ? '#ef4444'   // red — stale
                 : status.isWatching ? '#22c55e'  // green — watching, in sync
                 : '#f59e0b';                     // amber — manual mode

  const dotTitle = status.outOfSync
    ? 'Editor differs from disk — click reload to pull the latest file content'
    : status.isWatching ? 'Watching for external changes'
    : 'Manual reload required';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
      <span
        title={dotTitle}
        style={{ width: 8, height: 8, borderRadius: 4, background: dotColor }}
      />
      <span style={{ fontSize: 12, opacity: 0.8 }}>{status.fileName}</span>
      <Button
        icon="pi pi-refresh"
        size="small"
        className="p-button-text"
        severity={status.outOfSync ? 'danger' : undefined}
        tooltip={status.outOfSync ? 'Pull latest content from disk' : 'Reload from disk'}
        tooltipOptions={{ position: 'bottom' }}
        onClick={manualReload}
      />
      <Button
        icon="pi pi-times"
        size="small"
        className="p-button-text"
        tooltip="Detach local file"
        tooltipOptions={{ position: 'bottom' }}
        onClick={stopSession}
      />
    </div>
  );
}
