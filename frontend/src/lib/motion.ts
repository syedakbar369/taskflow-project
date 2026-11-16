import gsap from 'gsap';

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** Subtle entrance for a page/section. No-op with reduced motion. */
export function enter(el: Element | null, opts: { y?: number; delay?: number } = {}) {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(el, { opacity: 0, y: opts.y ?? 8 }, { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', delay: opts.delay ?? 0, clearProps: 'transform,opacity' });
}

/** Stagger children in once. */
export function enterChildren(el: Element | null, selector = ':scope > *') {
  if (!el || prefersReducedMotion()) return;
  const items = el.querySelectorAll(selector);
  gsap.fromTo(items, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.35, stagger: 0.04, ease: 'power2.out', clearProps: 'transform,opacity' });
}

/** Count-up animation for dashboard numbers. */
export function countTo(el: HTMLElement | null, value: number) {
  if (!el) return;
  if (prefersReducedMotion()) {
    el.textContent = String(value);
    return;
  }
  const from = Number(el.dataset.value ?? 0);
  const obj = { v: from };
  el.dataset.value = String(value);
  gsap.to(obj, { v: value, duration: 0.6, ease: 'power1.out', onUpdate: () => {
      el.textContent = String(Math.round(obj.v));
    },
  });
}

export function slideIn(el: Element | null, from: 'right' | 'bottom' = 'right') {
  if (!el || prefersReducedMotion()) return;
  gsap.fromTo(
    el,
    from === 'right' ? { x: 40, opacity: 0 } : { y: 16, opacity: 0, scale: 0.98 },
    { x: 0, y: 0, scale: 1, opacity: 1, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' },
  );
}
