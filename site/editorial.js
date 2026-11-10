/* Reading progress and navigation. Analytical application remains unchanged. */
(function (global) {
  'use strict';
  if (typeof document === 'undefined') return;

  const progress = document.getElementById('reading-progress');
  const navigation = document.querySelector('.editorial-nav');
  const links = navigation ? Array.from(navigation.querySelectorAll('a[href^="#"]')) : [];
  const chapters = links.map(link => ({ link, section: document.getElementById(decodeURIComponent(link.hash.slice(1))) })).filter(item => item.section);
  if (!progress && !chapters.length) return;

  let requested = false;
  let currentNavigationItem = null;
  function updateReadingPosition() {
    requested = false;
    const scrollTop = global.scrollY || document.documentElement.scrollTop || 0;
    if (progress) {
      const distance = Math.max(0, document.documentElement.scrollHeight - global.innerHeight);
      const fraction = distance ? Math.max(0, Math.min(1, scrollTop / distance)) : 0;
      progress.style.transformOrigin = '0 50%';
      progress.style.transform = 'scaleX(' + fraction.toFixed(4) + ')';
      if (progress.getAttribute('role') === 'progressbar') progress.setAttribute('aria-valuenow', String(Math.round(fraction * 100)));
    }
    const readingLine = Math.min(220, global.innerHeight * .3);
    let current = null;
    chapters.forEach(item => {
      if (item.section.getBoundingClientRect().top <= readingLine) current = item;
    });
    if (current && current.link !== currentNavigationItem && navigation && navigation.scrollWidth > navigation.clientWidth + 2) {
      currentNavigationItem = current.link;
      const itemBounds = current.link.getBoundingClientRect();
      const navBounds = navigation.getBoundingClientRect();
      if (itemBounds.left < navBounds.left + 20 || itemBounds.right > navBounds.right - 20) {
        const left = navigation.scrollLeft + itemBounds.left - navBounds.left - navigation.clientWidth * .25;
        navigation.scrollTo({left: Math.max(0, left), behavior: global.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'});
      }
    }
    chapters.forEach(item => {
      const active = item === current;
      item.link.classList.toggle('is-current', active);
      if (active) item.link.setAttribute('aria-current', 'location');
      else item.link.removeAttribute('aria-current');
    });
  }
  function requestUpdate() {
    if (requested) return;
    requested = true;
    global.requestAnimationFrame(updateReadingPosition);
  }
  global.addEventListener('scroll', requestUpdate, { passive: true });
  global.addEventListener('resize', requestUpdate, { passive: true });
  global.addEventListener('load', requestUpdate, { once: true });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(requestUpdate);
  updateReadingPosition();
})(typeof window !== 'undefined' ? window : globalThis);
