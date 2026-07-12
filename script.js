/* ═══════════════════════════════════════════════════════════════
   script.js — Birthday Website for Sahasra
   
   SECTIONS:
   1.  INITIALIZATION — Lenis + GSAP plugins
   2.  PARALLAX STATE
   3.  MOUSE PARALLAX — RAF-based spring physics
   4.  PHOTO HOVER EFFECTS
   5.  HERO TEXT ENTRANCE
   6.  OPENING TRANSITION — Click to begin experience
   7.  CHAPTER ANIMATIONS — Scroll-triggered reveals
   8.  GALLERY LIGHTBOX
   9.  MUSIC PLAYER
   10. MEMORY FORM — Firebase integration
═══════════════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────────────
   1. INITIALIZATION
────────────────────────────────────────────────────────────── */

// Wait for GSAP and Lenis to be available via defer
window.addEventListener('DOMContentLoaded', function() {

// Register GSAP plugins
gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

// Stop scroll while on landing
document.documentElement.style.overflow = 'hidden';
document.body.style.overflow = 'hidden';

/* ──────────────────────────────────────────────────────────────
   2. PARALLAX STATE
────────────────────────────────────────────────────────────── */

// All photo card elements
const photos = Array.from(document.querySelectorAll('.photo-card'));
const landing = document.getElementById('landing');

// Mouse tracking state
let mouseX       = 0;   // Target normalized (-1 to 1)
let mouseY       = 0;
let curX         = 0;   // Smoothed current
let curY         = 0;

// Control flags
let isParallaxActive  = true;
let experienceStarted = false;

// Per-photo hover state (lerped independently each frame)
photos.forEach(photo => {
  photo._hoverTargetY  = 0;   // Hover vertical lift target
  photo._hoverCurY     = 0;   // Lerped current
  photo._scaleTarget   = 1;
  photo._scaleCur      = 1;
});

/* ──────────────────────────────────────────────────────────────
   3. MOUSE PARALLAX — Virtual camera shift, spring-based
   
   How it works:
   - On mousemove, we record the normalized mouse position (−1→+1)
   - Each frame we lerp curX/curY toward the target (spring feel)
   - The ENTIRE scene moves like a camera in the cursor direction
   - Photos closer to the viewport edge move MORE (depth layering)
   - When cursor is fully at an edge, the nearest photo's hidden
     portion becomes ~90–100% visible
────────────────────────────────────────────────────────────── */

// Linear interpolation helper
const lerp = (a, b, t) => a + (b - a) * t;

/**
 * Calculate per-photo how far it can travel before it's fully visible.
 * We read the computed CSS position (top/left/right/bottom) and measure
 * how much of the photo is initially outside the viewport.
 * That hidden distance is the maximum travel distance for full reveal.
 *
 * KEY FIX: each photo's _reveal* value is divided by that photo's speed
 * factor. Because the RAF loop applies:
 *   tx = -curX * photo._revealRight * speed
 * when curX = 1, tx = -1 * (hiddenRight / speed) * speed = -hiddenRight
 * This guarantees FULL reveal regardless of the speed multiplier.
 */
function computePhotoRevealRanges() {
  const W = window.innerWidth;
  const H = window.innerHeight;

  photos.forEach(photo => {
    const rect  = photo.getBoundingClientRect();
    const speed = parseFloat(photo.dataset.speed || '0.5');

    // How many px of each photo are hidden off each viewport edge at rest?
    const hiddenLeft   = Math.max(0, -rect.left);          // px hidden off left edge
    const hiddenRight  = Math.max(0, rect.right  - W);     // px hidden off right edge
    const hiddenTop    = Math.max(0, -rect.top);           // px hidden off top edge
    const hiddenBottom = Math.max(0, rect.bottom - H);     // px hidden off bottom edge

    // Divide by speed so that (revealRange × speed) == hiddenDistance.
    // At curX = ±1 the photo travels exactly its full hidden distance — full reveal.
    // A small 2px buffer is subtracted so the white border frame peeks in completely.
    const EDGE_BUFFER = 2; // px — lets the entire printed border become visible
    photo._revealRight  = hiddenRight  > 0 ? (hiddenRight  + EDGE_BUFFER) / speed : 0;
    photo._revealLeft   = hiddenLeft   > 0 ? (hiddenLeft   + EDGE_BUFFER) / speed : 0;
    photo._revealBottom = hiddenBottom > 0 ? (hiddenBottom + EDGE_BUFFER) / speed : 0;
    photo._revealTop    = hiddenTop    > 0 ? (hiddenTop    + EDGE_BUFFER) / speed : 0;
  });
}

// Compute initially (no GSAP transforms applied yet, so BoundingClientRect is pure CSS)
computePhotoRevealRanges();

// On resize: temporarily clear GSAP transforms before measuring, then restore
window.addEventListener('resize', () => {
  // Snap transforms to zero so measurements reflect pure CSS layout
  photos.forEach(p => gsap.set(p, { x: 0, y: 0 }));
  gsap.set('#hero-content', { x: 0, y: 0 });
  // Measure after browser has re-laid out
  requestAnimationFrame(() => {
    computePhotoRevealRanges();
    // Reset smoothed cursor so there's no jarring jump on resize
    curX = 0; curY = 0; mouseX = 0; mouseY = 0;
  });
});

landing.addEventListener('mousemove', e => {
  if (!isParallaxActive) return;
  mouseX = (e.clientX / window.innerWidth  - 0.5) * 2; // −1 to +1
  mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
});

// Reset when mouse leaves the landing
landing.addEventListener('mouseleave', () => {
  mouseX = 0;
  mouseY = 0;
});

// RAF animation loop — runs every frame while landing is active
function parallaxTick() {
  if (!isParallaxActive) return;

  // Smooth the mouse position — 0.055 gives a premium spring feel
  curX = lerp(curX, mouseX, 0.055);
  curY = lerp(curY, mouseY, 0.055);

  // Hero content drifts gently WITH the cursor (parallax foreground layer)
  // Small movement keeps text readable while feeling alive
  const heroDrift = 22;
  gsap.set('#hero-content', {
    x: curX * heroDrift,
    y: curY * heroDrift,
  });

  photos.forEach(photo => {
    const speed   = parseFloat(photo.dataset.speed  || '0.5');
    const baseRot = parseFloat(photo.dataset.rotate || '0');

    // ── Camera-shift translation ────────────────────────────────
    // curX > 0 → cursor on right → camera shifts right → left-side photos
    //   need to move RIGHT to stay in frame; right-side photos move further off.
    // But we want: cursor RIGHT → right-side photos come INTO view.
    // So: cursor RIGHT → scene shifts LEFT → tx is NEGATIVE for right-hidden photos.
    //
    // Each photo has its own maximum travel range based on how much is hidden.
    // The speed multiplier adds depth (faster = nearer to edges / more depth)

    let tx, ty;
    if (curX >= 0) {
      // Cursor on the right half: right-edge photos slide left into view
      tx = -curX * photo._revealRight * speed;
    } else {
      // Cursor on the left half: left-edge photos slide right into view
      tx = -curX * photo._revealLeft  * speed; // curX is negative, so this is positive
    }

    if (curY >= 0) {
      // Cursor on bottom half: bottom-edge photos slide up into view
      ty = -curY * photo._revealBottom * speed;
    } else {
      // Cursor on top half: top-edge photos slide down into view
      ty = -curY * photo._revealTop    * speed;
    }

    // Lerp hover offsets smoothly
    photo._hoverCurY = lerp(photo._hoverCurY, photo._hoverTargetY, 0.1);
    photo._scaleCur  = lerp(photo._scaleCur,  photo._scaleTarget,  0.1);

    // On hover, rotation softly straightens (feels "lifted")
    const hoverRotFactor = photo._hoverTargetY < 0 ? 0.3 : 1;
    const currentRot = baseRot * hoverRotFactor +
                       (baseRot * (1 - hoverRotFactor) * (1 - photo._scaleCur + 1));

    // Apply all transforms in one go (avoids layout thrashing)
    gsap.set(photo, {
      x:        tx,
      y:        ty + photo._hoverCurY,
      rotation: lerp(currentRot, baseRot * 0.25, Math.abs(photo._hoverCurY) / 18),
      scale:    photo._scaleCur,
    });
  });

  requestAnimationFrame(parallaxTick);
}

// Start the parallax loop
parallaxTick();

/* ──────────────────────────────────────────────────────────────
   4. PHOTO HOVER EFFECTS
   
   On hover: photo gently lifts, scale up, shadow deepens.
   The hover offset is lerped in the parallax loop above.
────────────────────────────────────────────────────────────── */
photos.forEach(photo => {
  photo.addEventListener('mouseenter', () => {
    photo._hoverTargetY = -18;
    photo._scaleTarget  = 1.05;
    // Shadow deepens via CSS transition
    photo.style.boxShadow = '0 48px 90px rgba(0,0,0,0.22), 0 12px 28px rgba(0,0,0,0.1)';
  });

  photo.addEventListener('mouseleave', () => {
    photo._hoverTargetY = 0;
    photo._scaleTarget  = 1;
    photo.style.boxShadow = '';  // Revert to CSS default
  });
});

/* ──────────────────────────────────────────────────────────────
   5. HERO TEXT ENTRANCE
   
   Elements fade + rise on page load.
   "Click anywhere to begin" appears after 4 seconds.
────────────────────────────────────────────────────────────── */
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Entrance animation for eyebrow, title, subtitle
gsap.fromTo(
  ['#hero-eyebrow', '#hero-title', '#hero-subtitle'],
  { opacity: 0, y: 28 },
  {
    opacity:  1,
    y:        0,
    duration: prefersReducedMotion ? 0.1 : 1.2,
    stagger:  0.18,
    ease:     'power3.out',
    delay:    0.4,
  }
);

// "Click anywhere to begin" — revealed after 4 seconds
const heroCta = document.getElementById('hero-cta');
setTimeout(() => {
  gsap.to(heroCta, {
    opacity:  1,
    y:        0,
    duration: prefersReducedMotion ? 0.1 : 0.9,
    ease:     'power2.out',
  });
}, 4000);

/* ──────────────────────────────────────────────────────────────
   6. OPENING TRANSITION
   
   When visitor clicks anywhere on the landing:
   1. A brief freeze moment (tiny pause)
   2. Hero text fades out
   3. All 8 photos gracefully gather toward screen center
   4. Photos overlap into a gentle pile (staggered)
   5. Landing overlay fades out — revealing the first chapter
   6. Scroll is enabled and chapter animations initialize
────────────────────────────────────────────────────────────── */

// Pile offsets — slight random spread so photos feel natural, not stacked perfectly
const PILE_OFFSETS = [
  { x: -22, y: -12, r: -3 },
  { x:  14, y: -22, r:  5 },
  { x:  26, y:   7, r: -6 },
  { x: -12, y:  18, r:  4 },
  { x:   6, y:  -6, r: -2 },
  { x: -20, y:  12, r:  6 },
  { x:  18, y: -18, r: -4 },
  { x:  -8, y:  22, r:  3 },
];

function startExperience() {
  if (experienceStarted) return;
  experienceStarted = true;

  // Stop parallax loop immediately
  isParallaxActive = false;

  // ── Pre-emptive snap disable ─────────────────────────────────
  // Disable scroll-snap BEFORE any animation runs. The snap engine fires
  // the instant overflow is restored and the snap container sees content
  // in the viewport. By turning it off here (before the GSAP timeline
  // even starts) it is already inactive when landing.style.display='none'.
  // We also guarantee scroll position is exactly 0.
  document.documentElement.style.scrollSnapType = 'none';
  window.scrollTo(0, 0);

  const cx = window.innerWidth  / 2;  // Screen center X
  const cy = window.innerHeight / 2;  // Screen center Y

  const tl = gsap.timeline({
    onComplete: () => {
      // Hide landing completely
      landing.style.display = 'none';

      // Enable scroll — scroll position is already 0, snap is already off,
      // so no snap-jump will occur when overflow is restored.
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';

      // Re-enable scroll-snap after two frames so the browser has settled
      // at scroll-position 0 with the new layout fully painted.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          document.documentElement.style.scrollSnapType = '';
          // Initialize chapter animations now that scroll is live
          ScrollTrigger.refresh();
          initChapterAnimations();
        });
      });
    }
  });

  // ── Step 1: Freeze moment + fade hero text ──────────────────
  tl.to(['#hero-eyebrow', '#hero-title', '#hero-subtitle', '#hero-cta'], {
    opacity:  0,
    y:        -18,
    duration: prefersReducedMotion ? 0.05 : 0.55,
    stagger:  0.07,
    ease:     'power2.in',
  });

  // ── Step 2: All photos glide toward center (gathering) ──────
  tl.add(() => {
    photos.forEach((photo, i) => {
      // Get photo's current screen-space center
      const rect       = photo.getBoundingClientRect();
      const photoCx    = rect.left + rect.width  / 2;
      const photoCy    = rect.top  + rect.height / 2;

      // How far to move to reach screen center (plus pile offset)
      const dx = cx - photoCx + PILE_OFFSETS[i].x;
      const dy = cy - photoCy + PILE_OFFSETS[i].y;

      // Current GSAP values (from parallax)
      const gx = gsap.getProperty(photo, 'x') || 0;
      const gy = gsap.getProperty(photo, 'y') || 0;

      gsap.to(photo, {
        x:        gx + dx,
        y:        gy + dy,
        rotation: PILE_OFFSETS[i].r,
        scale:    0.88,
        duration: prefersReducedMotion ? 0.1 : 1.35,
        delay:    i * 0.055,  // Staggered arrival — feels organic
        ease:     'power3.inOut',
      });
    });
  }, '-=0.15');

  // ── Step 3: Landing fades out ─────────────────────────────
  tl.to(landing, {
    opacity:  0,
    duration: prefersReducedMotion ? 0.1 : 0.9,
    ease:     'power2.in',
  }, `+=${prefersReducedMotion ? 0 : 1.1}`);
}

// Click anywhere on landing to begin
// Using mouseup instead of click prevents accidental form submissions
// and ensures the event doesn't propagate to any interactive child elements
landing.addEventListener('click', (e) => {
  // Prevent any default browser action (e.g., form submit, anchor nav)
  e.preventDefault();
  startExperience();
});

// Keyboard accessibility: Enter/Space also triggers
landing.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault(); // Prevents Space from scrolling the page
    startExperience();
  }
});
landing.setAttribute('tabindex', '0');
landing.setAttribute('role', 'button');
landing.setAttribute('aria-label', 'Click to begin the birthday experience');

/* ──────────────────────────────────────────────────────────────
   7. CHAPTER ANIMATIONS
   
   Called after landing hides. Uses GSAP ScrollTrigger.
   All elements are set invisible first (gsap.set),
   then animated to visible on scroll entry (gsap.to).
────────────────────────────────────────────────────────────── */
function initChapterAnimations() {

  // ── Animated chapter lines (CSS transition) ──────────────────
  document.querySelectorAll('.chapter-line').forEach(line => {
    ScrollTrigger.create({
      trigger:  line,
      start:    'top 88%',
      once:     true,
      onEnter:  () => line.classList.add('visible'),
    });
  });

  // ── CHAPTER 01 — Split layout ─────────────────────────────────
  const ch01TextChildren = document.querySelectorAll('#chapter-01 .chapter-text-side > *');
  const ch01Photo        = document.querySelector('#chapter-01 .chapter-photo-side');

  gsap.set(ch01TextChildren, { opacity: 0, x: -50 });
  gsap.set(ch01Photo,        { opacity: 0, x:  60 });

  ScrollTrigger.create({
    trigger: '#chapter-01',
    start:   'top 70%',
    once:    true,
    onEnter: () => {
      gsap.to(ch01TextChildren, {
        opacity: 1, x: 0,
        duration: 1.1, stagger: 0.14,
        ease: 'power3.out',
      });
      gsap.to(ch01Photo, {
        opacity: 1, x: 0,
        duration: 1.2, delay: 0.2,
        ease: 'power3.out',
      });
    },
  });

  // ── CHAPTER 02 — Full bleed photo ────────────────────────────
  // Ken Burns: slow infinite zoom on the background photo
  gsap.to('.fullbleed-photo', {
    scale:    1.07,
    duration: 22,
    ease:     'none',
    repeat:   -1,
    yoyo:     true,
  });

  const ch02TextChildren = document.querySelectorAll('#chapter-02 .fullbleed-text > *');
  gsap.set(ch02TextChildren, { opacity: 0, y: 40 });

  ScrollTrigger.create({
    trigger: '#chapter-02',
    start:   'top 65%',
    once:    true,
    onEnter: () => {
      gsap.to(ch02TextChildren, {
        opacity: 1, y: 0,
        duration: 1.2, stagger: 0.14,
        ease: 'power3.out',
      });
    },
  });

  // ── CHAPTER 03 — Editorial ────────────────────────────────────
  const ch03Photo = document.querySelector('#chapter-03 .editorial-photo');
  const ch03Text  = document.querySelectorAll('#chapter-03 .editorial-text > *');

  gsap.set(ch03Photo, { opacity: 0, x: -70 });
  gsap.set(ch03Text,  { opacity: 0, x:  50 });

  ScrollTrigger.create({
    trigger: '#chapter-03',
    start:   'top 70%',
    once:    true,
    onEnter: () => {
      gsap.to(ch03Photo, { opacity: 1, x: 0, duration: 1.4, ease: 'power3.out' });
      gsap.to(ch03Text,  { opacity: 1, x: 0, duration: 1.2, stagger: 0.13, delay: 0.25, ease: 'power3.out' });
    },
  });

  // ── CHAPTER 04 — Memory cards ────────────────────────────────
  const ch04Header = document.querySelectorAll('#chapter-04 .chapter-header > *');
  const ch04Cards  = document.querySelectorAll('#chapter-04 .memory-card');

  gsap.set(ch04Header, { opacity: 0, y: 30 });
  gsap.set(ch04Cards,  { opacity: 0, y: 48, scale: 0.97 });

  ScrollTrigger.create({
    trigger: '#chapter-04',
    start:   'top 72%',
    once:    true,
    onEnter: () => {
      gsap.to(ch04Header, {
        opacity: 1, y: 0,
        duration: 1, stagger: 0.14,
        ease: 'power3.out',
      });
    },
  });

  ScrollTrigger.create({
    trigger: '#cards-grid',
    start:   'top 80%',
    once:    true,
    onEnter: () => {
      gsap.to(ch04Cards, {
        opacity: 1, y: 0, scale: 1,
        duration: 0.7, stagger: 0.1,
        ease: 'back.out(1.3)',
      });
    },
  });

  // ── CHAPTER 05 — The Letter ───────────────────────────────────
  const ch05Meta = document.querySelectorAll('#chapter-05 .letter-container > *:not(.letter-body)');
  const letterPs = document.querySelectorAll('#chapter-05 .letter-p');

  gsap.set(ch05Meta,  { opacity: 0, y: 30 });
  gsap.set(letterPs,  { opacity: 0, y: 22 });

  ScrollTrigger.create({
    trigger: '#chapter-05',
    start:   'top 70%',
    once:    true,
    onEnter: () => {
      gsap.to(ch05Meta, {
        opacity: 1, y: 0,
        duration: 1, stagger: 0.15,
        ease: 'power3.out',
      });
    },
  });

  ScrollTrigger.create({
    trigger: '#letter-body',
    start:   'top 75%',
    once:    true,
    onEnter: () => {
      gsap.to(letterPs, {
        opacity: 1, y: 0,
        duration: 0.95, stagger: 0.28,
        ease: 'power3.out',
      });
    },
  });

  // Signature name typewriter effect
  // Fires when the signature scrolls into view
  const sigName = document.getElementById('signature-name');
  if (sigName) {
    const originalText = sigName.textContent.trim(); // "Nityasha"
    sigName.textContent = '';  // Clear for typewriter

    ScrollTrigger.create({
      trigger: sigName,
      start:   'top 90%',
      once:    true,
      onEnter: () => {
        let i = 0;
        // Wait for the paragraph stagger to finish first
        setTimeout(() => {
          const interval = setInterval(() => {
            sigName.textContent += originalText[i];
            i++;
            if (i >= originalText.length) clearInterval(interval);
          }, 75); // ms per character — adjust for speed
        }, 2200); // Delay after letter-body scroll trigger fires
      },
    });
  }

  // ── GALLERY items ─────────────────────────────────────────────
  const galleryItems = document.querySelectorAll('.gallery-item');
  gsap.set(galleryItems, { opacity: 0, y: 38 });

  ScrollTrigger.create({
    trigger: '#gallery',
    start:   'top 75%',
    once:    true,
    onEnter: () => {
      gsap.to(galleryItems, {
        opacity: 1, y: 0,
        duration: 0.75, stagger: 0.1,
        ease: 'power2.out',
      });
    },
  });

  // ── MEMORY SECTION ────────────────────────────────────────────
  const memoryTitle    = document.querySelectorAll('.memory-section-header > *');
  const addMemoryCard  = document.querySelector('.add-memory-card');

  gsap.set(memoryTitle,   { opacity: 0, y: 30 });
  gsap.set(addMemoryCard, { opacity: 0, y: 40 });

  ScrollTrigger.create({
    trigger: '#memory',
    start:   'top 78%',
    once:    true,
    onEnter: () => {
      gsap.to(memoryTitle, { opacity: 1, y: 0, duration: 1, stagger: 0.14, ease: 'power3.out' });
    },
  });

  ScrollTrigger.create({
    trigger: '.add-memory-card',
    start:   'top 85%',
    once:    true,
    onEnter: () => {
      gsap.to(addMemoryCard, { opacity: 1, y: 0, duration: 1, ease: 'power3.out' });
    },
  });
}

/* ──────────────────────────────────────────────────────────────
   8. GALLERY LIGHTBOX
   
   Clicking a gallery item opens a full-screen photo viewer.
   ESC or clicking backdrop closes it.
────────────────────────────────────────────────────────────── */
const lightbox        = document.getElementById('lightbox');
const lightboxImg     = document.getElementById('lightbox-img');
const lightboxCaption = document.getElementById('lightbox-caption');
const lightboxClose   = document.getElementById('lightbox-close');
const lightboxBack    = document.getElementById('lightbox-backdrop');

function openLightbox(src, caption) {
  lightboxImg.src         = src;
  lightboxCaption.textContent = caption || '';
  lightbox.classList.add('open');
  lightbox.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  lightboxClose.focus();
}

function closeLightbox() {
  lightbox.classList.remove('open');
  lightbox.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
  // Clear image after transition
  setTimeout(() => { lightboxImg.src = ''; }, 400);
}

// Open on click / keyboard
document.querySelectorAll('.gallery-item').forEach(item => {
  const activate = () => {
    const img     = item.querySelector('img');
    const caption = item.dataset.caption;
    if (img) openLightbox(img.src, caption);
  };
  item.addEventListener('click', activate);
  item.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); activate(); }
  });
});

// Close handlers
lightboxClose.addEventListener('click', closeLightbox);
lightboxBack.addEventListener('click', closeLightbox);
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && lightbox.classList.contains('open')) closeLightbox();
});

/* ──────────────────────────────────────────────────────────────
   9. MUSIC PLAYER
   
   Floating action button — no autoplay.
   REPLACE: drop your MP3 into assets/audio/birthday.mp3
────────────────────────────────────────────────────────────── */
const musicBtn  = document.getElementById('music-btn');
const bgMusic   = document.getElementById('bg-music');
const iconPlay  = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
let   isPlaying = false;

musicBtn.addEventListener('click', () => {
  if (isPlaying) {
    // Pause with fade-out
    const fadeOut = setInterval(() => {
      if (bgMusic.volume > 0.05) bgMusic.volume -= 0.05;
      else {
        bgMusic.pause();
        bgMusic.volume = 1;
        clearInterval(fadeOut);
      }
    }, 50);
    musicBtn.classList.remove('playing');
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
    isPlaying = false;
  } else {
    // Try to play
    bgMusic.volume = 0;
    bgMusic.play()
      .then(() => {
        // Fade in
        const fadeIn = setInterval(() => {
          if (bgMusic.volume < 0.95) bgMusic.volume = Math.min(1, bgMusic.volume + 0.05);
          else { bgMusic.volume = 1; clearInterval(fadeIn); }
        }, 60);
        musicBtn.classList.add('playing');
        iconPlay.classList.add('hidden');
        iconPause.classList.remove('hidden');
        isPlaying = true;
      })
      .catch(err => {
        // Audio file not found or browser blocked — fail silently
        console.info('🎵 Music: add your MP3 to assets/audio/birthday.mp3 to enable music.');
        console.info('Error:', err.message);
      });
  }
});

/* ──────────────────────────────────────────────────────────────
   10. MEMORY FORM
   
   Connects to Firebase (firebase.js must be configured).
   Shows image preview before upload.
   On submit: calls addMemory() from firebase.js.
────────────────────────────────────────────────────────────── */
const memoryForm       = document.getElementById('memory-form');
const memoryPhotoInput = document.getElementById('memory-photo');
const uploadPlaceholder= document.getElementById('upload-placeholder');
const uploadPreview    = document.getElementById('upload-preview');
const formStatus       = document.getElementById('form-status');
const submitBtn        = document.getElementById('submit-btn');

// Live image preview when user selects a file
if (memoryPhotoInput) {
  memoryPhotoInput.addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.onload = ev => {
      uploadPreview.src = ev.target.result;
      uploadPreview.classList.remove('visually-hidden');
      uploadPlaceholder.classList.add('hidden');
    };
    reader.readAsDataURL(file);
  });
}

// Form submission
if (memoryForm) {
  memoryForm.addEventListener('submit', async e => {
    e.preventDefault();

    const file  = memoryPhotoInput.files[0];
    const title = document.getElementById('memory-title').value.trim();
    const date  = document.getElementById('memory-date').value;
    const note  = document.getElementById('memory-note').value.trim();

    // Basic validation
    if (!file) {
      setStatus('Please choose a photo first.', 'error');
      return;
    }
    if (!title) {
      setStatus('Please add a title for this memory.', 'error');
      return;
    }

    // Disable form while uploading
    submitBtn.disabled = true;
    submitBtn.querySelector('.btn-text').textContent = 'Saving…';
    setStatus('', '');

    try {
      // addMemory is defined in firebase.js
      await window.addMemory(file, title, date, note);
      setStatus('✓ Memory saved! You can both see it now.', 'success');
      memoryForm.reset();
      uploadPreview.classList.add('visually-hidden');
      uploadPlaceholder.classList.remove('hidden');
      // Reload the feed
      if (typeof window.loadMemories === 'function') window.loadMemories();
    } catch (err) {
      console.error('Memory save error:', err);
      setStatus(err.message || 'Could not save. Check your Firebase config in firebase.js.', 'error');
    } finally {
      submitBtn.disabled = false;
      submitBtn.querySelector('.btn-text').textContent = 'Save this memory';
    }
  });
}

function setStatus(msg, type) {
  formStatus.textContent  = msg;
  formStatus.className    = 'form-status' + (type ? ` ${type}` : '');
}

// ── End DOMContentLoaded ──────────────────────────────────────
}); // window.addEventListener('DOMContentLoaded', ...)
