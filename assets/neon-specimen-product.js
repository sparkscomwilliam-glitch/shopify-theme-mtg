(function () {
  if (customElements.get('neon-product')) return;

  class NeonProduct extends HTMLElement {
    connectedCallback() {
      this.variants = this.#readVariants();
      this.currency = this.dataset.currency || 'CHF';
      this.locale = this.dataset.locale || document.documentElement.lang || 'fr-CH';
      this.form = this.querySelector('[data-neon-product-form]');
      this.variantInput = this.querySelector('[data-neon-variant-id]');
      this.quantityInput = this.querySelector('[data-neon-quantity-input]');
      this.addEventListener('click', this.#onClick);
      this.addEventListener('change', this.#onChange);
      this.#syncAvailability();
    }

    disconnectedCallback() {
      this.removeEventListener('click', this.#onClick);
      this.removeEventListener('change', this.#onChange);
    }

    #readVariants() {
      try {
        return JSON.parse(this.querySelector('[data-neon-variants]')?.textContent || '[]');
      } catch (error) {
        console.error('Neon product variants could not be read', error);
        return [];
      }
    }

    #onClick = (event) => {
      const thumbnail = event.target.closest('[data-neon-thumbnail]');
      if (thumbnail) this.#selectMedia(thumbnail);

      if (event.target.closest('[data-neon-quantity-minus]')) this.#stepQuantity(-1);
      if (event.target.closest('[data-neon-quantity-plus]')) this.#stepQuantity(1);

      if (event.target.closest('[data-neon-zoom-open]')) this.#openZoom();
      if (event.target.closest('[data-neon-zoom-close]')) this.#closeZoom();
    };

    #onChange = (event) => {
      if (event.target.matches('[data-neon-option]')) this.#selectVariant();
    };

    #selectMedia(thumbnail) {
      const main = this.querySelector('[data-neon-main-image], .ns-product__main-media img');
      if (!main || !thumbnail.dataset.mediaSrc) return;
      main.src = thumbnail.dataset.mediaSrc;
      main.removeAttribute('srcset');
      main.alt = thumbnail.dataset.mediaAlt || '';
      this.querySelectorAll('[data-neon-thumbnail]').forEach((item) => {
        const active = item === thumbnail;
        item.classList.toggle('is-active', active);
        item.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      const counter = this.querySelector('[data-neon-view-count]');
      if (counter) {
        const index = String(thumbnail.dataset.mediaIndex || 1).padStart(2, '0');
        const total = String(this.querySelectorAll('[data-neon-thumbnail]').length || 1).padStart(2, '0');
        counter.textContent = `VUE ${index} / ${total}`;
      }
      const zoom = this.querySelector('[data-neon-zoom-image], .ns-product__zoom-dialog img');
      if (zoom) {
        zoom.src = thumbnail.dataset.mediaSrc;
        zoom.removeAttribute('srcset');
        zoom.alt = thumbnail.dataset.mediaAlt || '';
      }
    }

    #selectedOptions() {
      return Array.from(this.querySelectorAll('[data-neon-option]:checked')).map((input) => input.value);
    }

    #selectVariant() {
      const selected = this.#selectedOptions();
      const variant = this.variants.find((item) => item.options.every((value, index) => value === selected[index]));
      if (!variant) {
        if (this.variantInput) this.variantInput.value = '';
        this.#setAddState(false, 'Indisponible');
        return;
      }

      if (this.variantInput) this.variantInput.value = variant.id;
      const price = this.querySelector('[data-neon-price]');
      if (price) price.textContent = this.#formatMoney(variant.price);
      const compare = this.querySelector('[data-neon-compare]');
      if (compare) {
        const showCompare = Number(variant.compare_at_price || 0) > Number(variant.price || 0);
        compare.textContent = showCompare ? this.#formatMoney(variant.compare_at_price) : '';
        compare.classList.toggle('is-hidden', !showCompare);
      }
      const sku = this.querySelector('[data-neon-sku]');
      if (sku) sku.textContent = variant.sku || '—';
      this.#setAddState(Boolean(variant.available), variant.available ? (this.dataset.addLabel || 'Ajouter au panier') : (this.dataset.soldOutLabel || 'Épuisé'));
      this.#setStock(Boolean(variant.available), variant.inventory_quantity);
      this.#selectVariantMedia(variant);
      this.#updateUrl(variant.id);
      this.#syncAvailability();
    }

    #selectVariantMedia(variant) {
      const mediaId = variant.featured_media?.id || variant.featured_image?.id;
      if (mediaId) {
        const thumb = this.querySelector(`[data-media-id="${mediaId}"]`);
        if (thumb) this.#selectMedia(thumb);
      }
    }

    #syncAvailability() {
      const selections = this.#selectedOptions();
      this.querySelectorAll('[data-neon-option]').forEach((input) => {
        const group = input.closest('[data-neon-option-group]');
        const position = Number(group?.dataset.optionPosition || 1) - 1;
        const candidate = [...selections];
        candidate[position] = input.value;
        const possible = this.variants.some((variant) => variant.available && variant.options.every((value, index) => !candidate[index] || candidate[index] === value));
        input.disabled = !possible;
      });
    }

    #setAddState(available, label) {
      const button = this.querySelector('[data-neon-add]');
      const text = this.querySelector('[data-neon-add-label]');
      if (button) button.disabled = !available;
      if (text) text.textContent = label;
    }

    #setStock(available, quantity) {
      const chip = this.querySelector('[data-neon-stock-chip]');
      if (!chip) return;
      chip.dataset.soldOut = available ? 'false' : 'true';
      const inStock = this.dataset.inStockLabel || 'PIÈCE DISPONIBLE';
      const soldOut = this.dataset.soldOutLabel || 'ÉPUISÉ';
      chip.textContent = available ? `${inStock}${quantity > 0 ? ` · STOCK ${quantity}` : ''}` : soldOut;
    }

    #stepQuantity(direction) {
      if (!this.quantityInput) return;
      const step = Number(this.quantityInput.step || 1);
      const min = Number(this.quantityInput.min || 1);
      const max = this.quantityInput.max ? Number(this.quantityInput.max) : Infinity;
      const next = Math.max(min, Math.min(max, Number(this.quantityInput.value || min) + direction * step));
      this.quantityInput.value = String(next);
      this.quantityInput.dispatchEvent(new Event('change', { bubbles: true }));
    }

    #formatMoney(cents) {
      try {
        return new Intl.NumberFormat(this.locale, { style: 'currency', currency: this.currency }).format(Number(cents || 0) / 100);
      } catch (_error) {
        return `${(Number(cents || 0) / 100).toFixed(2)} ${this.currency}`;
      }
    }

    #updateUrl(variantId) {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', variantId);
      window.history.replaceState({}, '', url);
    }

    #openZoom() {
      const dialog = this.querySelector('[data-neon-zoom-dialog]');
      if (dialog && typeof dialog.showModal === 'function' && !dialog.open) dialog.showModal();
    }

    #closeZoom() {
      const dialog = this.querySelector('[data-neon-zoom-dialog]');
      if (dialog?.open) dialog.close();
    }
  }

  customElements.define('neon-product', NeonProduct);
})();
