/* ============================================================
   Grape AI — Deck navigation + interactions
   ============================================================ */

(function () {
  'use strict';

  const deck = document.getElementById('deck');
  const slides = Array.from(document.querySelectorAll('.slide'));
  const audButtons = Array.from(document.querySelectorAll('.aud-btn'));
  const counterCurrent = document.getElementById('counter-current');
  const counterTotal = document.getElementById('counter-total');
  const progressBar = document.getElementById('progress-bar');

  let currentAudience = 'all';
  let visibleSlides = slides;

  /* ---------- Audience filter ---------- */
  function applyAudience(audience) {
    currentAudience = audience;

    visibleSlides = slides.filter(s => {
      const slideAud = s.dataset.audience || 'all';
      const slideTags = (s.dataset.tags || '').split(',').map(t => t.trim()).filter(Boolean);

      if (audience === 'all') return true;
      if (slideAud === 'all') return true;
      if (slideAud === audience) return true;
      if (slideTags.includes(audience)) return true;
      return false;
    });

    slides.forEach(s => {
      s.classList.toggle('is-hidden', !visibleSlides.includes(s));
    });

    counterTotal.textContent = visibleSlides.length;
    audButtons.forEach(b => b.classList.toggle('aud-btn--active', b.dataset.audience === audience));

    updateProgress();
  }

  audButtons.forEach(btn => {
    btn.addEventListener('click', () => applyAudience(btn.dataset.audience));
  });

  /* ---------- Progress + counter ---------- */
  function getCurrentSlideIndex() {
    const scrollY = window.scrollY + window.innerHeight / 2;
    let idx = 0;
    for (let i = 0; i < visibleSlides.length; i++) {
      const rect = visibleSlides[i].getBoundingClientRect();
      const top = rect.top + window.scrollY;
      if (top <= scrollY) idx = i;
      else break;
    }
    return idx;
  }

  function updateProgress() {
    const idx = getCurrentSlideIndex();
    const total = visibleSlides.length;
    const pct = total > 1 ? ((idx) / (total - 1)) * 100 : 0;
    progressBar.style.width = pct + '%';
    counterCurrent.textContent = idx + 1;
  }

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(() => { updateProgress(); ticking = false; });
      ticking = true;
    }
  }, { passive: true });

  /* ---------- Keyboard navigation ---------- */
  function goToSlide(idx) {
    if (idx < 0 || idx >= visibleSlides.length) return;
    visibleSlides[idx].scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    const idx = getCurrentSlideIndex();
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      e.preventDefault();
      goToSlide(idx + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp' || e.key === 'PageUp') {
      e.preventDefault();
      goToSlide(idx - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      goToSlide(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      goToSlide(visibleSlides.length - 1);
    }
  });

  /* ---------- URL hash deep-link ---------- */
  const url = new URL(window.location.href);
  const initialAud = url.searchParams.get('audience');
  if (initialAud && ['all', 'investor', 'partner', 'client'].includes(initialAud)) {
    applyAudience(initialAud);
  } else {
    applyAudience('all');
  }

  counterTotal.textContent = visibleSlides.length;
  updateProgress();

  /* ---------- IntersectionObserver: slide animations + counters + bars ---------- */
  const io = new IntersectionObserver((entries) => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        e.target.classList.add('is-visible');

        // Animate counters inside this slide
        e.target.querySelectorAll('[data-counter]').forEach(animateCounter);

        // Trigger market bars (set CSS var to target width)
        e.target.querySelectorAll('.market-bar-fill').forEach(bar => {
          const w = bar.style.width || getComputedStyle(bar).width;
          // Use inline style.width as the target — already set by HTML
          bar.style.setProperty('--target-width', bar.getAttribute('style')?.match(/width:\s*([^;]+)/)?.[1] || '0%');
        });
      }
    });
  }, { threshold: 0.15 });
  slides.forEach(s => io.observe(s));

  /* ---------- Animated counters ---------- */
  function animateCounter(el) {
    if (el.dataset.counted === '1') return;
    el.dataset.counted = '1';

    const target = parseFloat(el.dataset.counter);
    const decimals = parseInt(el.dataset.decimals || '0', 10);
    const prefix = el.dataset.prefix || '';
    const suffix = el.dataset.suffix || '';
    const duration = 1200;
    const start = performance.now();
    const startValue = 0;

    // Preserve any inner <span class="roi-unit">
    const innerSpan = el.querySelector('.roi-unit');

    function frame(t) {
      const elapsed = t - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      const value = startValue + (target - startValue) * eased;
      const formatted = formatNumber(value, decimals);
      el.textContent = prefix + formatted + suffix;
      if (innerSpan) el.appendChild(innerSpan);
      if (progress < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  function formatNumber(n, decimals) {
    if (decimals > 0) {
      return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    }
    return Math.round(n).toLocaleString('pt-BR');
  }

  /* ---------- Touch swipe navigation (mobile) ---------- */
  let touchStartY = null;
  let touchStartX = null;
  let touchStartTime = 0;
  const SWIPE_THRESHOLD = 60;     // min px to count as swipe
  const SWIPE_MAX_TIME = 600;     // ms — must be fast (rules out scroll-and-lift)
  const SWIPE_RATIO = 1.4;        // vertical/horizontal ratio for vertical swipe

  document.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    touchStartY = e.touches[0].clientY;
    touchStartX = e.touches[0].clientX;
    touchStartTime = Date.now();
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (touchStartY === null) return;
    const t = e.changedTouches[0];
    const dy = t.clientY - touchStartY;
    const dx = t.clientX - touchStartX;
    const elapsed = Date.now() - touchStartTime;
    touchStartY = null;

    if (elapsed > SWIPE_MAX_TIME) return;
    if (Math.abs(dy) < SWIPE_THRESHOLD) return;
    if (Math.abs(dy) < Math.abs(dx) * SWIPE_RATIO) return; // mostly horizontal — ignore

    // Don't intercept if user tapped a button/link/tooltip
    const tag = e.target.tagName.toLowerCase();
    if (['button', 'a', 'input', 'textarea'].includes(tag)) return;
    if (e.target.closest('.tooltip, .ba-toggle, .audience-switcher')) return;

    const idx = getCurrentSlideIndex();
    if (dy < 0) goToSlide(idx + 1);   // swipe up = next
    else goToSlide(idx - 1);           // swipe down = previous
  }, { passive: true });

  /* ---------- Tooltip tap-to-toggle (touch devices) ---------- */
  const isTouchDevice = window.matchMedia('(hover: none)').matches;
  document.querySelectorAll('.tooltip').forEach(t => {
    if (isTouchDevice) {
      t.setAttribute('tabindex', '0');
      t.addEventListener('click', (e) => {
        e.stopPropagation();
        document.querySelectorAll('.tooltip.is-active').forEach(other => {
          if (other !== t) other.classList.remove('is-active');
        });
        t.classList.toggle('is-active');
      });
    }
  });
  document.addEventListener('click', () => {
    document.querySelectorAll('.tooltip.is-active').forEach(t => t.classList.remove('is-active'));
  });

  /* ---------- Before/After toggle (slide 8) ---------- */
  document.querySelectorAll('.ba-toggle').forEach(toggle => {
    const buttons = toggle.querySelectorAll('.ba-btn');
    const parent = toggle.closest('.split, .container, section');
    if (!parent) return;

    buttons.forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.ba;
        buttons.forEach(b => b.classList.toggle('ba-btn--active', b === btn));
        parent.querySelectorAll('[data-ba-content]').forEach(content => {
          content.hidden = content.dataset.baContent !== target;
        });
      });
    });
  });

})();
