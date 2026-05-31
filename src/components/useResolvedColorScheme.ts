import { useEffect, useState } from 'react';

export type ColorSchemePreference = 'light' | 'dark' | 'auto';
export type ResolvedColorScheme = 'light' | 'dark';

const THEME_HREF: Record<ResolvedColorScheme, string> = {
  light: './themes/lara-light-indigo/theme.css',
  dark: './themes/lara-dark-indigo/theme.css',
};

function getSystemScheme(): ResolvedColorScheme {
  if (typeof window === 'undefined' || !window.matchMedia) return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function swapPrimeReactTheme(scheme: ResolvedColorScheme): void {
  const link = document.getElementById('primereact-theme') as HTMLLinkElement | null;
  if (!link) return;
  const nextHref = THEME_HREF[scheme];
  if (link.getAttribute('href') === nextHref) return;

  // Preload the new sheet, then swap href in one go to minimize FOUC.
  const preload = document.createElement('link');
  preload.rel = 'preload';
  preload.as = 'style';
  preload.href = nextHref;
  const cleanup = () => {
    link.href = nextHref;
    preload.remove();
  };
  preload.onload = cleanup;
  preload.onerror = cleanup;
  document.head.appendChild(preload);
}

export function useResolvedColorScheme(preference: ColorSchemePreference | undefined): ResolvedColorScheme {
  const effectivePreference: ColorSchemePreference = preference ?? 'auto';
  const [systemScheme, setSystemScheme] = useState<ResolvedColorScheme>(getSystemScheme);

  useEffect(() => {
    if (effectivePreference !== 'auto') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e: MediaQueryListEvent) => setSystemScheme(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', onChange);
    setSystemScheme(mql.matches ? 'dark' : 'light');
    return () => mql.removeEventListener('change', onChange);
  }, [effectivePreference]);

  return effectivePreference === 'auto' ? systemScheme : effectivePreference;
}

export function useApplyColorScheme(resolved: ResolvedColorScheme): void {
  useEffect(() => {
    document.documentElement.setAttribute('data-color-scheme', resolved);
    swapPrimeReactTheme(resolved);
  }, [resolved]);
}
