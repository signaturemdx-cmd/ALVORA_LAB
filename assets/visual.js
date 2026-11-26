/* ============================================================================
   ALVORA LAB — visual layer (progressive enhancement, CDN only, no build)
   1) Vanta.js CELLS behind the passcode gate, destroyed on unlock
   2) Lenis smooth scrolling (after unlock) + CountUp.js numbers
   3) img-comparison-slider (schematic comparison)
   4) 3Dmol.js viewer for a public PDB entry (loaded near the viewport)
   Every feature fails silently back to the page's own static markup.
   ========================================================================== */
(function () {
  'use strict';

  var docEl = document.documentElement;
  var reduce = false;
  try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var CDN = {
    three:   'https://cdn.jsdelivr.net/npm/three@0.134.0/build/three.min.js',
    vanta:   'https://cdn.jsdelivr.net/npm/vanta@0.5.24/dist/vanta.cells.min.js',
    lenis:   'https://cdn.jsdelivr.net/npm/lenis@1.1.18/dist/lenis.min.js',
    countup: 'https://cdn.jsdelivr.net/npm/countup.js@2.8.0/dist/countUp.umd.js',
    mol3d:   'https://cdn.jsdelivr.net/npm/3dmol@2.4.2/build/3Dmol-min.js',
    slider:  'https://cdn.jsdelivr.net/npm/img-comparison-slider@8/dist/index.min.js'
  };

  var loading = {};
  function load(src) {
    if (loading[src]) return loading[src];
    loading[src] = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('load failed: ' + src)); };
      document.head.appendChild(s);
    });
    return loading[src];
  }

  function gateEl() { return document.getElementById('access-gate'); }
  function isEn() { return (docEl.getAttribute('lang') || '').toLowerCase().indexOf('en') === 0; }

  /* run fn once the passcode gate has left the document (or right away on a page without one) */
  function whenGateGone(fn) {
    if (!gateEl()) { setTimeout(fn, 260); return; }
    var mo = new MutationObserver(function () {
      if (!gateEl()) { mo.disconnect(); setTimeout(fn, 560); }
    });
    mo.observe(document.body, { childList: true });
  }

  /* ------------------------------------------------------------------ 1 */
  function webglOK() {
    try {
      var c = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl')));
    } catch (e) { return false; }
  }

  function initGateVanta() {
    var gate = gateEl();
    if (!gate || reduce || gate.querySelector('.ag-webgl') || !webglOK()) return;

    var layer = document.createElement('div');
    layer.className = 'ag-webgl';
    layer.setAttribute('aria-hidden', 'true');
    gate.insertBefore(layer, gate.firstChild);

    var effect = null, dead = false;
    function dispose() {
      if (dead) return;
      dead = true;
      try { if (effect && typeof effect.destroy === 'function') effect.destroy(); } catch (e) {}
      effect = null;
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }

    var mo = new MutationObserver(function () {
      if (!document.body.contains(gate)) { dispose(); mo.disconnect(); }
    });
    mo.observe(document.body, { childList: true });

    load(CDN.three)
      .then(function () { return load(CDN.vanta); })
      .then(function () {
        if (dead || !document.body.contains(gate)) return;
        if (!window.VANTA || typeof window.VANTA.CELLS !== 'function') return;
        effect = window.VANTA.CELLS({
          el: layer,
          color1: 0x162c20,          /* deep forest */
          color2: 0x2b5440,         /* lighter green rings */
          backgroundColor: 0x09140e, /* the plan's darkest tone */
          size: 2.5,
          speed: 0.85,
          scale: 1.0,
          scaleMobile: 2.8
        });
        requestAnimationFrame(function () { layer.classList.add('is-on'); });
      })
      .catch(function () { dispose(); });
  }

  /* ------------------------------------------------------------------ 2a */
  function initLenis() {
    if (reduce || window.__alvoraLenis) return;
    load(CDN.lenis).then(function () {
      var L = window.Lenis;
      if (typeof L !== 'function') return;

      var lenis = new L({
        duration: 1.15,
        smoothWheel: true,
        wheelMultiplier: 1,
        touchMultiplier: 1.5,
        easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }
      });
      window.__alvoraLenis = lenis;

      var raf = function (time) { lenis.raf(time); requestAnimationFrame(raf); };
      requestAnimationFrame(raf);

      function headerOffset() {
        var h = document.getElementById('siteHeader');
        return h ? h.getBoundingClientRect().height + 6 : 0;
      }

      /* in-page anchors glide instead of jumping; the page's own handlers still run */
      document.addEventListener('click', function (e) {
        var a = e.target && e.target.closest ? e.target.closest('a[href^="#"]') : null;
        if (!a) return;
        var href = a.getAttribute('href') || '';
        if (href.length < 2) return;
        var el = null;
        try { el = document.getElementById(href.slice(1)); } catch (err) { return; }
        if (!el) return;
        e.preventDefault();
        lenis.scrollTo(el, { offset: -headerOffset(), duration: 1.15 });
        try { history.replaceState(null, '', href); } catch (err) {}
      }, false);

      /* the mobile menu locks body scrolling: pause the smooth scroller with it */
      try {
        new MutationObserver(function () {
          if (docEl.classList.contains('menu-open')) lenis.stop();
          else lenis.start();
        }).observe(docEl, { attributes: true, attributeFilter: ['class'] });
      } catch (e) {}
    }).catch(function () {});
  }

  /* ------------------------------------------------------------------ 2b */
  function initCountUp() {
    var els = Array.prototype.slice.call(document.querySelectorAll('[data-cu]'));
    if (!els.length || reduce) return;

    load(CDN.countup).then(function () {
      var api = window.countUp || window.CountUp;
      var C = api && (api.CountUp || api);
      if (typeof C !== 'function') return;

      els.forEach(function (el) {
        var raw = el.getAttribute('data-cu') || '';
        var end = parseFloat(raw);
        if (isNaN(end)) return;
        var dec = (raw.split('.')[1] || '').length;
        var started = false;

        var io = new IntersectionObserver(function (entries) {
          entries.forEach(function (en) {
            if (!en.isIntersecting || started) return;
            started = true;
            io.disconnect();
            var c = new C(el, end, {
              duration: 1.9,
              decimalPlaces: dec,
              useGrouping: false,
              useEasing: true
            });
            if (!c.error) c.start();
            else el.textContent = raw;
          });
        }, { threshold: 0.5 });
        io.observe(el);
      });
    }).catch(function () {});
  }

  /* ------------------------------------------------------------------ 3 */
  function initSlider() {
    if (!document.querySelector('img-comparison-slider')) return;
    load(CDN.slider).then(function () {
      var el = document.querySelector('img-comparison-slider');
      if (el && !el.hasAttribute('value')) el.setAttribute('value', '50');
    }).catch(function () {});
  }

  /* ------------------------------------------------------------------ 4 */
  function setupMol3D(host) {
    var stage = host.parentNode;
    var msg = stage ? stage.querySelector('.mol3d-load') : null;
    var spinBtn = document.getElementById('molSpin');
    var resetBtn = document.getElementById('molReset');
    var pdb = host.getAttribute('data-pdb') || '1HFC';
    var src = 'https://files.rcsb.org/download/' + pdb + '.pdb';
    var viewer = null;
    var spinning = true;
    var booted = false;

    function fail() {
      if (!msg) return;
      var ko = msg.getAttribute('data-fail-ko') || '3D 구조를 불러오지 못했습니다.';
      var en = msg.getAttribute('data-fail-en') || 'Could not load the 3D structure.';
      msg.setAttribute('data-ko', ko);
      msg.setAttribute('data-en', en);
      msg.textContent = isEn() ? en : ko;
    }

    function fetchPdb() {
      if (!window.fetch) return Promise.reject(new Error('no fetch'));
      return fetch(src).then(function (r) {
        if (!r.ok) throw new Error('PDB ' + r.status);
        return r.text();
      });
    }

    function boot() {
      if (booted) return;
      booted = true;
      Promise.all([load(CDN.mol3d), fetchPdb()]).then(function (res) {
        var text = res[1];
        var M = window.$3Dmol || window['3Dmol'];
        if (!M || typeof M.createViewer !== 'function') throw new Error('3Dmol unavailable');

        viewer = M.createViewer(host, { backgroundColor: '#0b1712', backgroundAlpha: 0, antialias: true });
        viewer.addModel(text, 'pdb');
        viewer.setStyle({}, { cartoon: { color: '#c2a268', opacity: 0.96 } });
        viewer.setStyle({ resn: ['ZN', 'CA'] }, { sphere: { scale: 0.5, color: '#7FA893' } });
        viewer.setStyle({ resn: 'PLH' }, { stick: { color: '#E4D3AC', radius: 0.22 } });
        var tight = host.clientWidth > 0 && host.clientWidth < 560;
        viewer.zoomTo();
        viewer.zoom(tight ? 1.0 : 1.3, 600);
        if (spinning && !reduce) viewer.spin('y', 0.55);
        viewer.render();
        if (msg) msg.classList.add('is-off');
      }).catch(function () { fail(); });
    }

    if (spinBtn) {
      spinBtn.addEventListener('click', function () {
        spinning = !spinning;
        spinBtn.setAttribute('aria-pressed', spinning ? 'true' : 'false');
        if (viewer) {
          if (spinning && !reduce) viewer.spin('y', 0.55);
          else viewer.spin(false);
          viewer.render();
        }
      });
    }
    if (resetBtn) {
      resetBtn.addEventListener('click', function () {
        if (!viewer) return;
        viewer.spin(false);
        var tight = host.clientWidth > 0 && host.clientWidth < 560;
        viewer.zoomTo();
        viewer.zoom(tight ? 1.0 : 1.3, 420);
        viewer.render();
        if (spinning && !reduce) setTimeout(function () { if (viewer && spinning) viewer.spin('y', 0.55); }, 460);
      });
    }

    try {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { io.disconnect(); boot(); }
        });
      }, { rootMargin: '320px 0px' });
      io.observe(host);
    } catch (e) { boot(); }

    var rt = null;
    window.addEventListener('resize', function () {
      clearTimeout(rt);
      rt = setTimeout(function () { if (viewer) { try { viewer.resize(); viewer.render(); } catch (e) {} } }, 220);
    }, { passive: true });
  }

  function initMol3D() {
    Array.prototype.slice.call(document.querySelectorAll('[data-mol3d]')).forEach(setupMol3D);
  }

  /* ------------------------------------------------------------------ */
  function boot() {
    initGateVanta();
    initSlider();
    initMol3D();
    whenGateGone(function () {
      initLenis();
      initCountUp();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
