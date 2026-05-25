(function () {
  'use strict';

  let selectedRoomId = 'us-east';

  async function loadRooms() {
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      const list = document.getElementById('rooms-list');
      list.innerHTML = '';
      const user = window.Auth?.getUser?.();
      const isVip = !!(user && (user.is_vip || user.isVip));

      data.rooms.forEach((r) => {
        const div = document.createElement('div');
        div.className = 'room' + (r.id === selectedRoomId ? ' selected' : '');
        div.dataset.id = r.id;
        const locked = r.vipOnly && !isVip;
        if (locked) {
          div.style.opacity = '0.5';
          div.style.cursor = 'not-allowed';
        }
        div.innerHTML = `
          <div>
            <div>${escapeHtml(r.name)}</div>
            ${r.vipOnly ? '<div class="vip-only">★ VIP only</div>' : ''}
          </div>
          <div class="meta">${r.players} player${r.players === 1 ? '' : 's'}</div>
        `;
        if (!locked) {
          div.addEventListener('click', () => {
            selectedRoomId = r.id;
            list.querySelectorAll('.room').forEach((el) => el.classList.toggle('selected', el.dataset.id === r.id));
          });
        }
        list.appendChild(div);
      });
    } catch (e) {
      console.error('rooms', e);
    }
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  async function loadGlobalLeaderboard() {
    // Show first room's leaderboard as a sample
    try {
      const res = await fetch('/api/rooms');
      const data = await res.json();
      // (live leaderboards happen in-game; on the lobby we just render the room list)
      // For something visible, fall back to a static "Top scorers coming soon".
      const ol = document.getElementById('global-leaderboard');
      if (!ol) return;
      if (!data.rooms.length) {
        ol.innerHTML = '<li>—</li>';
        return;
      }
      ol.innerHTML = `<li style="color: var(--muted);">Join a server to see live rankings →</li>`;
    } catch {}
  }

  function play() {
    const nick = document.getElementById('nickname').value.trim();
    const params = new URLSearchParams({ room: selectedRoomId });
    if (nick) params.set('name', nick);
    location.href = `/game.html?${params.toString()}`;
  }

  function joinByCode() {
    const code = document.getElementById('room-code').value.trim().toUpperCase();
    if (!/^[A-Z0-9]{4,8}$/.test(code)) {
      document.getElementById('play-error').textContent = 'Room codes are 4–8 letters/digits.';
      return;
    }
    const nick = document.getElementById('nickname').value.trim();
    const params = new URLSearchParams({ code });
    if (nick) params.set('name', nick);
    location.href = `/game.html?${params.toString()}`;
  }

  document.addEventListener('DOMContentLoaded', () => {
    loadRooms();
    loadGlobalLeaderboard();
    document.getElementById('play-btn')?.addEventListener('click', play);
    document.getElementById('join-code-btn')?.addEventListener('click', joinByCode);
    document.getElementById('nickname')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') play();
    });
    // Refresh room counts every 4s while on lobby
    setInterval(loadRooms, 4000);
  });
})();
