/* ============================================================
   AG Product Info — shared behavior for V1 / V2 / V3 sections
   Modules: gallery (thumb swap + slider + mobile lightbox),
   quantity-break tiers, FAQ accordion, add-to-cart.
   Vanilla JS only. Posts add-to-cart via Theme.routes.cart_add_url
   and dispatches `cart:update` so Horizon's cart drawer / icon /
   items refresh natively. Per-pack discount codes are applied via
   /discount/CODE before the add. Free gifts are added as extra
   line items in one /cart/add.js call.
   ============================================================ */
(function () {
  'use strict';

  // De-dupe guard: each AG section liquid loads <script src="ag-product-info.js">.
  // If a page renders multiple AG sections, the browser executes this IIFE once
  // per <script> tag, and each execution would attach its own submit listener to
  // the same form — causing N add-to-cart fetches per click. This guard ensures
  // the IIFE actually runs exactly once per page.
  if (window.__agProductInfoLoaded) return;
  window.__agProductInfoLoaded = true;

  function formatMoney(cents, format) {
    const amount = cents / 100;
    const fmt = format || '${{amount}}';

    function withDelimiters(num, precision, thousands, decimal) {
      const fixed = num.toFixed(precision);
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/(\d)(?=(\d{3})+$)/g, '$1' + thousands);
      return parts.join(decimal);
    }

    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case 'amount_no_decimals':
          return withDelimiters(amount, 0, ',', '.');
        case 'amount_with_comma_separator':
          return withDelimiters(amount, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return withDelimiters(amount, 0, '.', ',');
        default:
          return withDelimiters(amount, 2, ',', '.');
      }
    });
  }

  class AgProductInfo {
    constructor(section) {
      this.section = section;
      this.sectionId = section.dataset.sectionId;
      this.moneyFormat = section.dataset.moneyFormat || '${{amount}}';
      this.showCtaPrice = section.dataset.showCtaPrice === 'true';
      this.form = section.querySelector('form[data-ag-product-form]');
      try {
        this.giftVariantIds = JSON.parse(section.dataset.giftVariantIds || '[]');
      } catch (e) {
        this.giftVariantIds = [];
      }

      this.initGallery();
      this.initThumbsSlider();
      this.initLightbox();
      this.initQtyBreaks();
      this.initFaq();
      this.initCtaSubmit();
      this.refreshTotals();
    }

    get quantityInput() {
      return this.form ? this.form.querySelector('[name="quantity"]') : null;
    }

    get variantInput() {
      return this.form ? this.form.querySelector('[name="id"]') : null;
    }

    setText(selector, text) {
      this.section.querySelectorAll(selector).forEach((el) => {
        el.textContent = text;
      });
    }

    /* ---------- gallery: thumb click swaps the main image ---------- */

    initGallery() {
      const mainImg = this.section.querySelector('[data-ag-main-image] img');
      const thumbs = this.section.querySelectorAll('.ag-thumb[data-media-src]');
      if (!mainImg || !thumbs.length) return;

      thumbs.forEach((thumb) => {
        thumb.addEventListener('click', () => {
          const src = thumb.dataset.mediaSrc;
          if (!src) return;
          mainImg.src = src;
          mainImg.removeAttribute('srcset');
          const childImg = thumb.querySelector('img');
          if (childImg && childImg.alt) mainImg.alt = childImg.alt;
          this.section
            .querySelectorAll('.ag-thumb.is-active')
            .forEach((t) => t.classList.remove('is-active'));
          thumb.classList.add('is-active');
        });
      });
    }

    /* ---------- gallery: horizontal thumbnail slider ---------- */

    initThumbsSlider() {
      const track = this.section.querySelector('[data-ag-thumbs-track]');
      if (!track) return;
      const thumbs = track.querySelectorAll('.ag-thumb');
      const prev = this.section.querySelector('[data-ag-thumbs-prev]');
      const next = this.section.querySelector('[data-ag-thumbs-next]');
      if (thumbs.length <= 6 || !prev || !next) return;

      const update = () => {
        prev.hidden = track.scrollLeft <= 2;
        next.hidden = track.scrollLeft + track.clientWidth >= track.scrollWidth - 2;
      };
      prev.addEventListener('click', () =>
        track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' })
      );
      next.addEventListener('click', () =>
        track.scrollBy({ left: track.clientWidth, behavior: 'smooth' })
      );
      track.addEventListener('scroll', update, { passive: true });
      window.addEventListener('resize', update);
      update();
    }

    /* ---------- gallery: mobile lightbox ---------- */

    initLightbox() {
      const trigger = this.section.querySelector('[data-ag-lightbox-open]');
      const dialog = this.section.querySelector('[data-ag-lightbox]');
      if (!trigger || !dialog || typeof dialog.showModal !== 'function') return;

      const isMobile = () => window.matchMedia('(max-width: 767px)').matches;
      trigger.addEventListener('click', () => {
        if (isMobile()) dialog.showModal();
      });
      const close = this.section.querySelector('[data-ag-lightbox-close]');
      if (close) close.addEventListener('click', () => dialog.close());
      dialog.addEventListener('click', (event) => {
        if (event.target === dialog) dialog.close();
      });
    }

    /* ---------- quantity-break tiers ---------- */

    initQtyBreaks() {
      const cards = this.section.querySelectorAll('.ag-qb-card');
      if (!cards.length) return;

      cards.forEach((card) => {
        card.addEventListener('click', (event) => {
          const input = card.querySelector('.ag-qb-input');
          if (!input || input.disabled) return;
          if (event.target !== input) {
            event.preventDefault();
            input.checked = true;
          }
          this.syncQbSelection();
        });

        const input = card.querySelector('.ag-qb-input');
        if (input) {
          input.addEventListener('change', () => this.syncQbSelection());
        }
      });

      this.syncQbSelection();
    }

    syncQbSelection() {
      const inputs = this.section.querySelectorAll('.ag-qb-input');
      inputs.forEach((input) => {
        const card = input.closest('.ag-qb-card');
        if (card) card.classList.toggle('is-selected', input.checked);
      });
      this.refreshTotals();
    }

    get selectedTierInput() {
      return this.section.querySelector('.ag-qb-input:checked');
    }

    /* ---------- totals / price sync ---------- */

    refreshTotals() {
      const tier = this.selectedTierInput;
      let priceCents = null;
      let compareCents = null;
      let quantity = 1;

      if (tier) {
        priceCents = parseInt(tier.dataset.totalCents || '0', 10);
        compareCents = parseInt(tier.dataset.compareCents || '0', 10);
        quantity = parseInt(tier.dataset.qty || '1', 10);
      }

      if (this.quantityInput) {
        this.quantityInput.value = String(quantity);
      }

      if (priceCents === null) return;

      const priceText = formatMoney(priceCents, this.moneyFormat);
      this.setText('[data-ag-price]', priceText);

      const hasCompare = compareCents && compareCents > priceCents;
      this.section.querySelectorAll('[data-ag-compare]').forEach((el) => {
        el.textContent = hasCompare ? formatMoney(compareCents, this.moneyFormat) : '';
        el.style.display = hasCompare ? '' : 'none';
      });

      this.section.querySelectorAll('[data-ag-cta-price]').forEach((el) => {
        const show = this.showCtaPrice;
        el.textContent = show ? priceText : '';
        el.hidden = !show;
      });
    }

    /* ---------- FAQ accordion ---------- */

    initFaq() {
      this.section.querySelectorAll('.ag-faq-btn').forEach((btn) => {
        btn.addEventListener('click', () => {
          const item = btn.closest('.ag-faq-item');
          if (!item) return;
          const isOpen = item.classList.contains('is-open');

          this.section.querySelectorAll('.ag-faq-item.is-open').forEach((openItem) => {
            openItem.classList.remove('is-open');
            const openBtn = openItem.querySelector('.ag-faq-btn');
            if (openBtn) openBtn.setAttribute('aria-expanded', 'false');
            const icon = openItem.querySelector('.ag-faq-btn__icon');
            if (icon) icon.textContent = '+';
          });

          if (!isOpen) {
            item.classList.add('is-open');
            btn.setAttribute('aria-expanded', 'true');
            const icon = item.querySelector('.ag-faq-btn__icon');
            if (icon) icon.textContent = '—';
          }
        });
      });
    }

    /* ---------- main CTA submit ---------- */

    initCtaSubmit() {
      if (!this.form) return;

      this.form.addEventListener('submit', (event) => {
        event.preventDefault();
        const cta = this.form.querySelector('[data-ag-main-cta]');
        this.addToCart(cta);
      });
    }

    /* ---------- discount code (per pack) ---------- */

    async applySelectedDiscount() {
      const tier = this.selectedTierInput;
      const code = tier && tier.dataset.discountCode ? tier.dataset.discountCode.trim() : '';
      if (!code) return;
      try {
        await fetch('/discount/' + encodeURIComponent(code), {
          method: 'GET',
          credentials: 'same-origin',
        });
      } catch (e) {
        /* non-blocking — checkout can still apply the code */
      }
    }

    /* ---------- build add-to-cart body (with optional gifts) ---------- */

    buildAddBody() {
      const formData = new FormData(this.form);
      const gifts = (this.giftVariantIds || []).filter(Boolean);
      if (!gifts.length) return { formData: formData };

      const mainId = formData.get('id');
      const mainQty = parseInt(String(formData.get('quantity') || '1'), 10);
      const items = [{ id: mainId, quantity: mainQty }].concat(
        gifts.map((id) => ({ id: id, quantity: 1 }))
      );

      const sectionIds = this.cartSectionIds();
      const json = { items: items };
      if (sectionIds) json.sections = sectionIds;
      return { json: json };
    }

    cartSectionIds() {
      const ids = new Set();
      document.querySelectorAll('cart-items-component, cart-icon-component, cart-drawer-component').forEach((el) => {
        if (el instanceof HTMLElement && el.dataset.sectionId) {
          ids.add(el.dataset.sectionId);
        }
      });
      return ids.size ? Array.from(ids).join(',') : '';
    }

    openCartDrawer() {
      const drawer = document.querySelector('cart-drawer-component');
      if (drawer && typeof drawer.open === 'function') {
        drawer.open();
        return true;
      }
      const neonDrawer = document.querySelector('neon-cart-drawer');
      if (neonDrawer && typeof neonDrawer.open === 'function') {
        neonDrawer.open();
        return true;
      }
      document.dispatchEvent(new CustomEvent('neon:cart:open'));
      if (document.querySelector('[data-neon-cart-dialog]')) return true;
      return false;
    }

    /* ---------- add to cart (Horizon-compatible) ---------- */

    async addToCart(triggerBtn) {
      if (!this.form) return;
      // Re-entry guard: ignore extra clicks while a request is in flight.
      if (this.adding) return;
      this.adding = true;

      await this.applySelectedDiscount();

      const body = this.buildAddBody();
      const sectionIds = this.cartSectionIds();
      if (body.formData && sectionIds) body.formData.append('sections', sectionIds);

      if (triggerBtn) {
        triggerBtn.setAttribute('aria-busy', 'true');
        triggerBtn.disabled = true;
      }

      try {
        const routes = window.Theme && window.Theme.routes;
        const addUrl = (routes && routes.cart_add_url) || '/cart/add.js';

        const fetchOpts = body.json
          ? {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(body.json),
            }
          : {
              method: 'POST',
              headers: { Accept: 'application/json' },
              body: body.formData,
            };

        const response = await fetch(addUrl, fetchOpts);
        const result = await response.json();

        if (result.status) {
          this.showCtaError(result.message || 'Could not add to cart.');
          return;
        }

        const qty = this.quantityInput ? parseInt(this.quantityInput.value || '1', 10) : 1;
        document.dispatchEvent(
          new CustomEvent('cart:update', {
            bubbles: true,
            detail: {
              resource: result,
              sourceId: this.sectionId,
              data: {
                source: 'ag-product-info',
                itemCount: qty,
                productId: this.section.dataset.productId,
                variantId: this.variantInput ? this.variantInput.value : null,
                sections: result.sections,
              },
            },
          })
        );

        // Explicitly open the cart drawer — bypasses the `auto-open` attribute
        // (which depends on the theme's `auto_open_cart_drawer` setting). The
        // storefront deliberately never redirects an add-to-cart to /cart.
        this.openCartDrawer();
      } catch (error) {
        console.error('[ag-product-info] add to cart failed:', error);
        this.showCtaError('Network error. Please retry.');
      } finally {
        this.adding = false;
        if (triggerBtn) {
          triggerBtn.removeAttribute('aria-busy');
          triggerBtn.disabled = false;
        }
      }
    }

    showCtaError(message) {
      const errorEl = this.section.querySelector('[data-ag-cta-error]');
      if (!errorEl) return;
      errorEl.textContent = message;
      errorEl.hidden = false;
      clearTimeout(this.errorTimeout);
      this.errorTimeout = setTimeout(() => {
        errorEl.hidden = true;
      }, 5000);
    }
  }

  const instances = new WeakMap();

  function init(root) {
    (root || document).querySelectorAll('.ag-pinfo').forEach((section) => {
      if (instances.has(section)) return;
      instances.set(section, new AgProductInfo(section));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }

  document.addEventListener('shopify:section:load', (event) => init(event.target));
  document.addEventListener('shopify:section:unload', (event) => {
    const section = event.target.querySelector('.ag-pinfo');
    if (section && instances.has(section)) instances.delete(section);
  });
})();

/* ============================================================
   AG Product Info — Addons slider behavior
   Lazy-init on .ag-pinfo sections, supports any number of
   [data-ag-addons] blocks. Each toggle:
     - silently /cart/add.js on check (no drawer open)
     - silently /cart/change.js (qty 0) on uncheck
     - updates the parent CTA price when showCtaPrice is true
   Default-active toggles reflect their price in the CTA but
   are added to the cart only on first interaction or on the
   main CTA submit (avoids polluting the cart on every refresh).
   ============================================================ */
(function () {
  'use strict';

  function formatMoneyAddon(cents, format) {
    const amount = cents / 100;
    const fmt = format || '${{amount}}';

    function withDelimiters(num, precision, thousands, decimal) {
      const fixed = num.toFixed(precision);
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/(\d)(?=(\d{3})+$)/g, '$1' + thousands);
      return parts.join(decimal);
    }

    return fmt.replace(/\{\{\s*(\w+)\s*\}\}/, function (_, key) {
      switch (key) {
        case 'amount_no_decimals':
          return withDelimiters(amount, 0, ',', '.');
        case 'amount_with_comma_separator':
          return withDelimiters(amount, 2, '.', ',');
        case 'amount_no_decimals_with_comma_separator':
          return withDelimiters(amount, 0, '.', ',');
        default:
          return withDelimiters(amount, 2, ',', '.');
      }
    });
  }

  function cartSectionIds() {
    const ids = new Set();
    document
      .querySelectorAll('cart-items-component, cart-icon-component, cart-drawer-component')
      .forEach((el) => {
        if (el instanceof HTMLElement && el.dataset.sectionId) {
          ids.add(el.dataset.sectionId);
        }
      });
    return ids.size ? Array.from(ids).join(',') : '';
  }

  function dispatchCartUpdate(result, sectionId) {
    document.dispatchEvent(
      new CustomEvent('cart:update', {
        bubbles: true,
        detail: {
          resource: result,
          sourceId: sectionId,
          data: {
            source: 'ag-product-info-addons',
            sections: result && result.sections,
          },
        },
      })
    );
  }

  class AgAddonsSlider {
    constructor(root, section) {
      this.root = root;
      this.section = section;
      this.sectionId = section.dataset.sectionId;
      this.moneyFormat = section.dataset.moneyFormat || '${{amount}}';
      this.showCtaPrice = section.dataset.showCtaPrice === 'true';

      this.uid = root.dataset.uid || 'ag-addons';
      this.slidesPerView = Math.max(1, parseInt(root.dataset.slidesPerView || '1', 10));
      this.viewport = root.querySelector('[data-ag-addons-viewport]');
      this.track = root.querySelector('[data-ag-addons-track]');
      this.slides = Array.from(root.querySelectorAll('[data-ag-addons-slide]'));
      this.prevBtn = root.querySelector('[data-ag-addons-prev]');
      this.nextBtn = root.querySelector('[data-ag-addons-next]');
      this.dotsHost = root.querySelector('[data-ag-addons-dots]');

      this.index = 0;
      this.lineKeys = new Map(); // slideIndex -> cart line key
      this.busy = new Set();     // slide indexes currently in-flight

      this.applyLayout();
      this.buildDots();
      this.bindNav();
      this.bindToggles();
      this.bindResize();
      this.update();
    }

    /* ---------- slider layout ---------- */

    applyLayout() {
      const total = this.slides.length;
      const perView = Math.min(this.slidesPerView, total) || 1;
      const widthPct = 100 / perView;
      this.slides.forEach((slide) => {
        slide.style.flexBasis = widthPct + '%';
      });
      this.maxIndex = Math.max(0, total - perView);
      if (this.index > this.maxIndex) this.index = this.maxIndex;
    }

    buildDots() {
      if (!this.dotsHost) return;
      this.dotsHost.innerHTML = '';
      const pages = this.maxIndex + 1;
      for (let i = 0; i < pages; i++) {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.className = 'ag-addons__dot';
        dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
        dot.addEventListener('click', () => this.goTo(i));
        this.dotsHost.appendChild(dot);
      }
    }

    bindNav() {
      if (this.prevBtn) {
        this.prevBtn.addEventListener('click', () => this.goTo(this.index - 1));
      }
      if (this.nextBtn) {
        this.nextBtn.addEventListener('click', () => this.goTo(this.index + 1));
      }
    }

    bindResize() {
      let raf = 0;
      window.addEventListener('resize', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          this.applyLayout();
          this.buildDots();
          this.update();
        });
      });
    }

    goTo(i) {
      const clamped = Math.max(0, Math.min(i, this.maxIndex));
      if (clamped === this.index) return;
      this.index = clamped;
      this.update();
    }

    update() {
      if (this.track) {
        const offset = -(this.index * (100 / Math.max(1, Math.min(this.slidesPerView, this.slides.length))));
        this.track.style.transform = 'translate3d(' + offset + '%, 0, 0)';
      }
      if (this.prevBtn) {
        const disabled = this.index <= 0;
        this.prevBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        this.prevBtn.disabled = disabled;
      }
      if (this.nextBtn) {
        const disabled = this.index >= this.maxIndex;
        this.nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        this.nextBtn.disabled = disabled;
      }
      if (this.dotsHost) {
        Array.from(this.dotsHost.children).forEach((dot, i) => {
          dot.classList.toggle('is-active', i === this.index);
        });
      }
    }

    /* ---------- toggle behavior ---------- */

    bindToggles() {
      this.slides.forEach((slide, idx) => {
        const input = slide.querySelector('[data-ag-addon-toggle]');
        if (!input) return;
        input.addEventListener('change', () => this.onToggle(input, idx));
      });
    }

    addonKey(idx) {
      return this.uid + '::' + idx;
    }

    async onToggle(input, idx) {
      if (this.busy.has(idx)) {
        input.checked = !input.checked;
        return;
      }
      this.busy.add(idx);

      try {
        if (input.checked) {
          await this.addToCart(input, idx);
        } else {
          await this.removeFromCart(input, idx);
        }
      } catch (err) {
        console.error('[ag-addons] toggle failed:', err);
        input.checked = !input.checked;
      } finally {
        this.busy.delete(idx);
        this.notifyParent();
      }
    }

    async addToCart(input, idx) {
      const variantId = input.dataset.variantId;
      if (!variantId) return;

      const routes = window.Theme && window.Theme.routes;
      const addUrl = (routes && routes.cart_add_url) || '/cart/add.js';
      const sections = cartSectionIds();
      const payload = {
        items: [
          {
            id: variantId,
            quantity: 1,
            properties: { _ag_addon: this.addonKey(idx) },
          },
        ],
      };
      if (sections) payload.sections = sections;

      const res = await fetch(addUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data && data.status) {
        throw new Error(data.message || 'addon add failed');
      }
      const item = data && data.items && data.items[0];
      if (item && item.key) {
        this.lineKeys.set(idx, item.key);
      }
      dispatchCartUpdate(data, this.sectionId);
    }

    async removeFromCart(input, idx) {
      let key = this.lineKeys.get(idx);
      if (!key) {
        key = await this.lookupLineKey(idx);
      }
      if (!key) return; // nothing to remove

      const routes = window.Theme && window.Theme.routes;
      const changeUrl = (routes && routes.cart_change_url) || '/cart/change.js';
      const sections = cartSectionIds();
      const payload = { id: key, quantity: 0 };
      if (sections) payload.sections = sections;

      const res = await fetch(changeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      this.lineKeys.delete(idx);
      dispatchCartUpdate(data, this.sectionId);
    }

    async lookupLineKey(idx) {
      try {
        const res = await fetch('/cart.js', {
          headers: { Accept: 'application/json' },
          credentials: 'same-origin',
        });
        const cart = await res.json();
        const target = this.addonKey(idx);
        const match = (cart.items || []).find(
          (i) => i.properties && i.properties._ag_addon === target
        );
        return match ? match.key : null;
      } catch (e) {
        return null;
      }
    }

    /* ---------- price + parent notification ---------- */

    activeCents() {
      let sum = 0;
      this.slides.forEach((slide) => {
        const input = slide.querySelector('[data-ag-addon-toggle]');
        if (input && input.checked) {
          sum += parseInt(input.dataset.priceCents || '0', 10) || 0;
        }
      });
      return sum;
    }

    notifyParent() {
      this.section.dispatchEvent(
        new CustomEvent('ag-addons:change', { bubbles: false })
      );
    }
  }

  function sumAddonsForSection(section) {
    let sum = 0;
    section.querySelectorAll('[data-ag-addons]').forEach((root) => {
      root.querySelectorAll('[data-ag-addon-toggle]').forEach((input) => {
        if (input.checked) {
          sum += parseInt(input.dataset.priceCents || '0', 10) || 0;
        }
      });
    });
    return sum;
  }

  function refreshSectionCtaForAddons(section) {
    if (section.dataset.showCtaPrice !== 'true') return;
    const moneyFormat = section.dataset.moneyFormat || '${{amount}}';
    const tier = section.querySelector('.ag-qb-input:checked');
    let base = 0;
    if (tier) {
      base = parseInt(tier.dataset.totalCents || '0', 10) || 0;
    } else {
      // Fallback: read the first [data-ag-cta-price] textContent (already formatted)
      // — we can't reverse-engineer cents reliably, so skip if no tier.
      return;
    }
    const total = base + sumAddonsForSection(section);
    const text = formatMoneyAddon(total, moneyFormat);
    section.querySelectorAll('[data-ag-cta-price]').forEach((el) => {
      el.textContent = text;
    });
  }

  const initialized = new WeakSet();

  function initAddons(root) {
    (root || document).querySelectorAll('.ag-pinfo').forEach((section) => {
      section.querySelectorAll('[data-ag-addons]').forEach((node) => {
        if (initialized.has(node)) return;
        initialized.add(node);
        new AgAddonsSlider(node, section);
      });

      if (!section.dataset.agAddonsHooked) {
        section.dataset.agAddonsHooked = 'true';
        section.addEventListener('ag-addons:change', () => {
          refreshSectionCtaForAddons(section);
        });
        // Recompute on quantity-break selection (tier price changes).
        section.querySelectorAll('.ag-qb-input').forEach((input) => {
          input.addEventListener('change', () => {
            // Defer so the main script's refreshTotals runs first.
            setTimeout(() => refreshSectionCtaForAddons(section), 0);
          });
        });
        // Reflect any default-active toggles on first paint.
        refreshSectionCtaForAddons(section);
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initAddons());
  } else {
    initAddons();
  }

  document.addEventListener('shopify:section:load', (event) => initAddons(event.target));
  document.addEventListener('shopify:block:select', (event) => initAddons(event.target));
})();

/* ============================================================
   AG Product Info — Videos slider behavior
   - layout: slides_per_view on desktop / mobile
   - prev/next translate-based navigation (disabled at edges)
   - autoplay/pause via IntersectionObserver to save bandwidth
   - click a slide -> opens a dialog with native controls (unmuted)
   ============================================================ */
(function () {
  'use strict';

  function isMobile() {
    return window.matchMedia('(max-width: 767px)').matches;
  }

  class AgVideosSlider {
    constructor(root) {
      this.root = root;
      this.viewport = root.querySelector('[data-ag-videos-viewport]');
      this.track = root.querySelector('[data-ag-videos-track]');
      this.slides = Array.from(root.querySelectorAll('[data-ag-videos-slide]'));
      this.prevBtn = root.querySelector('[data-ag-videos-prev]');
      this.nextBtn = root.querySelector('[data-ag-videos-next]');
      this.dialog = root.querySelector('[data-ag-videos-dialog]');
      this.dialogVideo = root.querySelector('[data-ag-videos-dialog-video]');
      this.closeBtn = root.querySelector('[data-ag-videos-close]');
      this.openLightbox = root.dataset.openLightbox === 'true';

      this.perViewDesktop = Math.max(1, parseInt(root.dataset.slidesPerView || '3', 10));
      this.perViewMobile = Math.max(1, parseInt(root.dataset.slidesPerViewMobile || '1', 10));

      this.index = 0;
      this.layout();
      this.bindNav();
      this.bindResize();
      this.bindLightbox();
      this.observeVisibility();
      this.update();
    }

    perView() {
      return isMobile() ? this.perViewMobile : this.perViewDesktop;
    }

    layout() {
      if (!this.viewport || !this.track) return;
      const perView = Math.min(this.perView(), this.slides.length) || 1;
      const styles = getComputedStyle(this.root);
      const gap = parseFloat(styles.getPropertyValue('--ag-videos-gap')) || 0;
      const viewportW = this.viewport.clientWidth;
      const slideW = (viewportW - gap * (perView - 1)) / perView;
      this.slideStep = slideW + gap;
      this.slides.forEach((slide) => {
        slide.style.width = slideW + 'px';
      });
      this.maxIndex = Math.max(0, this.slides.length - perView);
      if (this.index > this.maxIndex) this.index = this.maxIndex;
    }

    bindNav() {
      if (this.prevBtn) this.prevBtn.addEventListener('click', () => this.goTo(this.index - 1));
      if (this.nextBtn) this.nextBtn.addEventListener('click', () => this.goTo(this.index + 1));
    }

    bindResize() {
      let raf = 0;
      window.addEventListener('resize', () => {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(() => {
          this.layout();
          this.update();
        });
      });
    }

    goTo(i) {
      const clamped = Math.max(0, Math.min(i, this.maxIndex));
      if (clamped === this.index) return;
      this.index = clamped;
      this.update();
    }

    update() {
      if (this.track) {
        const offset = -(this.index * (this.slideStep || 0));
        this.track.style.transform = 'translate3d(' + offset + 'px, 0, 0)';
      }
      if (this.prevBtn) {
        const disabled = this.index <= 0;
        this.prevBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        this.prevBtn.disabled = disabled;
      }
      if (this.nextBtn) {
        const disabled = this.index >= this.maxIndex;
        this.nextBtn.setAttribute('aria-disabled', disabled ? 'true' : 'false');
        this.nextBtn.disabled = disabled;
      }
    }

    observeVisibility() {
      if (!('IntersectionObserver' in window)) return;
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const video = entry.target.querySelector('[data-ag-videos-video]');
            if (!video) return;
            if (entry.isIntersecting) {
              const playPromise = video.play();
              if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch(() => {});
              }
            } else {
              video.pause();
            }
          });
        },
        { threshold: 0.25 }
      );
      this.slides.forEach((slide) => io.observe(slide));
    }

    bindLightbox() {
      if (!this.openLightbox || !this.dialog || !this.dialogVideo) return;

      this.slides.forEach((slide) => {
        if (!slide.hasAttribute('data-ag-videos-open')) return;
        slide.addEventListener('click', () => {
          const sourceVideo = slide.querySelector('[data-ag-videos-video]');
          if (!sourceVideo) return;
          this.dialogVideo.src = sourceVideo.currentSrc || sourceVideo.src;
          this.dialogVideo.muted = false;
          if (typeof this.dialog.showModal === 'function') {
            this.dialog.showModal();
            this.dialogVideo.play().catch(() => {});
          }
        });
      });

      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', () => this.dialog.close());
      }
      this.dialog.addEventListener('click', (event) => {
        if (event.target === this.dialog) this.dialog.close();
      });
      this.dialog.addEventListener('close', () => {
        try {
          this.dialogVideo.pause();
          this.dialogVideo.removeAttribute('src');
          this.dialogVideo.load();
        } catch (e) {}
      });
    }
  }

  const initializedVideos = new WeakSet();

  function initVideos(root) {
    (root || document).querySelectorAll('[data-ag-videos]').forEach((node) => {
      if (initializedVideos.has(node)) return;
      initializedVideos.add(node);
      new AgVideosSlider(node);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => initVideos());
  } else {
    initVideos();
  }

  document.addEventListener('shopify:section:load', (event) => initVideos(event.target));
  document.addEventListener('shopify:block:select', (event) => initVideos(event.target));
})();
