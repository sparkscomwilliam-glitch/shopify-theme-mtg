import Lenis from '@theme/lenis';

const body = document.body;
const enabled = body.dataset.lenisEnabled === 'true';

if (!enabled) {
  document.documentElement.style.scrollBehavior = '';
}

const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (enabled && !prefersReduced) {
  const lerp = parseFloat(body.dataset.lenisLerp) || 0.1;
  const wheelMultiplier = parseFloat(body.dataset.lenisWheelMultiplier) || 1;
  const orientation = body.dataset.lenisOrientation || 'vertical';
  const gestureOrientation = body.dataset.lenisGestureOrientation || 'vertical';
  const touchMultiplier = parseFloat(body.dataset.lenisTouchMultiplier) || 1;

  const easing = (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t));

  const lenis = new Lenis({
    lerp,
    easing,
    orientation,
    gestureOrientation,
    wheelMultiplier,
    touchMultiplier,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  // Override native smooth scroll that conflicts with Lenis
  document.documentElement.style.scrollBehavior = 'auto';

  // Pause Lenis when a modal/dialog is open (scroll-lock attribute)
  const observer = new MutationObserver(() => {
    if (document.documentElement.hasAttribute('scroll-lock')) {
      lenis.stop();
    } else {
      lenis.start();
    }
  });
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['scroll-lock'],
  });

}

export default Lenis;
