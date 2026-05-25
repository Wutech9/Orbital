(function () {
  'use strict';

  /** Renders a small preview of an orb wearing the given cosmetic. */
  function renderPreview(canvas, item) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    const cx = w / 2, cy = h / 2;
    const r = Math.min(w, h) * 0.3;
    ctx.clearRect(0, 0, w, h);

    // base orb
    let fill = '#7c5cff', glow = '#5b21b6';
    if (item.type === 'skin') {
      if (item.id === 'skin-prism') { const t = (Date.now() / 20) % 360; fill = `hsl(${t},90%,60%)`; glow = `hsl(${(t+60)%360},90%,50%)`; }
      else if (item.id === 'skin-vip-nebula') { fill = '#a78bfa'; glow = '#7c3aed'; }
      else if (item.color && item.color.startsWith('#')) { fill = item.color; glow = item.color; }
    }

    if (item.type === 'trail') {
      ctx.save(); ctx.globalAlpha = 0.4;
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.5, 0, Math.PI * 2);
      ctx.fillStyle = item.color || '#fff';
      ctx.filter = 'blur(8px)'; ctx.fill();
      ctx.restore();
    }

    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.shadowBlur = 18; ctx.shadowColor = glow;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.lineWidth = 2; ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.stroke();

    if (item.type === 'badge') {
      if (item.id === 'crown-gold') {
        const x = cx, y = cy - r - 10, s = r * 0.6;
        ctx.fillStyle = '#FBBF24';
        ctx.beginPath();
        ctx.moveTo(x - s, y + s); ctx.lineTo(x - s, y);
        ctx.lineTo(x - s/2, y + s/2); ctx.lineTo(x, y - s/2);
        ctx.lineTo(x + s/2, y + s/2); ctx.lineTo(x + s, y);
        ctx.lineTo(x + s, y + s); ctx.closePath(); ctx.fill();
      } else {
        ctx.beginPath(); ctx.arc(cx + r * 0.8, cy - r * 0.8, 7, 0, Math.PI * 2);
        ctx.fillStyle = item.color || '#888'; ctx.fill();
      }
    }

    if (item.type === 'hat') {
      if (item.id === 'hat-tophat') {
        ctx.fillStyle = '#111827';
        ctx.fillRect(cx - r * 0.5, cy - r - 4, r, r * 0.18);
        ctx.fillRect(cx - r * 0.3, cy - r - r * 0.7, r * 0.6, r * 0.6);
      } else if (item.id === 'hat-halo') {
        ctx.strokeStyle = '#FDE68A';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(cx, cy - r - 4, r * 0.7, r * 0.2, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  window.OrbitalPreview = { render: renderPreview };
})();
