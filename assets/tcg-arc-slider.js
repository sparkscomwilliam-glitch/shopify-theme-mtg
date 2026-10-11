class TcgArcSlider extends HTMLElement {
  connectedCallback() {
    this.track = this.querySelector('[data-tcg-track]');
    this.cards = Array.from(this.querySelectorAll('[data-tcg-card]'));
    this.activeTitle = this.querySelector('[data-tcg-active-title]');
    this.activePrice = this.querySelector('[data-tcg-active-price]');
    this.activeLink = this.querySelector('[data-tcg-active-link]');
    this.previousButton = this.querySelector('[data-tcg-previous]');
    this.nextButton = this.querySelector('[data-tcg-next]');

    if (!this.track || this.cards.length === 0) return;

    this.activeIndex = Math.min(Number(this.dataset.initialIndex || 0), this.cards.length - 1);
    this.frameRequested = false;

    this.onScroll = () => {
      if (this.frameRequested) return;
      this.frameRequested = true;
      requestAnimationFrame(() => {
        this.frameRequested = false;
        this.syncToViewport();
      });
    };

    this.track.addEventListener('scroll', this.onScroll, { passive: true });
    this.previousButton?.addEventListener('click', () => this.goTo(this.activeIndex - 1));
    this.nextButton?.addEventListener('click', () => this.goTo(this.activeIndex + 1));
    this.cards.forEach((card, index) => card.addEventListener('click', () => this.goTo(index)));

    this.resizeObserver = new ResizeObserver(() => this.goTo(this.activeIndex, false));
    this.resizeObserver.observe(this.track);

    requestAnimationFrame(() => this.goTo(this.activeIndex, false));
  }

  disconnectedCallback() {
    this.track?.removeEventListener('scroll', this.onScroll);
    this.resizeObserver?.disconnect();
  }

  goTo(index, smooth = true) {
    const boundedIndex = Math.max(0, Math.min(index, this.cards.length - 1));
    const card = this.cards[boundedIndex];
    if (!card) return;

    this.activeIndex = boundedIndex;
    const left = card.offsetLeft - (this.track.clientWidth - card.offsetWidth) / 2;
    this.track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
    this.updateState();
  }

  syncToViewport() {
    const center = this.track.scrollLeft + this.track.clientWidth / 2;
    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;

    this.cards.forEach((card, index) => {
      const cardCenter = card.offsetLeft + card.offsetWidth / 2;
      const distance = Math.abs(cardCenter - center);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });

    if (nearestIndex !== this.activeIndex) {
      this.activeIndex = nearestIndex;
      this.updateState();
    }
  }

  updateState() {
    const activeCard = this.cards[this.activeIndex];
    if (!activeCard) return;

    this.cards.forEach((card, index) => {
      const rawDistance = index - this.activeIndex;
      const distance = Math.max(-3, Math.min(3, rawDistance));
      card.dataset.distance = String(distance);
      card.setAttribute('aria-current', index === this.activeIndex ? 'true' : 'false');
      card.tabIndex = index === this.activeIndex ? 0 : -1;
    });

    if (this.activeTitle) this.activeTitle.textContent = activeCard.dataset.title || '';
    if (this.activePrice) this.activePrice.textContent = activeCard.dataset.price || '';
    if (this.activeLink) {
      this.activeLink.href = activeCard.dataset.url || '#';
      this.activeLink.setAttribute('aria-label', `Voir ${activeCard.dataset.title || 'ce produit'}`);
    }

    if (this.previousButton) this.previousButton.disabled = this.activeIndex === 0;
    if (this.nextButton) this.nextButton.disabled = this.activeIndex === this.cards.length - 1;
  }
}

if (!customElements.get('tcg-arc-slider')) {
  customElements.define('tcg-arc-slider', TcgArcSlider);
}
