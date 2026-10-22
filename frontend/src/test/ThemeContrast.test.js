import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

/**
 * WCAG 2.1 AA (#1502): every text token must reach 4.5:1 against every
 * surface token, in both the light and dark theme. jsdom cannot compute
 * rendered colours, so this guards the design tokens directly.
 */
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../theme.css'), 'utf8');

function tokens(block) {
  const out = {};
  for (const m of block.matchAll(/--(color-[\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)) out[m[1]] = m[2];
  return out;
}

function luminance(hex) {
  let h = hex.slice(1);
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const [lightBlock, darkBlock] = css.split(/\n\[data-theme='dark'\]\s*\{/);
const themes = { light: tokens(lightBlock), dark: tokens(darkBlock) };
const TEXT = ['color-text', 'color-text-secondary', 'color-text-muted', 'color-text-faint', 'color-text-subtle', 'color-primary', 'color-danger'];
const SURFACES = ['color-surface', 'color-surface-muted'];

describe('theme colour contrast (WCAG AA 4.5:1)', () => {
  for (const [name, t] of Object.entries(themes)) {
    for (const fg of TEXT) {
      for (const bg of SURFACES) {
        it(`${name}: --${fg} on --${bg}`, () => {
          expect(t[fg], `missing --${fg}`).toBeDefined();
          expect(t[bg], `missing --${bg}`).toBeDefined();
          expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
    it(`${name}: warning text on warning background`, () => {
      expect(contrast(t['color-warning-text'], t['color-warning-bg'])).toBeGreaterThanOrEqual(4.5);
    });
  }
});
