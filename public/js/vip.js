(function () {
  'use strict';

  async function init() {
    const me = await window.Auth.fetchMe();
    const status = document.getElementById('vip-status');
    const subBtn = document.getElementById('subscribe-btn');
    const portalBtn = document.getElementById('portal-btn');
    const err = document.getElementById('vip-error');

    if (!me) {
      status.innerHTML = `<a href="/login.html">Log in</a> or <a href="/register.html">create an account</a> to subscribe.`;
      subBtn.disabled = true;
      return;
    }
    if (me.user.is_vip) {
      status.innerHTML = `<span class="vip-badge">★ VIP active</span> Thanks for supporting Orbital!`;
      subBtn.style.display = 'none';
      portalBtn.style.display = '';
    }

    subBtn.addEventListener('click', async () => {
      err.textContent = '';
      try {
        const data = await window.Auth.api('/api/stripe/checkout/vip', { method: 'POST' });
        if (data.url) location.href = data.url;
      } catch (e) {
        err.textContent = e.message || 'Could not start checkout.';
      }
    });
    portalBtn.addEventListener('click', async () => {
      err.textContent = '';
      try {
        const data = await window.Auth.api('/api/stripe/portal', { method: 'POST' });
        if (data.url) location.href = data.url;
      } catch (e) {
        err.textContent = e.message || 'Could not open portal.';
      }
    });

    const params = new URLSearchParams(location.search);
    if (params.get('vip') === 'success') {
      err.style.color = 'var(--green)';
      err.textContent = '✓ Subscription started! Benefits unlock once the webhook completes.';
      setTimeout(() => location.reload(), 2500);
    } else if (params.get('vip') === 'cancelled') {
      err.textContent = 'Subscription cancelled.';
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
