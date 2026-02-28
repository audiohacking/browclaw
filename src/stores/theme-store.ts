// ---------------------------------------------------------------------------
// browclaw — Theme Store (Zustand)
// ---------------------------------------------------------------------------

import { create } from 'zustand';

export type ThemeChoice = 'light' | 'dark' | 'system';
type ResolvedTheme = 'light' | 'dark';

interface ThemeState {
  theme: ThemeChoice;
  resolved: ResolvedTheme;
  setTheme: (theme: ThemeChoice) => void;
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(choice: ThemeChoice): ResolvedTheme {
  return choice === 'system' ? getSystemTheme() : choice;
}

function applyTheme(resolved: ResolvedTheme) {
  document.documentElement.setAttribute('data-theme', resolved);
}

const stored = (localStorage.getItem('obc-theme') as ThemeChoice) || 'system';
const initialResolved = resolveTheme(stored);
applyTheme(initialResolved);

export const useThemeStore = create<ThemeState>((set) => ({
  theme: stored,
  resolved: initialResolved,
  setTheme: (theme) => {
    const resolved = resolveTheme(theme);
    localStorage.setItem('obc-theme', theme);
    applyTheme(resolved);
    set({ theme, resolved });
  },
}));

// Listen for system theme changes
const mql = window.matchMedia('(prefers-color-scheme: dark)');
mql.addEventListener('change', () => {
  const state = useThemeStore.getState();
  if (state.theme === 'system') {
    const resolved = getSystemTheme();
    applyTheme(resolved);
    useThemeStore.setState({ resolved });
  }
});
