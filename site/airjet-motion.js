/* Presentation-only motion. Original charts, arithmetic and copy remain untouched. */
(() => {
  'use strict';
  const hero = document.getElementById('top');
  const stage = hero && hero.querySelector('.hero-stage');
  if (!stage) return;
  const title = stage.querySelector('.hero-title');
  const ocean = stage.querySelector('.hero-ocean');
  const poster = stage.querySelector('.aircraft-poster');
  const aircraftCanvas = stage.querySelector('#aircraft-canvas');
  const sequences = { desktop: [/*__AIRCRAFT_FRAMES__*/], mobile: [/*__MOBILE_FRAMES__*/] };
  let activeFormat = stage.clientWidth <= 600 ? 'mobile' : 'desktop';
  let frameSources = sequences[activeFormat];
  const frameImages = [];
  let fallbackActive = false;
  let displayedFrame = -1;
  const track = stage.querySelector('.flight-scroll-track i');
  const intro = stage.querySelector('.hero-intro');
  const kicker = stage.querySelector('.hero-kicker');
  const cue = stage.querySelector('.cue');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const clamp = x => Math.min(1, Math.max(0, x));
  let queued = false;

  function prepareFallback() {
    if (!poster || fallbackActive || (aircraftCanvas && aircraftCanvas.dataset.webglReady === 'true')) return;
    fallbackActive = true;
    stage.dataset.renderEngine = 'render-sequence';
    frameSources.forEach((src, index) => {
      const image = new Image();
      image.decoding = 'async';
      image.onload = requestUpdate;
      image.src = src;
      frameImages[index] = image;
    });
  }
  function updateAircraftFallback(p) {
    if (!fallbackActive || !poster) return;
    const frame = Math.floor(p * (frameSources.length - 1));
    if (frame !== displayedFrame && (frame === 0 || frameImages[frame]?.complete)) {
      poster.style.backgroundImage = frame === 0 ? '' : `url('${frameSources[frame]}')`;
      displayedFrame = frame;
      poster.dataset.frame = String(frame);
    }
    const aspect = activeFormat === 'mobile' ? 520 / 1125 : 1.44;
    const imageWidth = Math.max(stage.clientWidth, stage.clientHeight * aspect);
    const imageHeight = imageWidth / aspect;
    const delta = p - Math.max(0, displayedFrame) / (frameSources.length - 1);
    // Translation between adjacent rendered angles keeps scroll movement continuous.
    const dx = delta * .28 * imageWidth;
    const dy = -delta * .34 * imageHeight;
    poster.style.transform = `translate3d(${dx.toFixed(2)}px,${dy.toFixed(2)}px,0)`;
  }

  function fitTitle() {
    if (!title) return;
    const width = title.clientWidth;
    title.querySelectorAll('span').forEach(line => {
      line.style.fontSize = '100px';
      const measured = line.getBoundingClientRect().width;
      const size = Math.min(width / Math.max(1, measured) * 100, stage.clientHeight * .26);
      line.style.fontSize = size.toFixed(2) + 'px';
    });
  }
  function update() {
    queued = false;
    const top = hero.getBoundingClientRect().top;
    const travel = Math.max(1, hero.offsetHeight - stage.offsetHeight);
    const p = reduced.matches ? 0 : clamp(-top / travel);
    const eased = p * p * (3 - 2 * p);
    if (ocean) ocean.style.transform = `translate3d(0,${(eased * stage.offsetHeight * .065).toFixed(1)}px,0) scale(${(1.02 + p * .035).toFixed(4)})`;
    updateAircraftFallback(p);
    if (title) title.style.transform = `translate3d(0,${(-eased * stage.offsetHeight * .16).toFixed(1)}px,0)`;
    if (intro) intro.style.opacity = String(1 - clamp((p - .18) / .56));
    if (kicker) kicker.style.opacity = String(1 - clamp(p / .64));
    if (cue) cue.style.opacity = String(.95 * (1 - clamp(p / .46)));
    if (track) track.style.transform = `scaleX(${Math.max(.03, p).toFixed(4)})`;
    stage.setAttribute('data-scroll-progress', p.toFixed(3));
  }
  function requestUpdate() {
    if (!queued) { queued = true; requestAnimationFrame(update); }
  }
  function resize() {
    const nextFormat = stage.clientWidth <= 600 ? 'mobile' : 'desktop';
    if (nextFormat !== activeFormat) {
      activeFormat = nextFormat;
      frameSources = sequences[activeFormat];
      frameImages.length = 0;
      displayedFrame = -1;
      fallbackActive = false;
      prepareFallback();
    }
    fitTitle();
    requestUpdate();
  }
  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', resize, { passive: true });
  reduced.addEventListener('change', resize);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(resize);
  if (aircraftCanvas) aircraftCanvas.addEventListener('webglcontextlost', () => { prepareFallback(); requestUpdate(); });
  prepareFallback();
  if (!fallbackActive) stage.dataset.renderEngine = 'native-webgl';
  resize();

  if (!reduced.matches && 'IntersectionObserver' in window) {
    document.documentElement.classList.add('motion-enabled');
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('motion-pending');
        entry.target.classList.add('motion-entered');
        observer.unobserve(entry.target);
      });
    }, { threshold: .12, rootMargin: '0px 0px -6% 0px' });
    document.querySelectorAll('.ch-head, .key h2').forEach(el => {
      el.classList.add('motion-pending');
      observer.observe(el);
    });
  }
})();
