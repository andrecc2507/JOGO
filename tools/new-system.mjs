#!/usr/bin/env node
/**
 * Cria um sistema novo com pasta, arquivo, teste e registro no catálogo.
 *   npm run new:system -- combat
 *   npm run new:system -- enemy_ai --phase=logic --deps=movement,combat
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const name = args.find((a) => !a.startsWith('--'));
const flag = (key) => args.find((a) => a.startsWith(`--${key}=`))?.split('=')[1];

if (!name || !/^[a-z][a-z0-9_]*$/.test(name)) {
  console.error('Uso: npm run new:system -- <nome_em_snake_case> [--phase=input|logic|physics|late] [--deps=a,b]');
  process.exit(1);
}

const phase = flag('phase') ?? 'logic';
if (!['input', 'logic', 'physics', 'late'].includes(phase)) {
  console.error(`Fase inválida: ${phase}`);
  process.exit(1);
}
const deps = (flag('deps') ?? '').split(',').filter(Boolean);

const pascal = name.replace(/(^|_)([a-z0-9])/g, (_, __, c) => c.toUpperCase());
const factory = `create${pascal}System`;
const dir = join(root, 'src/game/systems', name);
const catalogPath = join(root, 'src/game/systems/catalog.ts');
const testPath = join(root, 'tests/game/systems', `${name}.test.ts`);

if (existsSync(dir)) {
  console.error(`Já existe: src/game/systems/${name}`);
  process.exit(1);
}

mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, `${name}.system.ts`),
  `import type { System } from '@core';

// Eventos emitidos por este sistema:
// declare module '@core/events/event_map' {
//   interface EventMap {
//     '${name}:something': { entity: number };
//   }
// }

/** TODO: descreva a responsabilidade única deste sistema. */
export function ${factory}(): System {
  return {
    id: '${name}',
    phase: '${phase}',${deps.length ? `\n    dependsOn: [${deps.map((d) => `'${d}'`).join(', ')}],` : ''}
    init(_ctx) {},
    update(_dt, _ctx) {},
  };
}
`,
);

mkdirSync(dirname(testPath), { recursive: true });
writeFileSync(
  testPath,
  `import { describe, expect, it } from 'vitest';
import { ${factory} } from '@game/systems/${name}/${name}.system';

describe('${name}', () => {
  it('tem o id correto', () => {
    expect(${factory}().id).toBe('${name}');
  });
});
`,
);

let catalog = readFileSync(catalogPath, 'utf8');
catalog = catalog
  .replace('// <new-system-import>', `import { ${factory} } from './${name}/${name}.system';\n// <new-system-import>`)
  .replace('  // <new-system-entry>', `  ${name}: ${factory},\n  // <new-system-entry>`);
writeFileSync(catalogPath, catalog);

console.log(`✔ src/game/systems/${name}/${name}.system.ts`);
console.log(`✔ tests/game/systems/${name}.test.ts`);
console.log(`✔ registrado em src/game/systems/catalog.ts`);
console.log(`→ Adicione '${name}' à lista \`systems\` da cena que deve usá-lo.`);
