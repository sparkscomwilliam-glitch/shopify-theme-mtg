const article = document.querySelector('[data-neon-article]');

if (article) {
  const body = article.querySelector('[data-neon-article-body]');

  // The article editor accepts pasted full HTML documents. These elements do not
  // belong inside storefront content and can otherwise restyle the whole theme.
  body?.querySelectorAll('style, link[rel="stylesheet"], meta, title, script').forEach((node) => node.remove());

  body?.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('tbl') || table.parentElement?.classList.contains('neon-table-wrap')) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'neon-table-wrap';
    wrapper.tabIndex = 0;
    wrapper.setAttribute('role', 'region');
    wrapper.setAttribute('aria-label', 'Tableau défilable horizontalement');
    table.before(wrapper);
    wrapper.append(table);
  });

  const updateProgress = () => {
    const bounds = article.getBoundingClientRect();
    const start = window.scrollY + bounds.top;
    const scrollable = Math.max(article.offsetHeight - window.innerHeight, 1);
    const progress = Math.min(100, Math.max(0, ((window.scrollY - start) / scrollable) * 100));
    article.style.setProperty('--neon-reading-progress', `${progress}%`);
  };

  updateProgress();
  window.addEventListener('scroll', updateProgress, { passive: true });
  window.addEventListener('resize', updateProgress, { passive: true });
}
