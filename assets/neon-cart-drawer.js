(function () {
  if (customElements.get('neon-cart-drawer')) return;

  class NeonCartDrawer extends HTMLElement {
    connectedCallback() {
      this.dialog = this.querySelector('[data-neon-cart-dialog]');
      this.items = this.querySelector('[data-neon-cart-items]');
      this.footer = this.querySelector('[data-neon-cart-footer]');
      this.live = this.querySelector('[data-neon-cart-live]');
      this.root = window.Shopify?.routes?.root || '/';
      document.addEventListener('click', this.#onDocumentClick);
      document.addEventListener('submit', this.#onDocumentSubmit, true);
      document.addEventListener('cart:update', this.#onThemeCartUpdate);
      document.addEventListener('neon:cart:open', this.#onExternalOpen);
      this.addEventListener('click', this.#onDrawerClick);
      this.dialog?.addEventListener('click', this.#onDialogClick);
      this.dialog?.addEventListener('cancel', this.#onCancel);
      this.#refresh(false);
    }

    disconnectedCallback() {
      document.removeEventListener('click', this.#onDocumentClick);
      document.removeEventListener('submit', this.#onDocumentSubmit, true);
      document.removeEventListener('cart:update', this.#onThemeCartUpdate);
      document.removeEventListener('neon:cart:open', this.#onExternalOpen);
      this.removeEventListener('click', this.#onDrawerClick);
      this.dialog?.removeEventListener('click', this.#onDialogClick);
      this.dialog?.removeEventListener('cancel', this.#onCancel);
    }

    open = async () => {
      await this.#refresh(false);
      if (this.dialog && !this.dialog.open) this.dialog.showModal();
    };

    close = () => {
      if (!this.dialog?.open || this.dialog.classList.contains('is-closing')) return;
      this.dialog.classList.add('is-closing');
      window.setTimeout(() => {
        this.dialog?.close();
        this.dialog?.classList.remove('is-closing');
      }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 240);
    };

    #onExternalOpen = () => this.open();
    #onThemeCartUpdate = () => this.#refresh(true);

    #onDocumentClick = (event) => {
      const trigger = event.target.closest('[data-neon-cart-open]');
      if (trigger) {
        event.preventDefault();
        this.open();
        return;
      }

      const link = event.target.closest('a[href]');
      if (!link || link.closest('neon-cart-drawer') || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      try {
        const url = new URL(link.href, window.location.origin);
        const cartPath = new URL(this.dataset.cartUrl || `${this.root}cart`, window.location.origin).pathname.replace(/\/$/, '');
        if (url.origin === window.location.origin && url.pathname.replace(/\/$/, '') === cartPath) {
          event.preventDefault();
          this.open();
        }
      } catch (_error) {
        // Ignore malformed links.
      }
    };

    #onDocumentSubmit = (event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      let action;
      try { action = new URL(form.action, window.location.origin); } catch (_error) { return; }
      if (!/\/cart\/add(?:\.js)?\/?$/.test(action.pathname)) return;

      // Horizon and legacy AG components already submit with AJAX and emit cart:update.
      const horizonForm = form.closest('product-form-component');
      if ((horizonForm && horizonForm.hasAttribute('on:submit')) || form.matches('[data-ag-product-form]')) return;

      event.preventDefault();
      this.#addForm(form);
    };

    #onDrawerClick = (event) => {
      if (event.target.closest('[data-neon-cart-close]')) {
        this.close();
        return;
      }
      const quantity = event.target.closest('[data-neon-cart-change]');
      if (quantity) this.#changeLine(Number(quantity.dataset.line), Number(quantity.dataset.quantity));
      const remove = event.target.closest('[data-neon-cart-remove]');
      if (remove) this.#changeLine(Number(remove.dataset.line), 0);
    };

    #onDialogClick = (event) => {
      if (event.target === this.dialog) this.close();
    };

    #onCancel = (event) => {
      event.preventDefault();
      this.close();
    };

    async #addForm(form) {
      const button = form.querySelector('[type="submit"]');
      const error = form.closest('[data-neon-product]')?.querySelector('[data-neon-form-error]');
      if (button) {
        button.disabled = true;
        button.setAttribute('aria-busy', 'true');
      }
      if (error) error.hidden = true;

      try {
        const response = await fetch(`${this.root}cart/add.js`, {
          method: 'POST',
          headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' },
          body: new FormData(form),
        });
        const data = await response.json();
        if (!response.ok || data.status) throw new Error(data.description || data.message || 'Ce produit n’a pas pu être ajouté.');
        await this.#refresh(true, 'Produit ajouté au panier.');
      } catch (requestError) {
        if (error) {
          error.textContent = requestError.message;
          error.hidden = false;
        }
        this.#announce(requestError.message || 'Erreur lors de l’ajout au panier.');
      } finally {
        if (button) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      }
    }

    async #changeLine(line, quantity) {
      if (!line || quantity < 0) return;
      this.items?.setAttribute('aria-busy', 'true');
      try {
        const response = await fetch(`${this.root}cart/change.js`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ line, quantity }),
        });
        const cart = await response.json();
        if (!response.ok || cart.status) throw new Error(cart.description || cart.message || 'Le panier n’a pas pu être mis à jour.');
        this.#render(cart);
        this.#broadcast(cart, quantity === 0 ? 'Produit retiré du panier.' : 'Quantité mise à jour.');
      } catch (requestError) {
        this.#showError(requestError.message);
      }
    }

    async #refresh(shouldOpen, announcement) {
      try {
        const response = await fetch(`${this.root}cart.js`, { headers: { Accept: 'application/json' } });
        if (!response.ok) throw new Error('Le panier n’a pas pu être chargé.');
        const cart = await response.json();
        this.#render(cart);
        this.#broadcast(cart, announcement);
        if (shouldOpen && this.dialog && !this.dialog.open) this.dialog.showModal();
        return cart;
      } catch (requestError) {
        this.#showError(requestError.message);
        return null;
      }
    }

    #render(cart) {
      if (!this.items) return;
      this.activeCurrency = cart.currency || this.activeCurrency || 'CHF';
      this.items.setAttribute('aria-busy', 'false');
      const count = Number(cart.item_count || 0);
      this.querySelector('[data-neon-cart-heading-count]').textContent = count ? `· ${count}` : '';
      document.querySelectorAll('[data-neon-cart-count], [data-cv-cart-count]').forEach((node) => { node.textContent = String(count); });

      if (!count) {
        this.items.innerHTML = '<div class="neon-cart__empty"><div><strong>Votre panier est vide</strong><span>Explorez le catalogue pour trouver votre prochain spécimen.</span></div></div>';
        if (this.footer) this.footer.hidden = true;
        return;
      }

      this.items.innerHTML = cart.items.map((item, index) => this.#itemMarkup(item, index + 1)).join('');
      if (this.footer) this.footer.hidden = false;
      const subtotal = this.querySelector('[data-neon-cart-subtotal]');
      if (subtotal) subtotal.textContent = this.#money(cart.total_price, cart.currency);
    }

    #itemMarkup(item, line) {
      const image = item.image ? `<img src="${this.#escape(item.image)}&width=240" alt="${this.#escape(item.product_title)}" loading="lazy">` : '';
      const variant = item.variant_title && item.variant_title !== 'Default Title' ? `<p class="neon-cart__variant">${this.#escape(item.variant_title)}</p>` : '';
      const previous = Math.max(0, Number(item.quantity) - 1);
      const next = Number(item.quantity) + 1;
      return `<article class="neon-cart__item">
        <a class="neon-cart__image" href="${this.#escape(item.url)}">${image}</a>
        <div class="neon-cart__copy">
          <a class="neon-cart__title" href="${this.#escape(item.url)}">${this.#escape(item.product_title)}</a>
          ${variant}
          <div class="neon-cart__quantity" aria-label="Quantité de ${this.#escape(item.product_title)}">
            <button type="button" data-neon-cart-change data-line="${line}" data-quantity="${previous}" aria-label="Réduire la quantité">−</button>
            <output>${Number(item.quantity)}</output>
            <button type="button" data-neon-cart-change data-line="${line}" data-quantity="${next}" aria-label="Augmenter la quantité">＋</button>
          </div>
        </div>
        <div class="neon-cart__line">
          <div class="neon-cart__line-price">${this.#money(item.final_line_price, item.currency || '')}</div>
          <button class="neon-cart__remove" type="button" data-neon-cart-remove data-line="${line}">Retirer</button>
        </div>
      </article>`;
    }

    #broadcast(cart, announcement) {
      document.dispatchEvent(new CustomEvent('neon:cart:updated', { detail: { cart } }));
      if (announcement) this.#announce(announcement);
    }

    #announce(message) {
      if (!this.live) return;
      this.live.textContent = '';
      window.requestAnimationFrame(() => { this.live.textContent = message; });
    }

    #showError(message) {
      if (this.items) this.items.innerHTML = `<p class="neon-cart__error" role="alert">${this.#escape(message || 'Une erreur est survenue.')}</p>`;
      this.#announce(message || 'Une erreur est survenue.');
    }

    #money(cents, currency) {
      const code = currency || this.activeCurrency || document.querySelector('neon-product')?.dataset.currency || 'CHF';
      try { return new Intl.NumberFormat(document.documentElement.lang || 'fr-CH', { style: 'currency', currency: code }).format(Number(cents || 0) / 100); }
      catch (_error) { return `${(Number(cents || 0) / 100).toFixed(2)} ${code}`; }
    }

    #escape(value) {
      return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
    }
  }

  customElements.define('neon-cart-drawer', NeonCartDrawer);
})();
