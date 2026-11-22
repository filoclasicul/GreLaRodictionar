import { readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const textRoot = path.join(root, 'data', 'texte');
const manifestPath = path.join(textRoot, 'texte.json');
const sourceIndexPath = path.join(textRoot, 'index.json');
const sourceIndex = JSON.parse(await readFile(sourceIndexPath, 'utf8'));
const indexedMetadata = new Map(sourceIndex.map(entry => [entry.fisier, entry]));

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
  const sourceDescription = /<sourceDesc\b[^>]*>([\s\S]*?)<\/sourceDesc\s*>/i.exec(header)?.[1] || '';
  const sourceMonograph = /<monogr\b[^>]*>([\s\S]*?)<\/monogr\s*>/i.exec(sourceDescription)?.[1] || sourceDescription;
  const textAttributes = /<text\b([^>]*)>/i.exec(content)?.[1] || '';
  const language = /\bxml:lang\s*=\s*(["'])(.*?)\1/i.exec(textAttributes)?.[2] || '';
  const volume = [...header.matchAll(/<biblScope\b([^>]*)>([\s\S]*?)<\/biblScope\s*>/gi)]
    .find(([, attributes]) => /\bunit\s*=\s*(["'])volume\1/i.test(attributes));

  return {
    title: extractElementText(titleStatement, 'title'),
    author: extractElementText(titleStatement, 'author') || extractElementText(sourceMonograph, 'author'),
    language,
    volume: volume ? decodeXmlText(volume[2]) || '1' : '1'
  };
}

async function readDocumentMetadata(file) {
  const content = await readFile(file, 'utf8');
  const relativePath = path.relative(textRoot, file).split(path.sep).join('/');
  const indexed = indexedMetadata.get(relativePath);
  const collection = relativePath.split('/')[0];
  const defaultLanguage = collection === 'perseus_greaca' ? 'grc'
    : collection === 'perseus_latina' ? 'lat'
      : '';
  let metadata;
  if (/\.json$/i.test(file)) {
    const data = JSON.parse(content);
    metadata = {
      title: typeof data.title === 'string' ? data.title.trim() : '',
      author: typeof data.author === 'string' ? data.author.trim() : '',
      language: typeof data.language === 'string' ? data.language.trim() : '',
      volume: data.volume === undefined ? '1' : String(data.volume)
    };
  } else {
    metadata = readTeiMetadata(content);
  }

  return {
    title: metadata.title || indexed?.titlu || '',
    author: indexed?.autor || metadata.author || '',
    language: metadata.language || defaultLanguage,
    volume: metadata.volume || '1'
  };
}

const documents = await findDocuments(textRoot);
const references = await Promise.all(documents
  .filter(file => !['index.json', 'texte.json'].includes(
    path.relative(textRoot, file).split(path.sep).join('/')
  ))
  .map(async file => ({
    path: path.relative(textRoot, file).split(path.sep).join('/'),
    ...await readDocumentMetadata(file)
  })));
references.sort((a, b) => a.path.localeCompare(b.path, 'ro'));

await writeFile(manifestPath, `${JSON.stringify(references, null, 2)}\n`, 'utf8');
console.log(`Manifest actualizat: ${references.length} documente.`);
