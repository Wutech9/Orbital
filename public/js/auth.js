(function () {
  'use strict';

  const TOKEN_KEY = 'orbital_token';
  const USER_KEY = 'orbital_user';

  const Auth = {
    getToken() { return localStorage.getItem(TOKEN_KEY); },
    getUser() {
      try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); }
      catch { return null; }
    },
    setSession(token, user) {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      Auth.applyVipClass(user);
    },
    clear() {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(USER_KEY);
      document.body.classList.remove('is-vip');
    },
    applyVipClass(user) {
      if (user && (user.is_vip || user.isVip)) document.body.classList.add('is-vip');
      else document.body.classList.remove('is-vip');
    },

    async fetchMe() {
      const token = Auth.getToken();
      if (!token) return null;
      try {
        const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
        if (!res.ok) {
          if (res.status === 401) Auth.clear();
          return null;
        }
        const data = await res.json();
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        Auth.applyVipClass(data.user);
        return data;
      } catch {
        return null;
      }
    },

    async api(path, opts = {}) {
      const token = Auth.getToken();
      const headers = Object.assign({}, opts.headers || {});
      if (token) headers.Authorization = `Bearer ${token}`;
      if (opts.body && !(opts.body instanceof FormData) && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(path, Object.assign({}, opts, { headers }));
      const ct = res.headers.get('content-type') || '';
      const data = ct.includes('json') ? await res.json() : await res.text();
      if (!res.ok) {
        const err = new Error((data && data.error) || res.statusText);
        err.status = res.status;
        err.data = data;
        throw err;
      }
      return data;
    },

    renderNav() {
      const user = Auth.getUser();
      const navLogin = document.getElementById('nav-login');
      const navRegister = document.getElementById('nav-register');
      if (!navLogin) return;

      const navLinks = navLogin.parentElement;
      // remove any previous account chip we inserted
      const existing = navLinks.querySelector('[data-account]');
      if (existing) existing.remove();

      if (user) {
        navLogin.style.display = 'none';
        if (navRegister) navRegister.style.display = 'none';
        const chip = document.createElement('span');
        chip.setAttribute('data-account', '1');
        chip.style.marginLeft = '14px';
        chip.style.color = 'var(--text)';
        chip.style.fontSize = '14px';
        chip.innerHTML = '';
        if (user.is_vip) {
          const b = document.createElement('span');
          b.className = 'vip-badge';
          b.textContent = '★ VIP';
          chip.appendChild(b);
        }
        const name = document.createElement('a');
        name.href = '/profile.html';
        name.textContent = user.username;
        name.style.color = 'var(--text)';
        chip.appendChild(name);
        const out = document.createElement('a');
        out.href = '#';
        out.textContent = 'Logout';
        out.style.marginLeft = '12px';
        out.style.color = 'var(--muted)';
        out.addEventListener('click', (e) => { e.preventDefault(); Auth.clear(); location.reload(); });
        chip.appendChild(out);
        navLinks.appendChild(chip);
      } else {
        navLogin.style.display = '';
        if (navRegister) navRegister.style.display = '';
      }
    },
  };

  window.Auth = Auth;

  // On every page load: apply VIP class from cache, then refresh from server.
  Auth.applyVipClass(Auth.getUser());
  document.addEventListener('DOMContentLoaded', () => {
    Auth.renderNav();
    Auth.fetchMe().then(() => Auth.renderNav());
  });
})();
