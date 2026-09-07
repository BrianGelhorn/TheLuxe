import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';

// Use executed cases, including table-driven tests, rather than parsing test source.
export default async function* report(events) {
  const cases = [];
  for await (const { type, data } of events) {
    if ((type === 'test:pass' || type === 'test:fail') && data.details?.type !== 'suite') {
      const path = data.file?.startsWith('file:') ? fileURLToPath(data.file) : data.file;
      cases.push({ name: data.name, file: path ? relative(process.cwd(), path).replaceAll('\\', '/') : 'unknown', failed: type === 'test:fail' });
    }
  }
  const failed = cases.filter((item) => item.failed).length;
  yield '# Indice de tests\n\n';
  yield `Generado con \`npm run test:docs\`. ${cases.length} tests; ${failed} fallos.\n\n`;
  yield 'Una linea por test. Los IDs se pueden buscar en el codigo o ejecutar con `--test-name-pattern`.\n\n';
  yield 'Alcance y comandos: [TESTING.md](TESTING.md). No certifica estilos ni interaccion nativa de un navegador real.\n\n';
  const ids = new Set();
  const files = [...new Set(cases.map((item) => item.file))].sort();
  for (const [index, file] of files.entries()) {
    yield `## ${file}\n\n`;
    for (const item of cases.filter((row) => row.file === file).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
      const match = item.name.match(/^([A-Z][A-Z-]*-\d+) - (.+)$/);
      if (!match || ids.has(match[1])) throw new Error(`Nombre sin ID unico: ${item.name}`);
      ids.add(match[1]);
      yield `- **${match[1]}**: ${match[2]}.${item.failed ? ' **FALLA**' : ''}\n`;
    }
    if (index < files.length - 1) yield '\n';
  }
}
