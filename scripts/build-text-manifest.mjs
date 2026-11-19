import { readFile, readdir, writeFile } from 'node:fs/promises';
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

function decodeXmlText(value) {
  const entities = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'"
  };
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
      if (entity.startsWith('#x')) return String.fromCodePoint(Number.parseInt(entity.slice(2), 16));
      if (entity.startsWith('#')) return String.fromCodePoint(Number.parseInt(entity.slice(1), 10));
      return entities[entity.toLowerCase()] ?? match;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

function extractElementText(source, name) {
  const match = new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)<\\/${name}\\s*>`, 'i').exec(source);
  return match ? decodeXmlText(match[1]) : '';
}

function readTeiMetadata(content) {
  const header = /<teiHeader\b[^>]*>([\s\S]*?)<\/teiHeader\s*>/i.exec(content)?.[1] || '';
  const titleStatement = /<titleStmt\b[^>]*>([\s\S]*?)<\/titleStmt\s*>/i.exec(header)?.[1] || header;
  const textAttributes = /<text\b([^>]*)>/i.exec(content)?.[1] || '';
  const language = /\bxml:lang\s*=\s*(["'])(.*?)\1/i.exec(textAttributes)?.[2] || '';
  const volume = [...header.matchAll(/<biblScope\b([^>]*)>([\s\S]*?)<\/biblScope\s*>/gi)]
    .find(([, attributes]) => /\bunit\s*=\s*(["'])volume\1/i.test(attributes));

  return {
    title: extractElementText(titleStatement, 'title'),
    author: extractElementText(titleStatement, 'author'),
    language,
    volume: volume ? decodeXmlText(volume[2]) || '1' : '1'
  };
}

async function readDocumentMetadata(file) {
  const content = await readFile(file, 'utf8');
  if (/\.json$/i.test(file)) {
    const data = JSON.parse(content);
    return {
      title: typeof data.title === 'string' ? data.title.trim() : '',
      author: typeof data.author === 'string' ? data.author.trim() : '',
      language: typeof data.language === 'string' ? data.language.trim() : '',
      volume: data.volume === undefined ? '1' : String(data.volume)
    };
  }
  return readTeiMetadata(content);
}

const documents = await findDocuments(textRoot);
const references = await Promise.all(documents
  .filter(file => path.relative(textRoot, file).split(path.sep).join('/') !== 'texte.json')
  .map(async file => ({
    path: path.relative(textRoot, file).split(path.sep).join('/'),
    ...await readDocumentMetadata(file)
  })));
references.sort((a, b) => a.path.localeCompare(b.path, 'ro'));

await writeFile(manifestPath, `${JSON.stringify(references, null, 2)}\n`, 'utf8');
console.log(`Manifest actualizat: ${references.length} documente.`);
