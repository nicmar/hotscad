// Portions of this file are Copyright 2021 Google LLC, and licensed under GPL2+. See COPYING.

import { CSSProperties, useState } from 'react';
import { Button } from 'primereact/button';
import SettingsDialog from './SettingsDialog.tsx';

export default function SettingsMenu({className, style}: {className?: string, style?: CSSProperties}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        title="Settings"
        style={style}
        className={className}
        rounded
        text
        icon="pi pi-cog"
        onClick={() => setOpen(true)}
      />
      <SettingsDialog visible={open} onHide={() => setOpen(false)} />
    </>
  );
}
