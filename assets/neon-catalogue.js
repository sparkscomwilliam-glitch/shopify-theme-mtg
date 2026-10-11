const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

class NeonCatalogue {
  constructor(root) {
    this.root = root;
    this.dialog = root.querySelector('[data-neon-filter-dialog]');
    this.openButton = root.querySelector('[data-neon-filter-open]');
    this.closeButton = root.querySelector('[data-neon-filter-close]');
    this.sort = root.querySelector('[data-neon-sort]');
    this.autoSubmitForm = root.querySelector('[data-neon-auto-submit]');
    this.submitTimer = 0;

    this.bind();
  }

  bind() {
    this.openButton?.addEventListener('click', () => this.openDrawer());
    this.closeButton?.addEventListener('click', () => this.closeDrawer());

    this.dialog?.addEventListener('click', (event) => {
      if (event.target === this.dialog) this.closeDrawer();
    });

    this.dialog?.addEventListener('close', () => {
      this.openButton?.setAttribute('aria-expanded', 'false');
    });

    this.sort?.addEventListener('change', () => {
      const url = new URL(window.location.href);
      url.searchParams.set('sort_by', this.sort.value);
      url.searchParams.delete('page');
      window.location.assign(url.toString());
    });

    this.autoSubmitForm?.addEventListener('change', (event) => {
      if (!event.target.matches('[data-neon-filter-input]')) return;
      window.clearTimeout(this.submitTimer);
      this.submitTimer = window.setTimeout(() => this.autoSubmitForm.requestSubmit(), 180);
    });
  }

  openDrawer() {
    if (!this.dialog || this.dialog.open) return;
    this.dialog.showModal();
    this.openButton?.setAttribute('aria-expanded', 'true');
  }

  closeDrawer() {
    if (!this.dialog?.open) return;
    if (reduceMotion.matches) {
      this.dialog.close();
      return;
    }

    this.dialog.classList.add('is-closing');
    window.setTimeout(() => {
      this.dialog?.close();
      this.dialog?.classList.remove('is-closing');
    }, 260);
  }
}

function initializeNeonCatalogues(scope = document) {
  scope.querySelectorAll('[data-neon-catalogue]').forEach((root) => {
    if (root.dataset.neonCatalogueReady === 'true') return;
    root.dataset.neonCatalogueReady = 'true';
    new NeonCatalogue(root);
  });
}

initializeNeonCatalogues();
document.addEventListener('shopify:section:load', (event) => initializeNeonCatalogues(event.target));
