import { getLang } from "./i18n.js";

function locale() {
  return getLang() === "de" ? "de-DE" : "en-US";
}

export function isk(value) {
  return Number(value).toLocaleString(locale(), { maximumFractionDigits: 2 }) + " ISK";
}

export function num(value) {
  return Number(value).toLocaleString(locale());
}

export function pct(value, digits = 1) {
  return Number(value).toFixed(digits) + "%";
}

/** Kurzer Count-Up-Effekt fuer Stat-Zahlen - reine Optik, kein Datenverlust. */
export function animateValue(el, target) {
  const duration = 500;
  const start = performance.now();
  function step(now) {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = Math.round(target * eased).toLocaleString(locale());
    if (progress < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

export function animateStats(root) {
  root.querySelectorAll("[data-count]").forEach((elm) => animateValue(elm, Number(elm.dataset.count)));
}

export function skeleton(lines = 3) {
  return `<div class="skeleton-block">${Array.from({ length: lines })
    .map(() => '<div class="skeleton-line"></div>')
    .join("")}</div>`;
}

export function errorBlock(message) {
  return `<span class="risk-high">${message}</span>`;
}
