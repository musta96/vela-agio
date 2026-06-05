# Mobile Performance & QA Checklist

Run this before publishing changes that affect the landing page or any
marketing surface. Test on real devices when possible; otherwise use the
built-in mobile preview (`/?preview=mobile`) at **360px**, **390px**, and
**430px** widths.

## 1. WebGL / 3D scene
- [ ] `CinematicScene` falls back to the static radial gradient on
      viewports ≤ 768px and when `prefers-reduced-motion: reduce` is set.
- [ ] No `THREE.WebGLRenderer` warnings in the console on mobile.
- [ ] FPS stays above 45 on a mid-tier Android (Pixel 6a or similar).
- [ ] Battery does not drain noticeably during a 60s idle on the hero.

## 2. Animation
- [ ] GSAP `Reveal` skips animation when `prefers-reduced-motion: reduce`.
- [ ] Lenis smooth-scroll is disabled when reduced motion is requested.
- [ ] No animation runs longer than 1.2s on the critical path.
- [ ] No layout shift (CLS < 0.05) during reveal sequences.

## 3. Layout stability (CLS)
- [ ] Hero headline does not wrap awkwardly at 360px.
- [ ] Trust badges wrap to multiple lines without overflow.
- [ ] Feature grid collapses to single column < 640px.
- [ ] Pricing cards stack vertically without horizontal scroll.
- [ ] Footer columns stack and remain readable.
- [ ] No element exceeds `100vw`; `overflow-x: hidden` only as a safety net.

## 4. Touch usability
- [ ] All CTAs are ≥ 44×44 CSS pixels (WCAG 2.5.5).
- [ ] Nav links have ≥ 12px vertical padding on mobile.
- [ ] Primary "Get started" button is reachable with the thumb.
- [ ] No two tappable elements are closer than 8px.

## 5. Accessibility
- [ ] Focus ring visible on every interactive element (Tab through page).
- [ ] Body copy ≥ 16px to avoid iOS auto-zoom on inputs.
- [ ] Text contrast passes WCAG AA on all backgrounds (incl. glass cards).
- [ ] Images have descriptive `alt` attributes.
- [ ] Single `<main>` landmark; one `<h1>`; logical heading order.

## 6. Network
- [ ] Largest Contentful Paint < 2.5s on Slow 4G.
- [ ] Total JS transferred < 350 KB gzipped on first visit.
- [ ] Three.js bundle only loaded on desktop (already gated in
      `CinematicScene`).

## How to run
1. Open `/?preview=mobile` in the dev preview.
2. Cycle through 360 / 390 / 430 widths using the floating switcher.
3. Tick each box above, then publish.