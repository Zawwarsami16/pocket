export type Theme = 'dark' | 'light' | 'system';

const STORAGE = 'pocket.theme';

export function getStoredTheme(): Theme {
  return (localStorage.getItem(STORAGE) as Theme) || 'dark';
}

export function setStoredTheme(t: Theme) {
  localStorage.setItem(STORAGE, t);
  applyTheme(t);
}

export function applyTheme(t: Theme) {
  const resolved = t === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : t;
  document.documentElement.classList.toggle('light', resolved === 'light');
  document.documentElement.classList.toggle('dark', resolved === 'dark');
}

export function initTheme() {
  applyTheme(getStoredTheme());
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    if (getStoredTheme() === 'system') applyTheme('system');
  });
}
