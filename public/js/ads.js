(function () {
  'use strict';

  const CONSENT_KEY = 'orbital_consent_v1';
  let publisherId = null;

  function getConsent() { return localStorage.getItem(CONSENT_KEY); }
  function setConsent(v) { localStorage.setItem(CONSENT_KEY, v); }

  function showBanner() {
    const banner = document.getElementById('gdpr-banner');
    if (!banner) return;
    banner.classList.add('show');
    document.getElementById('gdpr-accept')?.addEventListener('click', () => {
      setConsent('accepted');
      banner.classList.remove('show');
      loadAdSense(true);
    });
    document.getElementById('gdpr-reject')?.addEventListener('click', () => {
      setConsent('rejected');
      banner.classList.remove('show');
      // Still load AdSense with non-personalised ads.
      loadAdSense(false);
    });
  }

  function loadAdSense(personalized) {
    if (!publisherId || publisherId.includes('XXXX')) {
      // Not configured yet — leave placeholder visible
      console.info('[ads] AdSense publisher ID not configured; skipping ad load.');
      return;
    }

    // VIPs see no ads at all.
    const user = window.Auth?.getUser?.();
    if (user && (user.is_vip || user.isVip)) return;

    // Set up non-personalised request signal if user rejected consent.
    if (!personalized) {
      window.adsbygoogle = window.adsbygoogle || [];
      window.adsbygoogle.requestNonPersonalizedAds = 1;
    }

    const script = document.createElement('script');
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
    document.head.appendChild(script);

    // Push each <ins.adsbygoogle> on the page
    script.onload = () => {
      document.querySelectorAll('ins.adsbygoogle').forEach(() => {
        try { (window.adsbygoogle = window.adsbygoogle || []).push({}); }
        catch (e) { /* swallow */ }
      });
    };
  }

  async function init() {
    try {
      const res = await fetch('/api/config');
      const cfg = await res.json();
      publisherId = cfg.adsensePublisherId || '';
    } catch (e) { /* network error — just leave placeholders */ }

    const consent = getConsent();
    if (!consent) {
      showBanner();
    } else if (consent === 'accepted') {
      loadAdSense(true);
    } else {
      loadAdSense(false);
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
