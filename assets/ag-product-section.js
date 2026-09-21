/* ============================================================
   ag-product-section.js
   Subscription plans interaction (radio cards)
   Other interactions (variants, cart, accordion) handled by Horizon natively.
   ============================================================ */
(function () {
  'use strict';

  function initSubscriptionPlans(scope) {
    var plans = Array.prototype.slice.call(scope.querySelectorAll('.ag-subscription-plans__plan'));
    if (plans.length === 0) return;

    function selectPlan(el) {
      plans.forEach(function (p) { p.classList.remove('is-active'); });
      el.classList.add('is-active');

      // Sync price with CTA (if data-now attribute is set)
      var now = el.getAttribute('data-now');
      if (now) {
        var ctaPrices = scope.querySelectorAll('.ag-cta-price, .ctaprice');
        ctaPrices.forEach(function (el) { el.textContent = now; });
      }

      // Optional: trigger Shopify selling-plan change if data-selling-plan-id present
      var sellingPlanId = el.getAttribute('data-selling-plan-id');
      if (sellingPlanId) {
        var sellingPlanInput = scope.querySelector('input[name="selling_plan"]');
        if (sellingPlanInput) {
          sellingPlanInput.value = sellingPlanId === 'one-time' ? '' : sellingPlanId;
          sellingPlanInput.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }
    }

    plans.forEach(function (el) {
      el.addEventListener('click', function () { selectPlan(el); });
      el.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          selectPlan(el);
        }
      });
    });
  }

  function init() {
    document.querySelectorAll('.ag-product-section').forEach(function (scope) {
      initSubscriptionPlans(scope);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-init on Shopify section reload (Customizer)
  document.addEventListener('shopify:section:load', function (e) {
    if (e.target && e.target.querySelector('.ag-product-section')) {
      initSubscriptionPlans(e.target);
    }
  });
})();
