(function () {
  'use strict';

  let catalog = [];
  let owned = new Set();
  let activeTab = 'all';

  async function load() {
    const cfg = await fetch('/api/config').then((r) => r.json());
    catalog = cfg.catalog;

    const me = await window.Auth.fetchMe();
    if (!me) {
      document.getElementById('login-prompt').style.display = 'block';
      owned = new Set();
    } else {
      owned = new Set(me.cosmetics);
    }
    render();
  }

  function render() {
    const grid = document.getElementById('shop-grid');
    grid.innerHTML = '';
    const items = catalog.filter((c) => activeTab === 'all' || c.type === activeTab);
    items.forEach((item) => grid.appendChild(card(item)));
    requestAnimationFrame(animatePreviews);
  }

  let previewCanvases = [];
  function animatePreviews() {
    previewCanvases.forEach(({ canvas, item }) => window.OrbitalPreview.render(canvas, item));
    if (previewCanvases.length) requestAnimationFrame(animatePreviews);
  }

  function card(item) {
    const div = document.createElement('div');
    div.className = 'card cosmetic-card';
    const price = item.vip ? 'VIP only' : `$${(item.price / 100).toFixed(2)}`;
    const isOwned = owned.has(item.id);
    div.innerHTML = `
      <div class="preview"><canvas width="240" height="240"></canvas></div>
      <h4>${escapeHtml(item.name)}</h4>
      <div class="meta">${capitalize(item.type)} ${item.vip ? '— VIP exclusive' : ''}</div>
      <div class="row">
        <div style="font-weight:700;">${price}</div>
        <button class="btn" data-id="${item.id}" ${isOwned || item.vip ? 'disabled' : ''}>
          ${isOwned ? 'Owned' : (item.vip ? 'VIP only' : 'Buy')}
        </button>
      </div>
    `;
    const canvas = div.querySelector('canvas');
    previewCanvases.push({ canvas, item });
    const btn = div.querySelector('button');
    if (!btn.disabled) btn.addEventListener('click', () => buy(item));
    return div;
  }

  async function buy(item) {
    if (!window.Auth.getToken()) {
      location.href = '/login.html';
      return;
    }
    try {
      const data = await window.Auth.api('/api/stripe/checkout/cosmetic', {
        method: 'POST',
        body: JSON.stringify({ cosmeticId: item.id }),
      });
      if (data.url) location.href = data.url;
    } catch (e) {
      alert(e.message || 'Checkout failed.');
    }
  }

  function showBanner() {
    const params = new URLSearchParams(location.search);
    const banner = document.getElementById('purchase-banner');
    if (params.get('purchase') === 'success') {
      banner.innerHTML = `<div class="success">✓ Purchase complete! Your cosmetic is unlocked. (Webhook processes within a few seconds.)</div>`;
      // Re-fetch ownership after a short delay to wait for webhook
      setTimeout(load, 2500);
    } else if (params.get('purchase') === 'cancelled') {
      banner.innerHTML = `<div class="error">Payment cancelled.</div>`;
    }
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        activeTab = t.dataset.tab;
        previewCanvases = [];
        render();
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }
  function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    showBanner();
    load();
  });
})();
