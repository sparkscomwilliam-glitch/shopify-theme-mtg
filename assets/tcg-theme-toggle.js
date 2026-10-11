const STORAGE_KEY = 'nwe12-tcg-theme';

function getTheme() {
  return document.documentElement.dataset.tcgTheme === 'dark' ? 'dark' : 'light';
}

function updateToggleState() {
  const theme = getTheme();
  document.querySelectorAll('[data-tcg-theme-toggle]').forEach((button) => {
    const nextTheme = theme === 'dark' ? 'clair' : 'sombre';
    button.setAttribute('aria-label', `Activer le mode ${nextTheme}`);
    button.setAttribute('title', `Activer le mode ${nextTheme}`);
    button.setAttribute('aria-pressed', String(theme === 'dark'));
  });
}

function setTheme(theme) {
  document.documentElement.dataset.tcgTheme = theme;
  document.documentElement.style.colorScheme = theme;
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch (_) {
    // The selected theme still applies when storage is unavailable.
  }
  updateToggleState();
}

document.addEventListener('click', (event) => {
  const button = event.target.closest('[data-tcg-theme-toggle]');
  if (!button) return;
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
});

document.addEventListener('DOMContentLoaded', updateToggleState);
document.addEventListener('shopify:section:load', updateToggleState);

