// Clean Architecture guard: dependencies point inward only (also enforced by eslint).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = join(__dirname, '..', 'src');
const LAYERS = ['domain', 'application', 'infrastructure', 'presentation'] as const;
const ALLOWED: Record<(typeof LAYERS)[number], { layers: string[]; packages: RegExp }> = {
  domain: { layers: ['domain'], packages: /^$/ },
  application: { layers: ['domain', 'application'], packages: /^xstate$/ },
  infrastructure: { layers: ['domain', 'application', 'infrastructure'], packages: /^$/ },
  presentation: { layers: LAYERS as unknown as string[], packages: /^(pixi\.js|pixi-filters|gsap(\/.*)?|howler|xstate|virtual:pwa-register)$/ },
};

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('architecture', () => {
  for (const layer of LAYERS) {
    it(`${layer} only imports allowed layers/packages`, () => {
      const violations: string[] = [];
      const dirFiles = existsSync(join(SRC, layer)) ? files(join(SRC, layer)) : [];
      for (const file of dirFiles) {
        const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
        for (const m of text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]|^\s*import\s+['"]([^'"]+)['"]/gm)) {
          const spec = (m[1] ?? m[2] ?? m[3]) as string;
          const rel = relative(SRC, file);
          if (spec.startsWith('.') || spec.startsWith('@/')) {
            const target = spec.startsWith('@/') ? spec.slice(2).split('/')[0] : relative(SRC, join(file, '..', spec)).split('/')[0];
            if (!ALLOWED[layer].layers.includes(target as string)) violations.push(`${rel} -> ${spec}`);
          } else if (!ALLOWED[layer].packages.test(spec)) {
            violations.push(`${rel} -> ${spec} (package)`);
          }
        }
        if ((layer === 'domain' || layer === 'application') && /\bMath\.random\b|\bcrypto\.|localStorage|\bdocument\.|\bwindow\./.test(text)) {
          violations.push(`${relative(SRC, file)} uses I/O or global randomness`);
        }
      }
      expect(violations).toEqual([]);
    });
  }
});
