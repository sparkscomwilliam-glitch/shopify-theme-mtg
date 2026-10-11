(() => {
  const SELECTOR = '[data-cv-header]';
  const initialized = new WeakSet();

  function initialize(header) {
    if (!header || initialized.has(header)) return;
    initialized.add(header);

    const catalog = header.querySelector('[data-cv-catalog-nav]');
    const menu = header.querySelector('[data-cv-menu-drawer]');
    const menuOpenButton = header.querySelector('[data-cv-menu-open]');
    const menuCloseButtons = header.querySelectorAll('[data-cv-menu-close]');
    const menuLinks = header.querySelectorAll('.cv-header__drawer-link');
    const cartButton = header.querySelector('[data-neon-cart-open]');
    const cartBadge = header.querySelector('[data-cv-cart-badge]');
    const mobile = window.matchMedia('(max-width: 989px)');
    let lastScrollY = Math.max(0, window.scrollY);
    let accumulatedDelta = 0;
    let ticking = false;
    let lastFocusedElement = null;

    const setCatalogVisibility = (visible) => {
      if (!catalog) return;
      catalog.classList.toggle('is-visible', visible);
      catalog.setAttribute('aria-hidden', String(!visible && mobile.matches));
      if ('inert' in catalog) catalog.inert = mobile.matches && !visible;
    };

    const syncMode = () => {
      if (mobile.matches) {
        setCatalogVisibility(false);
      } else {
        catalog?.classList.remove('is-visible');
        catalog?.setAttribute('aria-hidden', 'false');
        if (catalog && 'inert' in catalog) catalog.inert = false;
      }
      lastScrollY = Math.max(0, window.scrollY);
      accumulatedDelta = 0;
    };

    const updateOnScroll = () => {
      ticking = false;
      if (!mobile.matches || !catalog) return;

      const currentScrollY = Math.max(0, window.scrollY);
      const delta = currentScrollY - lastScrollY;

      if (currentScrollY < 120) {
        setCatalogVisibility(false);
        accumulatedDelta = 0;
      } else if (Math.sign(delta) !== Math.sign(accumulatedDelta)) {
        accumulatedDelta = delta;
      } else {
        accumulatedDelta += delta;
      }

      if (accumulatedDelta >= 18) {
        setCatalogVisibility(true);
        accumulatedDelta = 0;
      } else if (accumulatedDelta <= -18) {
        setCatalogVisibility(false);
        accumulatedDelta = 0;
      }

      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(updateOnScroll);
    }, { passive: true });

    mobile.addEventListener?.('change', syncMode);
    syncMode();

    const setMenuVisibility = (visible, restoreFocus = true) => {
      if (!menu) return;
      menu.classList.toggle('is-open', visible);
      menu.setAttribute('aria-hidden', String(!visible));
      menuOpenButton?.setAttribute('aria-expanded', String(visible));
      if ('inert' in menu) menu.inert = !visible;
      document.documentElement.classList.toggle('cv-menu-open', visible);
      if (visible) {
        lastFocusedElement = document.activeElement;
        setCatalogVisibility(false);
        window.requestAnimationFrame(() => menu.querySelector('[data-cv-menu-close]')?.focus());
      } else if (restoreFocus && lastFocusedElement instanceof HTMLElement) {
        lastFocusedElement.focus({ preventScroll: true });
      }
    };

    menuOpenButton?.addEventListener('click', () => setMenuVisibility(true));
    menuCloseButtons.forEach((button) => button.addEventListener('click', () => setMenuVisibility(false)));
    menuLinks.forEach((link) => link.addEventListener('click', () => setMenuVisibility(false, false)));

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && menu?.classList.contains('is-open')) setMenuVisibility(false);
    });

    document.addEventListener('neon:cart:updated', (event) => {
      const quantity = Number(event.detail?.cart?.item_count ?? event.detail?.item_count ?? 0);
      if (cartBadge) {
        cartBadge.textContent = String(quantity);
        cartBadge.hidden = quantity <= 0;
      }
      if (cartButton) {
        cartButton.setAttribute('aria-label', `Ouvrir le panier, ${quantity} article${quantity === 1 ? '' : 's'}`);
      }
    });

    const updateHeaderHeight = () => {
      if (!mobile.matches) {
        document.body.style.setProperty('--header-group-height', `${Math.round(header.getBoundingClientRect().height)}px`);
      } else {
        const mainHeight = header.querySelector('.cv-header__announcement')?.offsetHeight || 32;
        const announcementHeight = header.querySelector('.cv-header__main')?.offsetHeight || 68;
        document.body.style.setProperty('--header-group-height', `${mainHeight + announcementHeight}px`);
      }
    };

    updateHeaderHeight();
    window.addEventListener('resize', updateHeaderHeight, { passive: true });
    if ('ResizeObserver' in window) new ResizeObserver(updateHeaderHeight).observe(header);
  }

  const initializeAll = (scope = document) => scope.querySelectorAll(SELECTOR).forEach(initialize);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initializeAll());
  } else {
    initializeAll();
  }

  document.addEventListener('shopify:section:load', (event) => initializeAll(event.target));
})();
