import { readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textRoot = path.join(root, 'data', 'texte');
const manifestPath = path.join(textRoot, 'texte.json');

async function findDocuments(directory) {
  const documents = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) documents.push(...await findDocuments(absolutePath));
    else if (/\.(xml|json)$/i.test(entry.name)) documents.push(absolutePath);
  }
  return documents;
}

const documents = await findDocuments(textRoot);
const references = documents
  .map(file => path.relative(textRoot, file).split(path.sep).join('/'))
  .filter(relativePath => relativePath !== 'texte.json')
  .sort((a, b) => a.localeCompare(b, 'ro'))
  .map(relativePath => ({ path: relativePath }));

await writeFile(manifestPath, `${JSON.stringify(references, null, 2)}\n`, 'utf8');
console.log(`Manifest actualizat: ${references.length} documente.`);
