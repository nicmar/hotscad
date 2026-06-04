import { CSSProperties } from 'react';

const HOT_COLOR = '#FF5A1F';

export default function HotSCADLogo({
  height = 22,
  style,
  title = 'HotSCAD',
  withIcon = true,
}: {
  height?: number;
  style?: CSSProperties;
  title?: string;
  withIcon?: boolean;
}) {
  return (
    <span
      aria-label={title}
      title={title}
      style={{
        fontFamily: '"Inter var", "Inter", -apple-system, BlinkMacSystemFont, sans-serif',
        fontSize: height,
        lineHeight: 1,
        letterSpacing: '-0.01em',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        ...style,
      }}>
      {withIcon && <HotSCADMark size={height} />}
      <span style={{ fontWeight: 800, color: HOT_COLOR }}>Hot</span>
      <span style={{ fontWeight: 400, color: 'currentColor' }}>SCAD</span>
    </span>
  );
}

export function HotSCADMark({ size = 22 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-hidden="true"
      style={{ display: 'inline-block', flexShrink: 0 }}>
      <g fill="none" stroke="currentColor" strokeWidth={3} strokeLinejoin="round">
        <path d="M22 27 L32 21 L42 27 L32 33 Z" />
        <path d="M22 27 L22 39 L32 45 L32 33 Z" />
        <path d="M42 27 L42 39 L32 45 L32 33 Z" />
      </g>
      <path
        d="M42 15.7 A20 20 0 1 1 22 15.7"
        fill="none"
        stroke={HOT_COLOR}
        strokeWidth={4.5}
        strokeLinecap="round"
      />
      <polygon points="31,10 24,19 20,12" fill={HOT_COLOR} />
    </svg>
  );
}
