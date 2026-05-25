(function () {
  'use strict';

  let catalog = [];
  let owned = [];
  let user = null;

  async function load() {
    const me = await window.Auth.fetchMe();
    if (!me) {
      document.getElementById('profile-panel').innerHTML =
        '<p><a href="/login.html">Log in</a> to view your profile.</p>';
      return;
    }
    user = me.user;
    owned = me.cosmetics || [];
    const cfg = await fetch('/api/config').then((r) => r.json());
    catalog = cfg.catalog;
    renderInfo();
    renderInventory();
    renderEquip();
  }

  function renderInfo() {
    const el = document.getElementById('profile-info');
    el.innerHTML = `
      <div style="display:flex; gap:24px; flex-wrap:wrap;">
        <div>
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">Username</div>
          <div style="font-size:20px;">${escapeHtml(user.username)} ${user.is_vip ? '<span class="vip-badge">★ VIP</span>' : ''}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">High score</div>
          <div style="font-size:20px;">${user.high_score || 0}</div>
        </div>
        <div>
          <div style="font-size:11px; color:var(--muted); text-transform:uppercase;">Cosmetics owned</div>
          <div style="font-size:20px;">${owned.length}</div>
        </div>
      </div>
    `;
  }

  let previews = [];
  function renderInventory() {
    const grid = document.getElementById('inventory-grid');
    grid.innerHTML = '';
    previews = [];
    if (!owned.length) {
      grid.innerHTML = '<div class="panel" style="grid-column: 1/-1; text-align:center;">No cosmetics yet. <a href="/shop.html">Visit the shop</a>.</div>';
      return;
    }
    owned.forEach((id) => {
      const item = catalog.find((c) => c.id === id);
      if (!item) return;
      const card = document.createElement('div');
      card.className = 'card cosmetic-card';
      card.innerHTML = `
        <div class="preview"><canvas width="240" height="240"></canvas></div>
        <h4>${escapeHtml(item.name)}</h4>
        <div class="meta">${item.type}</div>
      `;
      previews.push({ canvas: card.querySelector('canvas'), item });
      grid.appendChild(card);
    });
    requestAnimationFrame(animate);
  }
  function animate() {
    previews.forEach((p) => window.OrbitalPreview.render(p.canvas, p.item));
    if (previews.length) requestAnimationFrame(animate);
  }

  function renderEquip() {
    const skinSel = document.getElementById('equip-skin');
    const trailSel = document.getElementById('equip-trail');
    const badgeSel = document.getElementById('equip-badge');

    const skins = ['default', ...owned.filter((id) => catalog.find((c) => c.id === id)?.type === 'skin')];
    if (user.is_vip) skins.push('skin-vip-nebula');
    const trails = ['none', ...owned.filter((id) => catalog.find((c) => c.id === id)?.type === 'trail')];
    const badges = ['none', ...owned.filter((id) => catalog.find((c) => c.id === id)?.type === 'badge')];
    if (user.is_vip) badges.push('crown-gold');

    skinSel.innerHTML = skins.map((id) => `<option value="${id}" ${id === user.selected_skin ? 'selected' : ''}>${labelFor(id)}</option>`).join('');
    trailSel.innerHTML = trails.map((id) => `<option value="${id}" ${id === user.selected_trail ? 'selected' : ''}>${labelFor(id)}</option>`).join('');
    badgeSel.innerHTML = badges.map((id) => `<option value="${id}" ${id === user.selected_badge ? 'selected' : ''}>${labelFor(id)}</option>`).join('');

    document.getElementById('save-equip').addEventListener('click', async () => {
      const status = document.getElementById('equip-status');
      status.textContent = '';
      try {
        await window.Auth.api('/api/auth/equip', {
          method: 'POST',
          body: JSON.stringify({
            skin: skinSel.value,
            trail: trailSel.value,
            badge: badgeSel.value,
          }),
        });
        status.className = 'success'; status.textContent = '✓ Saved.';
      } catch (e) {
        status.className = 'error'; status.textContent = e.message || 'Save failed.';
      }
    });
  }

  function labelFor(id) {
    if (id === 'default') return 'Default orb';
    if (id === 'none') return 'None';
    return catalog.find((c) => c.id === id)?.name || id;
  }

  function setupTabs() {
    document.querySelectorAll('.tab').forEach((t) => {
      t.addEventListener('click', () => {
        document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
        t.classList.add('active');
        const which = t.dataset.tab;
        document.getElementById('tab-inventory').style.display = which === 'inventory' ? '' : 'none';
        document.getElementById('tab-equipped').style.display = which === 'equipped' ? '' : 'none';
      });
    });
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  document.addEventListener('DOMContentLoaded', () => {
    setupTabs();
    load();
  });
})();
