(() => {
  const SELECTOR = '[data-cv-live-search]';
  const initialized = new WeakSet();

  function initialize(root) {
    if (!root || initialized.has(root)) return;
    initialized.add(root);

    const section = root.closest('.cv-hero');
    const launcher = section?.querySelector('[data-cv-search-launch]');
    const launcherInput = launcher?.querySelector('input[type="search"]');
    const sheet = root.querySelector('.cv-live-search__sheet');
    const form = root.querySelector('[data-cv-search-form]');
    const input = root.querySelector('[data-cv-search-input]');
    const results = root.querySelector('[data-cv-search-results]');
    const status = root.querySelector('[data-cv-search-status]');
    const sort = root.querySelector('[data-cv-search-sort]');
    const clear = root.querySelector('[data-cv-search-clear]');
    const viewAll = root.querySelector('[data-cv-search-all]');

    if (!launcher || !launcherInput || !sheet || !form || !input || !results || !status || !sort || !clear || !viewAll) return;

    const predictiveUrl = root.dataset.predictiveUrl || '/search/suggest';
    const searchUrl = root.dataset.searchUrl || '/search';
    const cache = new Map();
    let products = [];
    let debounceTimer;
    let controller;
    let opener;
    let suppressOpen = false;

    const setOpen = (open, initialQuery = '') => {
      if (open) {
        opener = document.activeElement;
        root.setAttribute('aria-hidden', 'false');
        document.documentElement.classList.add('cv-search-is-open');
        input.value = initialQuery;
        updateClearButton();
        requestAnimationFrame(() => {
          root.classList.add('is-open');
          input.focus({ preventScroll: true });
          input.setSelectionRange(input.value.length, input.value.length);
        });
        if (initialQuery.trim().length > 1) queueSearch();
      } else {
        root.classList.remove('is-open');
        root.setAttribute('aria-hidden', 'true');
        document.documentElement.classList.remove('cv-search-is-open');
        controller?.abort();
        suppressOpen = true;
        if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
        window.setTimeout(() => { suppressOpen = false; }, 180);
      }
    };

    const updateClearButton = () => {
      clear.hidden = input.value.length === 0;
    };

    const parsePrice = (value) => {
      if (typeof value === 'number') return value;
      const normalized = String(value || '')
        .replace(/[^0-9,.-]/g, '')
        .replace(/\.(?=\d{3}(?:\D|$))/g, '')
        .replace(',', '.');
      const parsed = Number.parseFloat(normalized);
      return Number.isFinite(parsed) ? parsed : Number.POSITIVE_INFINITY;
    };

    const sortedProducts = () => {
      const next = [...products];
      if (sort.value === 'price-asc') next.sort((a, b) => parsePrice(a.price) - parsePrice(b.price));
      if (sort.value === 'price-desc') next.sort((a, b) => parsePrice(b.price) - parsePrice(a.price));
      if (sort.value === 'title-asc') next.sort((a, b) => String(a.title).localeCompare(String(b.title), 'fr', { sensitivity: 'base' }));
      return next;
    };

    const imageUrlFor = (product) => {
      const image = product.featured_image || product.image;
      if (!image) return '';
      return typeof image === 'string' ? image : image.url || image.src || '';
    };

    const render = () => {
      results.replaceChildren();
      const ordered = sortedProducts();

      ordered.forEach((product) => {
        const link = document.createElement('a');
        link.className = 'cv-live-search-card';
        link.href = product.url || `${searchUrl}?q=${encodeURIComponent(product.title || '')}`;

        const media = document.createElement('span');
        media.className = 'cv-live-search-card__media';
        const imageUrl = imageUrlFor(product);
        if (imageUrl) {
          const image = document.createElement('img');
          image.src = imageUrl;
          image.alt = product.title || '';
          image.loading = 'lazy';
          image.width = 92;
          image.height = 112;
          media.append(image);
        } else {
          media.classList.add('cv-live-search-card__media--empty');
          media.setAttribute('aria-hidden', 'true');
        }

        const copy = document.createElement('span');
        copy.className = 'cv-live-search-card__copy';

        const eyebrow = document.createElement('span');
        eyebrow.className = 'cv-live-search-card__eyebrow';
        eyebrow.textContent = [product.vendor, product.type || product.product_type].filter(Boolean).join(' · ') || 'COLLECTOR ITEM';

        const title = document.createElement('strong');
        title.textContent = product.title || 'Produit';

        const price = document.createElement('span');
        price.className = 'cv-live-search-card__price';
        price.textContent = product.price || '';

        copy.append(eyebrow, title, price);
        link.append(media, copy);
        results.append(link);
      });
    };

    const showSkeletons = () => {
      results.replaceChildren();
      for (let index = 0; index < 4; index += 1) {
        const skeleton = document.createElement('span');
        skeleton.className = 'cv-live-search-card cv-live-search-card--loading';
        skeleton.setAttribute('aria-hidden', 'true');
        skeleton.innerHTML = '<span class="cv-live-search-card__media"></span><span class="cv-live-search-card__copy"><i></i><i></i><i></i></span>';
        results.append(skeleton);
      }
    };

    const search = async () => {
      const query = input.value.trim();
      updateClearButton();
      viewAll.href = `${searchUrl}?q=${encodeURIComponent(query)}&type=product`;

      if (query.length < 2) {
        controller?.abort();
        products = [];
        results.replaceChildren();
        sort.disabled = true;
        viewAll.hidden = true;
        status.textContent = query.length ? 'Saisissez au moins deux caractères.' : 'Commencez à écrire pour rechercher dans le catalogue.';
        return;
      }

      const key = query.toLocaleLowerCase('fr');
      if (cache.has(key)) {
        products = cache.get(key);
        sort.disabled = products.length < 2;
        viewAll.hidden = products.length === 0;
        status.textContent = products.length ? `${products.length} produit${products.length > 1 ? 's' : ''} trouvé${products.length > 1 ? 's' : ''}.` : `Aucun produit trouvé pour « ${query} ».`;
        render();
        return;
      }

      controller?.abort();
      controller = new AbortController();
      sort.disabled = true;
      viewAll.hidden = true;
      status.textContent = `Recherche de « ${query} »…`;
      showSkeletons();

      try {
        const endpoint = new URL(`${predictiveUrl.replace(/\.json$/, '')}.json`, window.location.origin);
        endpoint.searchParams.set('q', query);
        endpoint.searchParams.set('resources[type]', 'product');
        endpoint.searchParams.set('resources[limit]', '8');
        endpoint.searchParams.set('resources[options][unavailable_products]', 'last');
        endpoint.searchParams.set('resources[options][fields]', 'title,product_type,vendor,variants.title,tag');

        const response = await fetch(endpoint, { signal: controller.signal, headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error(`Search failed: ${response.status}`);
        const payload = await response.json();
        products = payload.resources?.results?.products || [];
        cache.set(key, products);
        sort.disabled = products.length < 2;
        viewAll.hidden = products.length === 0;
        status.textContent = products.length ? `${products.length} produit${products.length > 1 ? 's' : ''} trouvé${products.length > 1 ? 's' : ''}.` : `Aucun produit trouvé pour « ${query} ».`;
        render();
      } catch (error) {
        if (error.name === 'AbortError') return;
        products = [];
        results.replaceChildren();
        status.textContent = 'La recherche est momentanément indisponible. Utilisez la recherche complète.';
        viewAll.hidden = false;
      }
    };

    const queueSearch = () => {
      window.clearTimeout(debounceTimer);
      debounceTimer = window.setTimeout(search, 140);
    };

    const openFromLauncher = () => {
      if (suppressOpen || root.classList.contains('is-open')) return;
      setOpen(true, launcherInput.value);
    };

    launcher.addEventListener('submit', (event) => {
      event.preventDefault();
      openFromLauncher();
    });
    launcherInput.addEventListener('focus', openFromLauncher);
    launcherInput.addEventListener('pointerdown', openFromLauncher);
    launcherInput.addEventListener('input', openFromLauncher);

    input.addEventListener('input', queueSearch);
    sort.addEventListener('change', render);
    form.addEventListener('submit', (event) => {
      if (input.value.trim().length < 2) event.preventDefault();
    });
    clear.addEventListener('click', () => {
      input.value = '';
      input.focus();
      search();
    });
    root.querySelectorAll('[data-cv-search-close]').forEach((button) => {
      button.addEventListener('click', () => setOpen(false));
    });

    document.addEventListener('keydown', (event) => {
      if (!root.classList.contains('is-open')) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...sheet.querySelectorAll('a[href], button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')]
        .filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  const initializeAll = (scope = document) => scope.querySelectorAll(SELECTOR).forEach(initialize);
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => initializeAll());
  else initializeAll();
  document.addEventListener('shopify:section:load', (event) => initializeAll(event.target));
})();
