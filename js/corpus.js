const TEXT_CHAPTER_RENDER_BATCH_SIZE = 40;
const TEXT_BROWSER_HISTORY_KEY = 'grelaroTextBrowser';
let textNavigationLoadId = 0;
let textDirectoryRenderId = 0;
let textNavigationLoading = false;

async function loadAuthorProfiles() {
  try {
    const response = await fetch('data/authors/authors.json', { cache: 'force-cache' });
    if (!response.ok) throw new Error(`Răspuns HTTP ${response.status}`);
    const profiles = await response.json();
    if (!profiles || typeof profiles !== 'object' || Array.isArray(profiles)) {
      throw new TypeError('Profilurile autorilor nu au formatul așteptat.');
    }
    const fallbackProfiles = authorProfiles;
    authorProfiles = { ...fallbackProfiles, ...profiles };
    Object.entries(profiles).forEach(([key, profile]) => {
      if (!profile?.image && fallbackProfiles[key]?.image) {
        authorProfiles[key] = {
          ...authorProfiles[key],
          image: fallbackProfiles[key].image
        };
      }
    });
  } catch (error) {
    console.warn('Nu s-au putut încărca profilurile externe ale autorilor.', error);
  }
}

function completeTextExcerpt(value, preferredLimit = 280, maximumLimit = 420) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (Array.from(text).length <= preferredLimit) return text;

  const punctuation = /[.!?;··](?:["”»'\)]*)?(?:\s|$)/gu;
  let match;
  let closestMatch = null;
  let closestDistance = Infinity;

  while ((match = punctuation.exec(text)) !== null) {
    const end = punctuation.lastIndex;
    if (end <= maximumLimit) {
      const distance = Math.abs(end - preferredLimit);
      if (distance < closestDistance) {
        closestMatch = end;
        closestDistance = distance;
      }
    }
    if (end > maximumLimit) break;
  }

  if (closestMatch) return text.slice(0, closestMatch).trim();

  const excerpt = Array.from(text).slice(0, preferredLimit).join('');
  const lastSpace = excerpt.lastIndexOf(' ');
  return `${excerpt.slice(0, lastSpace > preferredLimit * 0.65 ? lastSpace : preferredLimit).trimEnd()}…`;
}

function normalizeTextSearch(value) {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('ro')
    .trim();
}

function getTextSearchVariants(query, languageGroup) {
  const variants = new Set([normalizeTextSearch(query)]);
  if (languageGroup === 'gr') {
    variants.add(normalizeTextSearch(transliterateGreekInput(query).text));
  }
  return [...variants].filter(Boolean);
}

function matchesTextSearch(text, query, languageGroup) {
  const normalizedText = normalizeTextSearch(text);
  return getTextSearchVariants(query, languageGroup)
    .some(variant => normalizedText.includes(variant));
}

function matchesTextTitlePrefix(title, query, languageGroup) {
  const normalizedTitle = normalizeTextSearch(title);
  return getTextSearchVariants(query, languageGroup)
    .some(variant => normalizedTitle.startsWith(variant));
}

function validateTextDatabase(data) {
  if (!Array.isArray(data)) {
    throw new TypeError('Baza de texte trebuie să fie o listă.');
  }

  data.forEach((entry, index) => {
    const pathParts = typeof entry?.path === 'string' ? entry.path.split('/') : [];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)
      || typeof entry.path !== 'string' || !entry.path.trim()
      || !/\.(xml|json)$/i.test(entry.path)
      || !['gr', 'lat'].includes(pathParts[0])
      || pathParts.some(part => !part || part === '.' || part === '..')) {
      throw new TypeError(`Documentul de la poziția ${index + 1} nu are formatul așteptat.`);
    }
  });

  return data;
}

function textDocumentUrl(reference) {
  const path = reference.path.split('/').map(encodeURIComponent).join('/');
  return `data/texte/${path}`;
}

function getTextAuthorProfile(reference) {
  const authorFolder = reference.path.split('/')[1];
  return authorProfiles[authorFolder] || null;
}

function getTextLanguage(languageCode, languageGroup) {
  if (languageCode === 'lat') return 'Latină';
  if (languageCode === 'grc' || languageCode === 'gr') return 'Greacă veche';
  return languageCode || (languageGroup === 'lat' ? 'Latină' : 'Greacă veche');
}

function loadTeiText(reference, content) {
  const xml = new DOMParser().parseFromString(content, 'application/xml');
  if (xml.getElementsByTagName('parsererror').length) {
    throw new TypeError(`Fișierul ${reference.path} nu conține XML valid.`);
  }

  const allElements = (root, localName) => {
    const elements = root.getElementsByTagNameNS('*', localName);
    return Array.from(elements.length ? elements : root.getElementsByTagName(localName));
  };
  const firstElement = (root, localName) =>
    root.getElementsByTagNameNS('*', localName)[0]
    || root.getElementsByTagName(localName)[0]
    || null;
  const elementText = element => element?.textContent?.replace(/\s+/g, ' ').trim() || '';
  const cleanTextContent = element => {
    if (!element) return '';
    const clone = element.cloneNode(true);
    clone.querySelectorAll('note, pb, milestone, gap, del, ref, bibl, desc')
      .forEach(unwanted => unwanted.remove());
    clone.querySelectorAll('app')
      .forEach(appElement => {
        const lem = appElement.querySelector('lem');
        if (lem) appElement.replaceChildren(lem.cloneNode(true));
        else appElement.querySelectorAll('rdg, wit').forEach(child => child.remove());
      });
    clone.querySelectorAll('choice')
      .forEach(choice => {
        const preferred = choice.querySelector('corr, expan, reg');
        if (preferred) choice.replaceChildren(preferred.cloneNode(true));
        else choice.querySelectorAll('abbr, ex, orig, sic').forEach(child => child.remove());
      });
    clone.querySelectorAll('foreign')
      .forEach(foreign => {
        const language = foreign.getAttribute('xml:lang') || foreign.getAttribute('lang');
        if (language === 'grc' || language === 'gr') foreign.remove();
      });
    clone.querySelectorAll('num')
      .forEach(number => {
        const value = number.getAttribute('n');
        const rendered = number.textContent || '';
        if (value && /[^A-Za-zÀ-ÖØ-öø-ÿ0-9.,\s]/.test(rendered)) {
          number.replaceWith(document.createTextNode(value));
        }
      });
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };

  const textElement = firstElement(xml, 'text');
  const body = firstElement(xml, 'body');
  if (!textElement || !body) {
    throw new TypeError(`Fișierul ${reference.path} nu conține un text TEI complet.`);
  }

  const title = elementText(firstElement(xml, 'title'));
  const author = elementText(firstElement(xml, 'author'));
  const source = elementText(firstElement(xml, 'authority'));
  const licenseElement = firstElement(xml, 'licence');
  const monograph = firstElement(xml, 'monogr');
  const collectionTitle = monograph ? elementText(firstElement(monograph, 'title')) : '';
  const volumeElement = allElements(xml, 'biblScope')
    .find(scope => scope.getAttribute('unit') === 'volume');
  const volume = volumeElement?.textContent?.trim() || '1';
  const languageCode = textElement.getAttributeNS('http://www.w3.org/XML/1998/namespace', 'lang');
  const languageGroup = reference.path.split('/')[0];
  const language = getTextLanguage(languageCode, languageGroup);
  const authorProfile = getTextAuthorProfile(reference);
  const bodyDivisions = allElements(body, 'div');
  const hasTextContent = element =>
    element.getElementsByTagNameNS('*', 'p').length > 0
    || element.getElementsByTagNameNS('*', 'l').length > 0
    || element.getElementsByTagName('p').length > 0
    || element.getElementsByTagName('l').length > 0;
  const chapterDivisions = bodyDivisions
    .filter(section => {
      const subtype = section.getAttribute('subtype');
      const number = section.getAttribute('n');
      if (subtype !== 'chapter' || !number) return false;
      const hasChildChapter = Array.from(section.children)
        .some(child => (child.localName === 'div' || child.tagName === 'div')
          && child.getAttribute('subtype') === 'chapter');
      return !hasChildChapter && hasTextContent(section);
    })
    .map((section, index) => {
      const chapterParagraphs = allElements(section, 'p')
        .map(cleanTextContent)
        .filter(Boolean);
      const chapterLines = chapterParagraphs.length
        ? []
        : allElements(section, 'l')
          .map(cleanTextContent)
          .filter(Boolean);
      const heading = Array.from(section.children)
        .find(child => child.localName === 'head');
      const chapterText = chapterParagraphs.length ? chapterParagraphs : chapterLines;
      return {
        number: String(index + 1),
        heading: heading ? cleanTextContent(heading) : '',
        paragraphs: chapterText,
        text: chapterText.join('\n\n')
      };
    })
    .filter(chapter => chapter.text);

  let chapters = chapterDivisions;
  if (!chapters.length) {
    const paragraphElements = allElements(body, 'p');
    const milestones = allElements(body, 'milestone')
      .filter(milestone =>
        milestone.getAttribute('unit') === 'chapter'
        && /^\d+(?:[.:]\d+)*$/.test(milestone.getAttribute('n') || '')
      );
    chapters = milestones.map((milestone, index) => {
      const number = milestone.getAttribute('n');
      const startParagraph = paragraphElements.findIndex(paragraph => paragraph.contains(milestone));
      const nextMilestone = milestones[index + 1];
      const endParagraph = nextMilestone
        ? paragraphElements.findIndex(paragraph => paragraph.contains(nextMilestone))
        : paragraphElements.length;
      const chapterParagraphs = paragraphElements
        .slice(startParagraph >= 0 ? startParagraph : 0, endParagraph > startParagraph ? endParagraph : paragraphElements.length)
        .map(cleanTextContent)
        .filter(Boolean);
      return {
        number,
        heading: '',
        paragraphs: chapterParagraphs,
        text: chapterParagraphs.join('\n\n')
      };
    }).filter(chapter => chapter.text);

    if (!chapters.length) {
      chapters = bodyDivisions
        .filter(section => {
          if (section.getAttribute('subtype') !== 'section') return false;
          if (!/^\d+(?:[.:]\d+)*$/.test(section.getAttribute('n') || '')) return false;
          let parent = section.parentElement;
          let nestedInDivision = false;
          while (parent && parent !== body) {
            if ((parent.localName === 'div' || parent.tagName === 'div')
              && ['chapter', 'section', 'book'].includes(parent.getAttribute('subtype'))) {
              nestedInDivision = true;
              break;
            }
            parent = parent.parentElement;
          }
          return !nestedInDivision && hasTextContent(section);
        })
        .map(section => {
          const sectionParagraphs = allElements(section, 'p')
            .map(cleanTextContent)
            .filter(Boolean);
          const sectionLines = sectionParagraphs.length
            ? []
            : allElements(section, 'l')
              .map(cleanTextContent)
              .filter(Boolean);
          const heading = Array.from(section.children)
            .find(child => child.localName === 'head');
          const chapterText = sectionParagraphs.length ? sectionParagraphs : sectionLines;
          return {
            number: section.getAttribute('n'),
            heading: heading ? cleanTextContent(heading) : '',
            paragraphs: chapterText,
            text: chapterText.join('\n\n')
          };
        })
        .filter(chapter => chapter.text);
    }

    if (!chapters.length) {
      const numberedCandidates = bodyDivisions
        .filter(section => {
          const number = section.getAttribute('n');
          const hasChildDivision = Array.from(section.children)
            .some(child => child.localName === 'div' || child.tagName === 'div');
          return number && !hasChildDivision && hasTextContent(section)
            && (section.getAttribute('subtype') === 'section'
              || section.getAttribute('subtype') === 'poem'
              || /^\d+(?:[.:]\d+)*$/.test(number));
        });
      const numberedLabelCounts = numberedCandidates.reduce((counts, section) => {
        const number = section.getAttribute('n');
        counts.set(number, (counts.get(number) || 0) + 1);
        return counts;
      }, new Map());
      chapters = numberedCandidates
        .map((section, index) => {
          const chapterParagraphs = allElements(section, 'p')
            .map(cleanTextContent)
            .filter(Boolean);
          const chapterLines = chapterParagraphs.length
            ? []
            : allElements(section, 'l')
              .map(cleanTextContent)
              .filter(Boolean);
          const heading = Array.from(section.children)
            .find(child => child.localName === 'head');
          const headingText = heading ? cleanTextContent(heading) : '';
          const chapterText = chapterParagraphs.length ? chapterParagraphs : chapterLines;
          const sourceNumber = section.getAttribute('n');
          return {
            number: numberedLabelCounts.get(sourceNumber) > 1
              ? String(index + 1)
              : sourceNumber,
            heading: headingText,
            paragraphs: chapterText,
            text: chapterText.join('\n\n')
          };
        })
        .filter(chapter => chapter.text);
    }
  }

  if (!chapters.length) {
    const paragraphs = allElements(body, 'p')
      .map(cleanTextContent)
      .filter(Boolean);
    const lines = allElements(body, 'l')
      .map(cleanTextContent)
      .filter(Boolean);
    const fallbackContent = paragraphs.length ? paragraphs : lines;
    if (fallbackContent.length) {
      chapters = [{ number: '1', heading: '', paragraphs: fallbackContent, text: fallbackContent.join('\n\n') }];
    }
  }
  const chapterNumberCounts = chapters.reduce((counts, chapter) => {
    counts.set(chapter.number, (counts.get(chapter.number) || 0) + 1);
    return counts;
  }, new Map());
  if ([...chapterNumberCounts.values()].some(count => count > 1)) {
    chapters = chapters.map((chapter, index) => ({
      ...chapter,
      number: String(index + 1)
    }));
  }
  const text = chapters.map(chapter => chapter.text).join('\n\n')
    || cleanTextContent(body);

  if (!title || !text) {
    throw new TypeError(`Fișierul ${reference.path} nu conține titlu sau text.`);
  }

  return {
    path: reference.path,
    title,
    author: authorProfile?.name || author || '',
    language,
    languageGroup,
    source: source || '',
    license: licenseElement?.textContent?.trim() || '',
    licenseUrl: licenseElement?.getAttribute('target') || '',
    collectionTitle,
    volume,
    chapters,
    text
  };
}

function parseJsonText(reference, data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new TypeError(`Fișierul ${reference.path} trebuie să conțină un obiect JSON.`);
  }

  const languageGroup = reference.path.split('/')[0];
  const authorProfile = getTextAuthorProfile(reference);
  const title = typeof data.title === 'string' ? data.title.trim() : '';
  const author = authorProfile?.name || (typeof data.author === 'string' ? data.author.trim() : '');
  const normalizeParagraphs = (value, label) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some(paragraph => typeof paragraph !== 'string')) {
      throw new TypeError(`${label} din ${reference.path} trebuie să fie o listă de texte.`);
    }
    return value.map(paragraph => paragraph.trim()).filter(Boolean);
  };
  const splitText = value => typeof value === 'string'
    ? value.split(/\n\s*\n/).map(paragraph => paragraph.trim()).filter(Boolean)
    : [];
  const parseChapter = (chapter, index) => {
    if (!chapter || typeof chapter !== 'object' || Array.isArray(chapter)) {
      throw new TypeError(`Capitolul ${index + 1} din ${reference.path} nu este un obiect.`);
    }
    const paragraphs = chapter.paragraphs === undefined
      ? splitText(chapter.text)
      : normalizeParagraphs(chapter.paragraphs, `Paragrafele capitolului ${index + 1}`);
    return {
      number: String(chapter.number || index + 1),
      heading: typeof chapter.heading === 'string' ? chapter.heading.trim() : '',
      paragraphs,
      text: paragraphs.join('\n\n')
    };
  };

  let chapters = [];
  if (data.chapters !== undefined) {
    if (!Array.isArray(data.chapters)) {
      throw new TypeError(`Câmpul chapters din ${reference.path} trebuie să fie o listă.`);
    }
    chapters = data.chapters.map(parseChapter).filter(chapter => chapter.text);
  } else {
    const paragraphs = data.paragraphs === undefined
      ? splitText(typeof data.text === 'string' ? data.text : '')
      : normalizeParagraphs(data.paragraphs, `Paragrafele din ${reference.path}`);
    if (paragraphs.length) {
      chapters = [{ number: '1', heading: '', paragraphs, text: paragraphs.join('\n\n') }];
    }
  }

  const text = chapters.map(chapter => chapter.text).join('\n\n');
  if (!title || !text) {
    throw new TypeError(`Fișierul ${reference.path} nu conține titlu sau text.`);
  }

  return {
    path: reference.path,
    title,
    author,
    language: getTextLanguage(data.language, languageGroup),
    languageGroup,
    source: typeof data.source === 'string' ? data.source.trim() : '',
    license: typeof data.license === 'string' ? data.license.trim() : '',
    licenseUrl: typeof data.licenseUrl === 'string' ? data.licenseUrl.trim() : '',
    collectionTitle: typeof data.collectionTitle === 'string' ? data.collectionTitle.trim() : '',
    volume: data.volume === undefined ? '1' : String(data.volume),
    chapters,
    text
  };
}

async function loadTextDocument(reference) {
  const response = await fetch(textDocumentUrl(reference));
  if (!response.ok) throw new Error(`Nu s-a putut încărca ${reference.path}: HTTP ${response.status}`);

  const content = await response.text();
  if (/\.json$/i.test(reference.path)) {
    let data;
    try {
      data = JSON.parse(content);
    } catch (error) {
      throw new TypeError(`Fișierul ${reference.path} nu conține JSON valid.`, { cause: error });
    }
    return parseJsonText(reference, data);
  }
  return loadTeiText(reference, content);
}

function setTextsSearchStatus(message, state = '') {
  textsSearchStatus.textContent = message;
  textsSearchStatus.hidden = !message;
  if (state) textsSearchStatus.dataset.state = state;
  else delete textsSearchStatus.dataset.state;
}

function createTextAttribution(entry) {
  if (!entry.source && !entry.license) return null;

  const attribution = document.createElement('p');
  attribution.className = 'texts-attribution';
  attribution.textContent = entry.source ? `${entry.source} · ` : '';
  if (entry.licenseUrl) {
    const licenseLink = document.createElement('a');
    licenseLink.href = entry.licenseUrl;
    licenseLink.target = '_blank';
    licenseLink.rel = 'noopener noreferrer';
    licenseLink.textContent = entry.license || 'Licență';
    attribution.appendChild(licenseLink);
  } else if (entry.license) {
    attribution.append(document.createTextNode(entry.license));
  }

  return attribution;
}

function createTextResultCard(entry, query) {
  const card = document.createElement('article');
  card.className = 'texts-result-card';

  const title = document.createElement('h2');
  title.textContent = entry.title;
  const meta = document.createElement('p');
  meta.className = 'texts-result-meta';
  meta.textContent = [entry.author, entry.language].filter(Boolean).join(' · ');
  const attribution = createTextAttribution(entry);
  const normalizedText = normalizeTextSearch(entry.text);
  const matchPosition = getTextSearchVariants(query, entry.languageGroup)
    .map(variant => normalizedText.indexOf(variant))
    .find(position => position >= 0) ?? -1;
  const start = matchPosition > 120 ? matchPosition - 120 : 0;
  const end = Math.min(entry.text.length, start + 480);
  const excerptText = entry.text.slice(start, end);
  const excerpt = document.createElement('p');
  excerpt.className = 'texts-result-excerpt';
  const completeExcerpt = completeTextExcerpt(excerptText);
  excerpt.textContent = `${start > 0 ? '…' : ''}${completeExcerpt}${end < entry.text.length && !/[.!?;··]\s*$/.test(completeExcerpt) ? '…' : ''}`;
  card.append(title, meta);
  if (attribution) card.appendChild(attribution);
  card.appendChild(excerpt);

  if (entry.text.length > 320) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.className = 'texts-full-text-toggle';
    summary.textContent = 'Citește textul integral';
    details.open = !query;
    const fullText = document.createElement('p');
    fullText.className = 'texts-full-text';
    fullText.textContent = entry.text;
    details.append(summary, fullText);
    card.appendChild(details);
  }

  return card;
}

function createTextBrowseCard(title, detail, onClick, options = {}) {
  const card = document.createElement('div');
  card.className = 'texts-browse-card';
  const openButton = document.createElement('button');
  openButton.className = 'texts-browse-card-open';
  openButton.type = 'button';

  const cardInner = document.createElement('div');
  cardInner.className = 'texts-browse-card-inner';

  if (options.imageUrl) {
    const imageWrap = document.createElement('div');
    imageWrap.className = 'texts-browse-card-image';
    const image = document.createElement('img');
    image.src = options.imageUrl;
    image.alt = options.alt || title;
    image.loading = 'lazy';
    image.decoding = 'async';
    image.addEventListener('error', () => {
      imageWrap.replaceChildren();
      imageWrap.textContent = '🏛️';
      imageWrap.classList.add('is-fallback');
      imageWrap.setAttribute('aria-label', 'Imagine indisponibilă');
    }, { once: true });
    imageWrap.appendChild(image);
    cardInner.appendChild(imageWrap);
  } else if (options.icon) {
    const iconWrap = document.createElement('div');
    iconWrap.className = 'texts-browse-card-image';
    iconWrap.classList.add('is-fallback');
    iconWrap.textContent = options.icon;
    cardInner.appendChild(iconWrap);
  }

  const textContent = document.createElement('div');
  textContent.className = 'texts-browse-card-copy';

  const titleElement = document.createElement('span');
  titleElement.className = 'texts-browse-card-title';
  titleElement.textContent = title;

  const detailElement = document.createElement('span');
  detailElement.className = 'texts-browse-card-detail';
  detailElement.textContent = detail;

  textContent.append(titleElement, detailElement);
  if (options.years) {
    const yearsElement = document.createElement('span');
    yearsElement.className = 'texts-browse-card-years';
    yearsElement.textContent = options.years;
    textContent.appendChild(yearsElement);
  }

  cardInner.appendChild(textContent);
  openButton.appendChild(cardInner);
  openButton.addEventListener('click', onClick);
  card.appendChild(openButton);
  if (options.favorite) card.appendChild(createTextFavoriteButton(options.favorite));
  return card;
}

function addTextBreadcrumb(label, action = null) {
  if (textsBreadcrumbs.childElementCount) {
    const separator = document.createElement('span');
    separator.setAttribute('aria-hidden', 'true');
    separator.textContent = '›';
    textsBreadcrumbs.appendChild(separator);
  }

  if (action) {
    const button = document.createElement('button');
    button.className = 'texts-breadcrumb-button';
    button.type = 'button';
    button.textContent = label;
    button.addEventListener('click', action);
    textsBreadcrumbs.appendChild(button);
  } else {
    const current = document.createElement('span');
    current.textContent = label;
    current.setAttribute('aria-current', 'page');
    textsBreadcrumbs.appendChild(current);
  }
}

function getTextWorks(author, languageGroup = textNavigation.languageGroup) {
  const works = new Map();
  const records = (textCatalog.length ? textCatalog : textDatabase)
    .filter(entry => entry.author === author && entry.languageGroup === languageGroup)
    .map(entry => textDocumentCache.get(entry.path) || entry);
  records.forEach(entry => {
    if (!works.has(entry.title)) works.set(entry.title, []);
    works.get(entry.title).push(entry);
  });
  const collator = new Intl.Collator(languageGroup === 'gr' ? 'el' : 'en', {
    sensitivity: 'base',
    numeric: true
  });
  return [...works.entries()]
    .map(([title, records]) => ({ title, records }))
    .sort((left, right) => {
      const leftFavorite = isTextFavorite(createTextFavorite('work', {
        languageGroup,
        author,
        work: left.title,
        title: left.title
      }));
      const rightFavorite = isTextFavorite(createTextFavorite('work', {
        languageGroup,
        author,
        work: right.title,
        title: right.title
      }));
      if (leftFavorite !== rightFavorite) return leftFavorite ? -1 : 1;
      return collator.compare(left.title, right.title);
    });
}

function getTextVolumes(records) {
  const volumes = new Map();
  records.forEach(record => {
    const key = record.volume;
    if (!volumes.has(key)) {
      const label = `Volumul ${record.volume}`;
      volumes.set(key, { key, label, records: [] });
    }
    volumes.get(key).records.push(record);
  });
  return [...volumes.values()];
}

function getTextFavoriteKey(type, favorite) {
  return JSON.stringify([
    type,
    favorite.languageGroup,
    favorite.author,
    favorite.work || '',
    favorite.volumeKey || '',
    favorite.recordPath || '',
    favorite.chapterNumber || ''
  ]);
}

function createTextFavorite(type, details) {
  return {
    ...details,
    type,
    key: getTextFavoriteKey(type, details)
  };
}

function createTextChapterFavorite(record, chapter, volumeKey) {
  return createTextFavorite('chapter', {
    languageGroup: record.languageGroup,
    author: record.author,
    work: record.title,
    volumeKey,
    recordPath: record.path,
    chapterNumber: String(chapter.number),
    title: `Capitolul ${chapter.number}${chapter.heading ? ` — ${chapter.heading}` : ''}`
  });
}

function isValidTextFavorite(favorite) {
  if (!favorite || typeof favorite !== 'object' || Array.isArray(favorite)
    || !['author', 'work', 'volume', 'chapter'].includes(favorite.type)
    || !['gr', 'lat'].includes(favorite.languageGroup)
    || typeof favorite.author !== 'string' || !favorite.author.trim()
    || typeof favorite.title !== 'string' || !favorite.title.trim()) {
    return false;
  }

  if (favorite.type !== 'author' && (typeof favorite.work !== 'string' || !favorite.work.trim())) {
    return false;
  }
  if (['volume', 'chapter'].includes(favorite.type)
    && (typeof favorite.volumeKey !== 'string' || !favorite.volumeKey)) {
    return false;
  }
  if (favorite.type === 'chapter'
    && (typeof favorite.recordPath !== 'string' || !favorite.recordPath
      || typeof favorite.chapterNumber !== 'string' || !favorite.chapterNumber)) {
    return false;
  }

  return favorite.key === getTextFavoriteKey(favorite.type, favorite);
}

function loadTextFavorites() {
  try {
    const stored = localStorage.getItem(textFavoriteStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new TypeError('Lista textelor favorite salvată nu are formatul așteptat.');
    }
    return parsed.filter(isValidTextFavorite);
  } catch (error) {
    textFavoriteStorageError = error;
    console.error('Nu s-au putut încărca textele favorite.', error);
    return [];
  }
}

function saveTextFavorites() {
  try {
    localStorage.setItem(textFavoriteStorageKey, JSON.stringify(textFavorites));
    textFavoriteStorageError = null;
    return true;
  } catch (error) {
    textFavoriteStorageError = error;
    console.error('Nu s-au putut salva textele favorite.', error);
    return false;
  }
}

function isTextFavorite(favorite) {
  return textFavorites.some(item => item.key === favorite.key);
}

function updateTextFavoriteButton(button, favorite) {
  const active = isTextFavorite(favorite);
  button.textContent = active ? '★' : '☆';
  button.setAttribute('aria-pressed', String(active));
  button.setAttribute('aria-label', active
    ? `Elimină „${favorite.title}” din favorite`
    : `Adaugă „${favorite.title}” la favorite`);
  button.title = active ? 'Elimină din favorite' : 'Adaugă la favorite';
}

function createTextFavoriteButton(favorite) {
  const button = document.createElement('button');
  button.className = 'texts-browse-card-favorite';
  button.type = 'button';
  updateTextFavoriteButton(button, favorite);
  button.addEventListener('click', event => {
    event.stopPropagation();
    toggleTextFavorite(favorite, button);
  });
  return button;
}

function toggleTextFavorite(favorite, button = null) {
  const existingIndex = textFavorites.findIndex(item => item.key === favorite.key);
  if (existingIndex >= 0) textFavorites.splice(existingIndex, 1);
  else textFavorites.unshift(favorite);

  const saved = saveTextFavorites();
  if (button) updateTextFavoriteButton(button, favorite);
  if (showingTextFavoritesPage) renderTextFavoritesPage();
  else if ((favorite.type === 'author' && textNavigation.level === 'authors')
    || (favorite.type === 'work' && textNavigation.level === 'works')
    || (favorite.type === 'chapter' && textNavigation.level === 'chapters')) {
    renderTextBrowser();
  }

  setTextsSearchStatus(saved
    ? (existingIndex >= 0 ? 'Eliminat din favorite.' : 'Adăugat la favorite.')
    : 'Favoritele nu s-au putut salva pe acest dispozitiv.', saved ? '' : 'error');
}

function showTextCollections() {
  cancelTextNavigationLoad();
  textNavigation = { level: 'collections', languageGroup: '', author: '', work: '', volume: '' };
  activeTextChapter = null;
  pushTextBrowserHistoryState();
  renderTextBrowser();
}

function showTextAuthors(languageGroup) {
  cancelTextNavigationLoad();
  textNavigation = { level: 'authors', languageGroup, author: '', work: '', volume: '' };
  activeTextChapter = null;
  pushTextBrowserHistoryState();
  renderTextBrowser();
}

function showAuthorWorks(author) {
  cancelTextNavigationLoad();
  textNavigation = {
    level: 'works',
    languageGroup: textNavigation.languageGroup,
    author,
    work: '',
    volume: ''
  };
  activeTextChapter = null;
  setTextsSearchStatus('');
  pushTextBrowserHistoryState();
  renderTextBrowser();
}

async function showWorkVolumes(work) {
  const requestId = ++textNavigationLoadId;
  textNavigationLoading = true;
  textNavigation.work = work;
  textNavigation.volume = '';
  textNavigation.level = 'volumes';
  activeTextChapter = null;
  pushTextBrowserHistoryState();
  renderTextBrowser();
  const workReferences = textCatalog.filter(entry =>
    entry.languageGroup === textNavigation.languageGroup
    && entry.author === textNavigation.author
    && entry.title === work
  );
  setTextsSearchStatus('Se încarcă capitolele operei…');
  const loadedRecords = await loadTextDocuments(workReferences);
  if (requestId !== textNavigationLoadId) return;
  textNavigationLoading = false;
  if (!loadedRecords.length) {
    renderTextBrowser();
    return;
  }

  const selectedWork = getTextWorks(textNavigation.author, textNavigation.languageGroup)
    .find(item => item.title === work);
  const volumes = getTextVolumes(selectedWork?.records || []);
  if (volumes.length === 1) {
    showVolumeChapters(volumes[0].key, true);
    return;
  }
  renderTextBrowser();
}

function showVolumeChapters(volumeKey, replaceHistory = false) {
  cancelTextNavigationLoad();
  textNavigation.volume = volumeKey;
  textNavigation.level = 'chapters';
  activeTextChapter = null;
  pushTextBrowserHistoryState(replaceHistory);
  renderTextBrowser();
}

function showTextChapter(record, chapter, replaceHistory = false) {
  cancelTextNavigationLoad();
  activeTextChapter = { record, chapter };
  textNavigation.level = 'chapter';
  pushTextBrowserHistoryState(replaceHistory);
  renderTextBrowser();
}

function cancelTextNavigationLoad() {
  textNavigationLoadId += 1;
  textNavigationLoading = false;
}

function goBackInTextHierarchy() {
  if (showingTextFavoritesPage) {
    showingTextFavoritesPage = false;
    renderTextsSearchResults(textsSearchInput.value);
    return;
  }

  if (textNavigation.level === 'authors') showTextCollections();
  else if (textNavigation.level === 'works') showTextAuthors(textNavigation.languageGroup);
  else if (textNavigation.level === 'volumes') showAuthorWorks(textNavigation.author);
  else if (textNavigation.level === 'chapters') {
    const records = getTextWorks(textNavigation.author, textNavigation.languageGroup)
      .find(work => work.title === textNavigation.work)?.records || [];
    if (getTextVolumes(records).length === 1) showAuthorWorks(textNavigation.author);
    else showWorkVolumes(textNavigation.work);
  } else if (textNavigation.level === 'chapter') {
    showVolumeChapters(textNavigation.volume);
  }
}

function getTextBrowserHistorySnapshot() {
  return {
    textNavigation: { ...textNavigation },
    activeChapter: activeTextChapter ? {
      recordPath: activeTextChapter.record.path,
      chapterNumber: String(activeTextChapter.chapter.number)
    } : null,
    showingTextFavoritesPage,
    showingSearchResults: !textsSearchResults.hidden && !showingTextFavoritesPage,
    searchQuery: textsSearchInput.value
  };
}

function pushTextBrowserHistoryState(replace = false) {
  if (window.location.hash !== '#texte') return;

  const currentState = window.history.state;
  const stateObject = currentState && typeof currentState === 'object' && !Array.isArray(currentState)
    ? currentState
    : {};
  const state = {
    ...stateObject,
    [TEXT_BROWSER_HISTORY_KEY]: getTextBrowserHistorySnapshot()
  };
  const method = replace ? 'replaceState' : 'pushState';
  window.history[method](state, '', window.location.href);
}

function initializeTextBrowserHistory() {
  if (window.location.hash !== '#texte') return;

  const snapshot = window.history.state?.[TEXT_BROWSER_HISTORY_KEY];
  if (snapshot) restoreTextBrowserHistoryState(snapshot);
  else pushTextBrowserHistoryState(true);
}

function restoreTextBrowserHistoryState(snapshot) {
  cancelTextNavigationLoad();
  const requestId = textNavigationLoadId;
  if (!snapshot?.textNavigation) {
    textNavigation = { level: 'collections', languageGroup: '', author: '', work: '', volume: '' };
    activeTextChapter = null;
    showingTextFavoritesPage = false;
    renderTextBrowser();
    pushTextBrowserHistoryState(true);
    return;
  }

  textNavigation = {
    level: 'collections',
    languageGroup: '',
    author: '',
    work: '',
    volume: '',
    ...snapshot.textNavigation
  };
  showingTextFavoritesPage = Boolean(snapshot.showingTextFavoritesPage);
  textsSearchInput.value = snapshot.searchQuery || '';
  activeTextChapter = null;

  if (showingTextFavoritesPage) {
    renderTextFavoritesPage();
    return;
  }
  if (snapshot.showingSearchResults) {
    renderTextsSearchResults(snapshot.searchQuery || '');
    return;
  }

  const chapter = snapshot.activeChapter;
  if (!chapter) {
    renderTextBrowser();
    return;
  }

  const activateChapter = record => {
    if (requestId !== textNavigationLoadId) return;
    const activeChapter = record?.chapters.find(item =>
      String(item.number) === chapter.chapterNumber
    );
    if (!record || !activeChapter) {
      textNavigationLoading = false;
      setTextsSearchStatus('Capitolul nu mai este disponibil în colecția de texte.', 'error');
      renderTextBrowser();
      return;
    }
    activeTextChapter = { record, chapter: activeChapter };
    textNavigationLoading = false;
    renderTextBrowser();
  };

  const cachedRecord = textDocumentCache.get(chapter.recordPath)
    || textDatabase.find(record => record.path === chapter.recordPath);
  if (cachedRecord) {
    activateChapter(cachedRecord);
    return;
  }

  textNavigationLoading = true;
  renderTextBrowser();
  void (async () => {
    if (!await loadTextCatalog()) {
      throw new Error('Catalogul textelor nu este disponibil.');
    }
    const reference = textCatalog.find(entry => entry.path === chapter.recordPath);
    if (!reference) {
      throw new Error('Documentul capitolului nu mai este disponibil în catalog.');
    }
    const records = await loadTextDocuments([reference]);
    if (requestId !== textNavigationLoadId) return;
    activateChapter(textDocumentCache.get(chapter.recordPath)
      || records.find(record => record.path === chapter.recordPath));
  })().catch(error => {
    if (requestId !== textNavigationLoadId) return;
    textNavigationLoading = false;
    console.error('Nu s-a putut restaura capitolul din istoricul de navigare.', error);
    setTextsSearchStatus('Capitolul nu s-a putut încărca. Înapoi și încearcă din nou.', 'error');
    renderTextBrowser();
  });
}

function navigateBackInTextBrowser() {
  if (window.location.hash === '#texte'
    && window.history.state?.[TEXT_BROWSER_HISTORY_KEY]
    && (showingTextFavoritesPage || textNavigation.level !== 'collections')) {
    window.history.back();
    return;
  }
  goBackInTextHierarchy();
}

window.addEventListener('popstate', event => {
  if (window.location.hash !== '#texte') return;
  restoreTextBrowserHistoryState(event.state?.[TEXT_BROWSER_HISTORY_KEY] || null);
});

function createTextBackButton(label, action) {
  const button = document.createElement('button');
  button.className = 'texts-back-button';
  button.type = 'button';
  button.textContent = `← ${label}`;
  button.addEventListener('click', action);
  return button;
}

function createTextChapterNavigation(chapters, currentIndex) {
  const navigation = document.createElement('nav');
  navigation.className = 'texts-chapter-navigation';
  navigation.setAttribute('aria-label', 'Navigare între capitolele volumului');

  const previousChapter = chapters[currentIndex - 1];
  const previousButton = document.createElement('button');
  previousButton.className = 'texts-chapter-nav-button';
  previousButton.type = 'button';
  previousButton.disabled = !previousChapter;
  previousButton.textContent = previousChapter
    ? `← Capitolul ${previousChapter.chapter.number}`
    : '← Anterior';
  previousButton.setAttribute('aria-label', previousChapter
    ? `Capitolul anterior, ${previousChapter.chapter.number}`
    : 'Nu există un capitol anterior în acest volum');
  if (previousChapter) {
    previousButton.addEventListener('click', () => {
      showTextChapter(previousChapter.record, previousChapter.chapter, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  const position = document.createElement('span');
  position.className = 'texts-chapter-position';
  position.textContent = currentIndex >= 0
    ? `Capitolul ${currentIndex + 1} din ${chapters.length}`
    : 'Capitol';

  const nextChapter = chapters[currentIndex + 1];
  const nextButton = document.createElement('button');
  nextButton.className = 'texts-chapter-nav-button';
  nextButton.type = 'button';
  nextButton.disabled = !nextChapter;
  nextButton.textContent = nextChapter
    ? `Capitolul ${nextChapter.chapter.number} →`
    : 'Următorul →';
  nextButton.setAttribute('aria-label', nextChapter
    ? `Capitolul următor, ${nextChapter.chapter.number}`
    : 'Nu există un capitol următor în acest volum');
  if (nextChapter) {
    nextButton.addEventListener('click', () => {
      showTextChapter(nextChapter.record, nextChapter.chapter, true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  navigation.append(previousButton, position, nextButton);
  return navigation;
}

function renderTextBreadcrumbs() {
  textsBreadcrumbs.replaceChildren();
  const level = textNavigation.level;
  addTextBreadcrumb('Colecții', level === 'collections' ? null : showTextCollections);

  if (level === 'collections') return;
  const group = textLanguageGroups.find(item => item.id === textNavigation.languageGroup);
  if (!group) return;
  addTextBreadcrumb(group.label, level === 'authors'
    ? null
    : () => showTextAuthors(textNavigation.languageGroup));

  if (level === 'authors') return;
  addTextBreadcrumb(textNavigation.author, level === 'works'
    ? null
    : () => showAuthorWorks(textNavigation.author));

  if (level === 'works') return;
  const workRecords = getTextWorks(textNavigation.author, textNavigation.languageGroup)
    .find(work => work.title === textNavigation.work)?.records || [];
  const volumes = getTextVolumes(workRecords);
  const hasSingleVolume = volumes.length === 1;
  addTextBreadcrumb(textNavigation.work, level === 'volumes'
    ? null
    : hasSingleVolume
      ? () => showAuthorWorks(textNavigation.author)
      : () => showWorkVolumes(textNavigation.work));

  if (level === 'volumes') return;
  if (hasSingleVolume) {
    if (level === 'chapter' && activeTextChapter) {
      addTextBreadcrumb(`Capitolul ${activeTextChapter.chapter.number}`);
    }
    return;
  }
  const volume = volumes.find(item => item.key === textNavigation.volume);
  if (!volume) return;

  addTextBreadcrumb(volume.label, level === 'chapters'
    ? null
    : () => showVolumeChapters(volume.key));

  if (level === 'chapter' && activeTextChapter) {
    addTextBreadcrumb(`Capitolul ${activeTextChapter.chapter.number}`);
  }
}

function linkifyTextWords(container, languageGroup) {
  const tokenPattern = /[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)*|[^\p{L}\p{M}]+/gu;
  const originalText = container.textContent;
  container.replaceChildren();

  for (const match of originalText.matchAll(tokenPattern)) {
    const token = match[0];
    if (/^[\p{L}\p{M}]+(?:[’'][\p{L}\p{M}]+)*$/u.test(token)) {
      const word = document.createElement('span');
      word.className = 'text-word-link';
      word.setAttribute('role', 'button');
      word.tabIndex = 0;
      word.textContent = token;
      word.addEventListener('click', () => {
        openTextDictionaryWord(token, languageGroup);
      });
      word.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          openTextDictionaryWord(token, languageGroup);
        }
      });
      container.appendChild(word);
    } else {
      container.appendChild(document.createTextNode(token));
    }
  }
}

function renderTextChapter() {
  if (!activeTextChapter) {
    if (textNavigationLoading) {
      const loading = document.createElement('p');
      loading.className = 'texts-empty-state';
      loading.setAttribute('role', 'status');
      loading.textContent = 'Se încarcă capitolul…';
      textsChapterView.appendChild(loading);
    }
    return;
  }
  const { record, chapter } = activeTextChapter;
  const work = getTextWorks(record.author, record.languageGroup).find(item => item.title === record.title);
  const volume = getTextVolumes(work?.records || [])
    .find(item => item.key === textNavigation.volume);
  const chapters = (volume?.records || [])
    .flatMap(volumeRecord => volumeRecord.chapters.map(volumeChapter => ({
      record: volumeRecord,
      chapter: volumeChapter
    })))
    .sort((left, right) => left.chapter.number.localeCompare(right.chapter.number, 'ro', { numeric: true }));
  const currentIndex = chapters.findIndex(item =>
    item.record.path === record.path && item.chapter.number === chapter.number
  );
  const title = document.createElement('h2');
  title.textContent = chapter.heading || `Capitolul ${chapter.number}`;
  const heading = document.createElement('div');
  heading.className = 'texts-chapter-heading';
  heading.appendChild(createTextBackButton('Înapoi la capitole', navigateBackInTextBrowser));
  heading.appendChild(title);
  heading.appendChild(createTextFavoriteButton(
    createTextChapterFavorite(record, chapter, textNavigation.volume)
  ));
  const workTitle = document.createElement('p');
  workTitle.className = 'texts-chapter-meta';
  workTitle.textContent = [record.title, record.author, `Volumul ${record.volume}`]
    .filter(Boolean).join(' · ');
  textsChapterView.append(heading, workTitle);

  const attribution = createTextAttribution(record);
  if (attribution) textsChapterView.appendChild(attribution);

  const chapterText = document.createElement('div');
  chapterText.className = 'texts-chapter-text';
  chapter.paragraphs.forEach(text => {
    const paragraph = document.createElement('p');
    paragraph.textContent = text;
    linkifyTextWords(paragraph, record.languageGroup);
    chapterText.appendChild(paragraph);
  });
  textsChapterView.append(chapterText, createTextChapterNavigation(chapters, currentIndex));
}

function renderTextBrowser() {
  const renderId = ++textDirectoryRenderId;
  if (showingTextFavoritesPage) {
    renderTextFavoritesPage();
    return;
  }

  textsBrowser.hidden = false;
  textsSearchResults.hidden = true;
  textsDirectoryList.replaceChildren();
  textsChapterView.replaceChildren();
  textsChapterView.hidden = textNavigation.level !== 'chapter';
  textsBreadcrumbs.hidden = textNavigation.level === 'collections';
  textsDirectoryHeading.hidden = textNavigation.level === 'collections' || textNavigation.level === 'chapter';
  textsBackButton.hidden = textNavigation.level === 'collections' || textNavigation.level === 'chapter';
  textsDailySection.hidden = textNavigation.level !== 'collections';
  textsBackButton.textContent = '← Înapoi';
  textsBackButton.setAttribute('aria-label', 'Înapoi la nivelul anterior');
  renderTextBreadcrumbs();

  if (textNavigation.level === 'collections') {
    textsDirectoryList.dataset.level = 'collections';
    textLanguageGroups.forEach(group => {
      const authors = new Set(textCatalog
        .filter(entry => entry.languageGroup === group.id)
        .map(entry => entry.author));
      const authorCount = authors.size;
      const card = createTextBrowseCard(
        group.label,
        authorCount ? `${authorCount} ${authorCount === 1 ? 'autor' : 'autori'}` : group.description,
        () => showTextAuthors(group.id)
      );
      card.classList.add('texts-collection-card');
      card.classList.add(`texts-collection-card-${group.id}`);
      textsDirectoryList.appendChild(card);
    });
    if (window.location.hash === '#texte') refreshTextHighlights();
    return;
  }

  textsDirectoryList.dataset.level = textNavigation.level;
  const group = textLanguageGroups.find(item => item.id === textNavigation.languageGroup);
  const groupRecords = textCatalog.filter(entry => entry.languageGroup === textNavigation.languageGroup);
  if (!group || !groupRecords.length) {
    textsDirectoryTitle.textContent = group ? group.label : 'Autori';
    const empty = document.createElement('p');
    empty.className = 'texts-empty-state';
    empty.textContent = group ? group.emptyMessage : 'Nu există încă texte în colecție.';
    textsDirectoryList.appendChild(empty);
    return;
  }

  if (textNavigation.level === 'authors') {
    textsDirectoryTitle.textContent = group.label;
    const authors = new Map();
    groupRecords.forEach(entry => {
      if (!authors.has(entry.author)) authors.set(entry.author, []);
      authors.get(entry.author).push(entry);
    });
    [...authors.entries()]
      .sort(([left], [right]) => {
        const leftFavorite = isTextFavorite(createTextFavorite('author', {
          languageGroup: textNavigation.languageGroup,
          author: left,
          title: left
        }));
        const rightFavorite = isTextFavorite(createTextFavorite('author', {
          languageGroup: textNavigation.languageGroup,
          author: right,
          title: right
        }));
        if (leftFavorite !== rightFavorite) return leftFavorite ? -1 : 1;
        return left.localeCompare(right, 'ro');
      })
      .forEach(([author, records]) => {
        const workCount = new Set(records.map(record => record.title)).size;
        const profile = authorProfiles[records[0].path.split('/')[1]]
          || Object.values(authorProfiles).find(item => item.name === author);
        const favorite = createTextFavorite('author', {
          languageGroup: textNavigation.languageGroup,
          author,
          title: author
        });
        const authorCard = createTextBrowseCard(
          author || 'Autor necunoscut',
          `${workCount} ${workCount === 1 ? 'operă' : 'opere'}`,
          () => showAuthorWorks(author),
          {
            ...(profile ? {
              imageUrl: profile.image,
              alt: profile.alt,
              years: profile.years,
              icon: profile.image ? undefined : (profile.icon || '🏛️')
            } : {}),
            favorite
          }
        );
        authorCard.classList.add('texts-author-card');
        authorCard.dataset.author = profile?.name || author;
        textsDirectoryList.appendChild(authorCard);
      });
    return;
  }

  if (textNavigation.level === 'works') {
    textsDirectoryTitle.textContent = `Opere — ${textNavigation.author}`;
    const profile = authorProfiles[textNavigation.author === 'Julius Caesar'
      ? 'Caesar'
      : Object.keys(authorProfiles).find(key =>
        authorProfiles[key].name === textNavigation.author
          || authorProfiles[key].name.includes(textNavigation.author)
          || textNavigation.author.includes(authorProfiles[key].name))]
      || authorProfiles[textNavigation.author];
    if (profile) {
      const profileCard = document.createElement('article');
      profileCard.className = 'texts-author-profile';
      profileCard.dataset.author = textNavigation.author;

      if (profile.image) {
        const image = document.createElement('img');
        image.className = 'texts-author-profile-image';
        image.src = profile.image;
        image.alt = profile.alt || profile.name;
        image.loading = 'lazy';
        image.decoding = 'async';
        image.addEventListener('error', () => {
          const fallback = document.createElement('div');
          fallback.className = 'texts-author-profile-icon';
          fallback.setAttribute('aria-label', 'Imagine indisponibilă');
          fallback.textContent = '🏛️';
          image.replaceWith(fallback);
        }, { once: true });
        profileCard.appendChild(image);
      } else {
        const icon = document.createElement('div');
        icon.className = 'texts-author-profile-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = profile.icon || '🏛️';
        profileCard.appendChild(icon);
      }

      const copy = document.createElement('div');
      copy.className = 'texts-author-profile-copy';
      const name = document.createElement('h3');
      name.textContent = profile.name;
      copy.appendChild(name);
      if (profile.years) {
        const years = document.createElement('p');
        years.className = 'texts-author-profile-years';
        years.textContent = profile.years;
        copy.appendChild(years);
      }
      if (profile.description) {
        const description = document.createElement('p');
        description.className = 'texts-author-profile-description';
        description.textContent = profile.description;
        copy.appendChild(description);
      }
      profileCard.appendChild(copy);
      textsDirectoryList.appendChild(profileCard);
    }
    getTextWorks(textNavigation.author, textNavigation.languageGroup).forEach(work => {
      const volumes = getTextVolumes(work.records);
      const chapterCount = work.records.reduce((count, record) => count + record.chapters.length, 0);
      const chaptersLoaded = work.records.every(record => record.chapters.length > 0);
      const detail = [
        work.records[0].language,
        chaptersLoaded
          ? `${chapterCount} ${chapterCount === 1 ? 'capitol' : 'capitole'}`
          : volumes.length > 1
            ? `${volumes.length} volume · deschide pentru capitole`
            : 'Deschide pentru capitole'
      ].filter(Boolean).join(' · ');
      textsDirectoryList.appendChild(createTextBrowseCard(
        work.title,
        detail,
        () => showWorkVolumes(work.title),
        {
          favorite: createTextFavorite('work', {
            languageGroup: textNavigation.languageGroup,
            author: textNavigation.author,
            work: work.title,
            title: work.title
          })
        }
      ));
    });
    return;
  }

  const workRecords = getTextWorks(textNavigation.author, textNavigation.languageGroup)
    .find(work => work.title === textNavigation.work)?.records || [];
  const volumes = getTextVolumes(workRecords);

  if (textNavigation.level === 'volumes') {
    textsDirectoryTitle.textContent = `Volume — ${textNavigation.work}`;
    if (textNavigationLoading) {
      const loadingMessage = document.createElement('p');
      loadingMessage.className = 'texts-empty-state';
      loadingMessage.setAttribute('role', 'status');
      loadingMessage.textContent = 'Se încarcă capitolele operei…';
      textsDirectoryList.appendChild(loadingMessage);
      return;
    }
    if (!volumes.some(item => item.records.some(record => record.chapters.length))) {
      const empty = document.createElement('p');
      empty.className = 'texts-empty-state';
      empty.textContent = 'Capitolele operei nu s-au putut încărca. Înapoi și încearcă din nou.';
      textsDirectoryList.appendChild(empty);
      return;
    }
    volumes.forEach(volume => {
      const chapterCount = volume.records.reduce((count, record) => count + record.chapters.length, 0);
      textsDirectoryList.appendChild(createTextBrowseCard(
        volume.label,
        `${chapterCount} ${chapterCount === 1 ? 'capitol' : 'capitole'}`,
        () => showVolumeChapters(volume.key),
        {
          favorite: createTextFavorite('volume', {
            languageGroup: textNavigation.languageGroup,
            author: textNavigation.author,
            work: textNavigation.work,
            volumeKey: volume.key,
            title: volume.label
          })
        }
      ));
    });
    return;
  }

  const volume = volumes.find(item => item.key === textNavigation.volume);
  if (!volume) {
    showTextAuthors(textNavigation.languageGroup);
    return;
  }

  if (textNavigation.level === 'chapters') {
    textsDirectoryTitle.textContent = `Capitole — ${volumes.length === 1 ? textNavigation.work : volume.label}`;
    const chapters = volume.records
      .flatMap(record => record.chapters.map(chapter => ({ record, chapter })))
      .sort((left, right) => {
        const leftFavorite = isTextFavorite(createTextChapterFavorite(
          left.record,
          left.chapter,
          textNavigation.volume
        ));
        const rightFavorite = isTextFavorite(createTextChapterFavorite(
          right.record,
          right.chapter,
          textNavigation.volume
        ));
        if (leftFavorite !== rightFavorite) return leftFavorite ? -1 : 1;
        return left.chapter.number.localeCompare(right.chapter.number, 'ro', { numeric: true });
      });
    let nextChapterIndex = 0;
    const renderChapterBatch = () => {
      if (renderId !== textDirectoryRenderId
        || textNavigation.level !== 'chapters'
        || showingTextFavoritesPage) return;

      const fragment = document.createDocumentFragment();
      const batch = chapters.slice(nextChapterIndex, nextChapterIndex + TEXT_CHAPTER_RENDER_BATCH_SIZE);
      batch.forEach(({ record, chapter }) => {
        const detail = chapter.heading || chapter.text.slice(0, 100);
        const favorite = createTextChapterFavorite(record, chapter, textNavigation.volume);
        fragment.appendChild(createTextBrowseCard(
          `Capitolul ${chapter.number}`,
          detail,
          () => showTextChapter(record, chapter),
          { favorite }
        ));
      });
      textsDirectoryList.appendChild(fragment);
      nextChapterIndex += batch.length;
      if (nextChapterIndex < chapters.length) {
        requestAnimationFrame(renderChapterBatch);
      }
    };
    renderChapterBatch();
    return;
  }

  renderTextChapter();
}

function renderTextFavoritesPage() {
  textsBrowser.hidden = false;
  textsSearchResults.hidden = true;
  textsDailySection.hidden = true;
  textsDirectoryList.replaceChildren();
  textsChapterView.replaceChildren();
  textsChapterView.hidden = true;
  textsBreadcrumbs.hidden = true;
  textsDirectoryHeading.hidden = false;
  textsDirectoryTitle.textContent = 'Favorite în texte';
  textsBackButton.hidden = false;
  textsBackButton.textContent = '← Înapoi la texte';
  textsBackButton.setAttribute('aria-label', 'Înapoi la texte');

  if (textFavoriteStorageError) {
    const warning = document.createElement('p');
    warning.className = 'favorites-error';
    warning.setAttribute('role', 'status');
    warning.textContent = 'Lista favoritelor nu poate fi accesată pe acest dispozitiv.';
    textsDirectoryList.appendChild(warning);
  }

  const visibleFavorites = textFavorites.filter(favorite => favorite.type !== 'author');
  if (!visibleFavorites.length) {
    const empty = document.createElement('p');
    empty.className = 'favorite-empty';
    empty.textContent = 'Nu ai adăugat încă opere, volume sau capitole la favorite.';
    textsDirectoryList.appendChild(empty);
    return;
  }

  visibleFavorites.forEach(favorite => {
    const typeLabel = favorite.type === 'work' ? 'Operă'
      : favorite.type === 'volume' ? 'Volum' : 'Capitol';
    const detail = [
      typeLabel,
      favorite.author,
      favorite.work && favorite.type !== 'work' ? favorite.work : ''
    ].filter(Boolean).join(' · ');
    textsDirectoryList.appendChild(createTextBrowseCard(
      favorite.title,
      detail,
      () => openTextFavorite(favorite),
      { favorite }
    ));
  });
}

async function openTextFavorite(favorite) {
  cancelTextNavigationLoad();
  showingTextFavoritesPage = false;
  navigateToSitePage('texts');
  setTextsSearchStatus('Se încarcă textele…');
  if (!await loadTextCatalog()) {
    showingTextFavoritesPage = true;
    renderTextFavoritesPage();
    return;
  }
  const workReferences = textCatalog.filter(entry =>
    entry.languageGroup === favorite.languageGroup
    && entry.author === favorite.author
    && entry.title === favorite.work
  );
  const loadedRecords = await loadTextDocuments(workReferences);
  if (!loadedRecords.length) {
    showingTextFavoritesPage = true;
    renderTextFavoritesPage();
    return;
  }

  const work = getTextWorks(favorite.author, favorite.languageGroup)
    .find(item => item.title === favorite.work);
  if (!work) {
    showingTextFavoritesPage = true;
    renderTextFavoritesPage();
    setTextsSearchStatus('Favoritul nu mai este disponibil în colecția de texte.', 'error');
    return;
  }

  textNavigation = {
    level: 'works',
    languageGroup: favorite.languageGroup,
    author: favorite.author,
    work: '',
    volume: ''
  };
  activeTextChapter = null;
  if (favorite.type === 'work') {
    showWorkVolumes(favorite.work);
    return;
  }

  showWorkVolumes(favorite.work);
  const volume = getTextVolumes(work.records).find(item => item.key === favorite.volumeKey);
  if (!volume) {
    showingTextFavoritesPage = true;
    renderTextFavoritesPage();
    setTextsSearchStatus('Favoritul nu mai este disponibil în colecția de texte.', 'error');
    return;
  }
  if (favorite.type === 'volume') {
    showVolumeChapters(volume.key);
    return;
  }

  const record = volume.records.find(item => item.path === favorite.recordPath);
  const chapter = record?.chapters.find(item => String(item.number) === favorite.chapterNumber);
  if (!record || !chapter) {
    showingTextFavoritesPage = true;
    renderTextFavoritesPage();
    setTextsSearchStatus('Favoritul nu mai este disponibil în colecția de texte.', 'error');
    return;
  }
  showVolumeChapters(volume.key);
  showTextChapter(record, chapter);
}

async function updateTextAutocomplete(query) {
  const normalizedQuery = normalizeTextSearch(query);
  textsAutocompleteList.replaceChildren();
  if (!normalizedQuery) {
    textsAutocomplete.classList.remove('active');
    return;
  }

  if (!textCatalogLoaded) {
    await loadTextCatalog();
  }
  if (textsSearchInput.value !== query) return;

  const suggestions = [];
  const seen = new Set();
  textCatalog.forEach(entry => {
    const author = entry.author?.trim();
    const work = entry.title?.trim();

    if (author && normalizeTextSearch(author).startsWith(normalizedQuery)) {
      const key = `author\0${entry.languageGroup}\0${author}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({ type: 'author', label: author, languageGroup: entry.languageGroup });
      }
    }

    if (work && matchesTextTitlePrefix(work, query, entry.languageGroup)) {
      const key = `work\0${entry.languageGroup}\0${author}\0${work}`;
      if (!seen.has(key)) {
        seen.add(key);
        suggestions.push({
          type: 'work',
          label: work,
          languageGroup: entry.languageGroup,
          author
        });
      }
    }
  });

  suggestions.sort((left, right) => left.label.localeCompare(right.label, 'ro'));

  const visibleSuggestions = suggestions.slice(0, 5);
  if (!visibleSuggestions.length) {
    textsAutocomplete.classList.remove('active');
    return;
  }

  textsAutocompleteTitle.textContent = `Recomandări pentru „${query.trim()}” (${visibleSuggestions.length})`;
  visibleSuggestions.forEach(suggestion => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'texts-autocomplete-item';
    const label = document.createElement('span');
    label.className = 'texts-autocomplete-label';
    label.textContent = suggestion.label;
    const type = document.createElement('span');
    type.className = 'texts-autocomplete-type';
    type.textContent = suggestion.type === 'author' ? 'Autor' : 'Text';
    button.append(label, type);
    button.addEventListener('click', () => openTextSuggestion(suggestion));
    textsAutocompleteList.appendChild(button);
  });
  textsAutocomplete.classList.add('active');
}

function openTextSuggestion(suggestion) {
  textsAutocomplete.classList.remove('active');
  textsSearchInput.value = suggestion.label;
  textNavigation = {
    level: suggestion.type === 'author' ? 'works' : 'volumes',
    languageGroup: suggestion.languageGroup,
    author: suggestion.author || suggestion.label,
    work: suggestion.type === 'work' ? suggestion.label : '',
    volume: ''
  };
  activeTextChapter = null;
  if (suggestion.type === 'author') showAuthorWorks(suggestion.label);
  else showWorkVolumes(suggestion.label);
}

async function renderTextsSearchResults(query) {
  textsSearchResults.replaceChildren();
  textsAutocomplete.classList.remove('active');
  if (showingTextFavoritesPage) {
    renderTextFavoritesPage();
    setTextsSearchStatus('');
    return;
  }

  const normalizedQuery = normalizeTextSearch(query);

  if (!normalizedQuery) {
    renderTextBrowser();
    setTextsSearchStatus('');
    return;
  }

  textsBrowser.hidden = true;
  textsSearchResults.hidden = false;
  if (!textDatabaseLoaded) {
    setTextsSearchStatus('Se caută în textele accesate…');
    await loadTextDatabase();
  }
  const matches = textDatabase.filter(entry => {
    const searchableContent = [entry.title, entry.author || '', entry.language || '', entry.text].join(' ');
    return matchesTextSearch(searchableContent, query, entry.languageGroup);
  });

  if (!matches.length) {
    setTextsSearchStatus('Nu am găsit texte care să corespundă căutării.');
    return;
  }

  matches.forEach(entry => textsSearchResults.appendChild(createTextResultCard(entry, query)));
  setTextsSearchStatus(`${matches.length} ${matches.length === 1 ? 'rezultat găsit' : 'rezultate găsite'}.`);
}

function getTextCatalogEntry(reference) {
  const pathParts = reference.path.split('/');
  const languageGroup = pathParts[0];
  const folderAuthor = pathParts[1] || '';
  const profile = authorProfiles[folderAuthor];
  const author = profile?.name || reference.author || folderAuthor;
  const title = typeof reference.title === 'string' ? reference.title.trim() : '';
  return {
    ...reference,
    title,
    author,
    language: getTextLanguage(reference.language, languageGroup),
    languageGroup,
    volume: reference.volume === undefined ? '1' : String(reference.volume),
    chapters: [],
    text: ''
  };
}

async function loadTextCatalog() {
  if (textCatalogLoadPromise) return textCatalogLoadPromise;
  if (textCatalogLoaded) return true;

  textCatalogLoadPromise = (async () => {
    try {
      await loadAuthorProfiles();
      let references = [];
      try {
        const discoveryResponse = await fetch('/api/texts');
        if (discoveryResponse.ok) {
          references = validateTextDatabase(await discoveryResponse.json());
        }
      } catch (error) {
        console.info('Descoperirea dinamică a textelor nu este disponibilă; se folosește manifestul local.', error);
      }

      if (!references.length || references.some(reference =>
        !reference.title || !reference.language || reference.volume === undefined
      )) {
        const manifestResponse = await fetch('data/texte/texte.json');
        if (!manifestResponse.ok) throw new Error(`Răspuns HTTP ${manifestResponse.status}`);
        const manifestReferences = validateTextDatabase(await manifestResponse.json());
        if (!references.length) {
          references = manifestReferences;
        } else {
          const metadataByPath = new Map(manifestReferences.map(reference => [reference.path, reference]));
          references = references.map(reference => {
            const metadata = metadataByPath.get(reference.path) || {};
            return {
              ...metadata,
              ...reference,
              title: reference.title || metadata.title,
              author: reference.author || metadata.author,
              language: reference.language || metadata.language,
              volume: reference.volume ?? metadata.volume
            };
          });
        }
      }

      textCatalog = references.map(getTextCatalogEntry);
      if (!textCatalog.length) throw new Error('Manifestul de texte nu conține documente.');
      textCatalogLoaded = true;
      if (window.location.hash === '#texte'
        && !textsSearchInput.value.trim()
        && !showingTextFavoritesPage) {
        renderTextBrowser();
      }
      return true;
    } catch (error) {
      textCatalogLoaded = false;
      console.error('Nu s-a putut încărca catalogul de texte.', error);
      setTextsSearchStatus('Nu s-a putut încărca lista de texte. Verifică manifestul și reîncearcă.', 'error');
      return false;
    } finally {
      textCatalogLoadPromise = null;
    }
  })();
  return textCatalogLoadPromise;
}

function loadAndCacheTextDocument(reference) {
  if (textDocumentCache.has(reference.path)) {
    return Promise.resolve(textDocumentCache.get(reference.path));
  }
  if (textDocumentLoadPromises.has(reference.path)) {
    return textDocumentLoadPromises.get(reference.path);
  }

  const promise = loadTextDocument(reference).then(document => {
    textDocumentCache.set(reference.path, document);
    if (!textDatabase.some(entry => entry.path === document.path)) textDatabase.push(document);
    return document;
  }).finally(() => textDocumentLoadPromises.delete(reference.path));
  textDocumentLoadPromises.set(reference.path, promise);
  return promise;
}

async function loadTextDocuments(references) {
  const pending = references
    .filter(reference => !textDocumentCache.has(reference.path))
    .filter((reference, index, list) =>
      list.findIndex(item => item.path === reference.path) === index);

  const results = await Promise.allSettled(pending.map(loadAndCacheTextDocument));
  const failures = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason);
  if (failures.length) {
    console.error('Unele documente nu au putut fi încărcate.', failures);
    setTextsSearchStatus(
      `Nu s-au putut încărca ${failures.length} ${failures.length === 1 ? 'document' : 'documente'} text. Reîncearcă mai târziu.`,
      'error'
    );
  } else {
    setTextsSearchStatus('');
  }

  return references
    .map(reference => textDocumentCache.get(reference.path))
    .filter(Boolean);
}

async function chooseRandomTextExcerpt(languageGroup) {
  if (!textCatalogLoaded && !await loadTextCatalog()) {
    throw new Error('Catalogul textelor nu este disponibil.');
  }
  const references = textCatalog.filter(entry => entry.languageGroup === languageGroup);
  if (!references.length) throw new Error('Nu există texte pentru această limbă.');

  let lastError = null;
  const remainingReferences = [...references];
  while (remainingReferences.length) {
    const reference = randomItem(remainingReferences);
    remainingReferences.splice(remainingReferences.indexOf(reference), 1);
    let document;
    try {
      document = await loadAndCacheTextDocument(reference);
    } catch (error) {
      lastError = error;
      console.warn(`Nu s-a putut încărca fragmentul din ${reference.path}.`, error);
      continue;
    }

    const paragraphs = document.chapters.flatMap(chapter =>
      chapter.paragraphs
        .filter(paragraph => paragraph.trim())
        .map(paragraph => ({ paragraph, chapter }))
    );
    if (!paragraphs.length) continue;

    const options = paragraphs.filter(({ paragraph, chapter }) =>
      `${document.path}:${chapter.number}:${paragraph}` !== previousTextSelections[languageGroup]
    );
    const selected = randomItem(options.length ? options : paragraphs);
    previousTextSelections[languageGroup] =
      `${document.path}:${selected.chapter.number}:${selected.paragraph}`;
    return {
      text: completeTextExcerpt(selected.paragraph),
      author: document.author,
      title: document.title,
      chapter: selected.chapter,
      record: document
    };
  }

  if (lastError) {
    throw new Error(`Nu s-a putut încărca niciun text: ${lastError.message}`, { cause: lastError });
  }
  throw new Error('Nu există paragrafe disponibile în textele acestei limbi.');
}

function createTextHighlightCard(languageGroup, selection) {
  const card = document.createElement('article');
  card.className = 'daily-selection-card daily-text-card';
  card.dataset.dailyLanguage = languageGroup;
  const heading = document.createElement('h3');
  heading.textContent = languageGroup === 'gr' ? 'Greacă veche' : 'Latină';
  const quote = document.createElement('blockquote');
  quote.className = 'daily-selection-quote';
  const quoteLink = document.createElement('button');
  quoteLink.type = 'button';
  quoteLink.className = 'daily-text-link';
  quoteLink.textContent = selection.text;
  quoteLink.setAttribute('aria-label', `Deschide textul „${selection.title}”, ${selection.chapter.heading || `capitolul ${selection.chapter.number}`}`);
  quoteLink.addEventListener('click', () => openHighlightedText(selection));
  quote.appendChild(quoteLink);
  const attribution = document.createElement('p');
  attribution.className = 'daily-selection-attribution';
  const chapterLabel = selection.chapter.heading
    ? ` — ${selection.chapter.heading}`
    : ` — capitolul ${selection.chapter.number}`;
  const attributionText = [selection.author, selection.title].filter(Boolean).join(' · ');
  if (attributionText) {
    const attributionLink = document.createElement('button');
    attributionLink.type = 'button';
    attributionLink.className = 'daily-attribution-link';
    attributionLink.textContent = attributionText;
    attributionLink.setAttribute('aria-label', `Deschide textul de bază „${selection.title}”`);
    attributionLink.addEventListener('click', () => openHighlightedText(selection));
    attribution.append(attributionLink);
  }
  attribution.append(document.createTextNode(chapterLabel));
  const footer = document.createElement('div');
  footer.className = 'daily-text-footer';
  footer.append(attribution, createDailyCardRefreshButton(
    `Reîmprospătează fragmentul din ${languageGroup === 'gr' ? 'greacă veche' : 'latină'}`,
    () => refreshTextHighlight(languageGroup)
  ));
  card.append(heading, quote, footer);
  return card;
}

function openHighlightedText(selection) {
  const record = selection.record;
  if (!record?.chapters?.length) return;

  showingTextFavoritesPage = false;
  navigateToSitePage('texts');
  textNavigation = {
    level: 'chapters',
    languageGroup: record.languageGroup,
    author: record.author,
    work: record.title,
    volume: String(record.volume)
  };
  activeTextChapter = null;
  pushTextBrowserHistoryState();
  textNavigation.level = 'chapter';
  activeTextChapter = { record, chapter: selection.chapter };
  pushTextBrowserHistoryState();
  renderTextBrowser();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function refreshTextHighlight(languageGroup) {
  const currentCard = textsDailyCards.querySelector(`[data-daily-language="${languageGroup}"]`);
  try {
    if (!textCatalogLoaded && !await loadTextCatalog()) {
      throw new Error('Catalogul textelor nu este disponibil.');
    }
    const selection = await chooseRandomTextExcerpt(languageGroup);
    const nextCard = createTextHighlightCard(languageGroup, selection);
    if (currentCard?.isConnected) currentCard.replaceWith(nextCard);
    else textsDailyCards.appendChild(nextCard);
  } catch (error) {
    console.error(`Nu s-a putut reîmprospăta fragmentul pentru ${languageGroup}.`, error);
    const title = languageGroup === 'gr' ? 'Greacă veche' : 'Latină';
    const nextCard = createDailyMessageCard(
      title,
      'Nu s-a putut încărca un fragment. Reîncearcă.',
      true,
      () => refreshTextHighlight(languageGroup),
      languageGroup
    );
    if (currentCard?.isConnected) currentCard.replaceWith(nextCard);
    else textsDailyCards.appendChild(nextCard);
  }
}

async function refreshTextHighlights(force = false) {
  if (textsDailyLoadPromise) return textsDailyLoadPromise;
  if (textsDailyLoaded && !force) return;

  textsDailySection.hidden = textNavigation.level !== 'collections' || showingTextFavoritesPage;
  textsDailyCards.replaceChildren(
    createDailyMessageCard('Greacă veche', 'Se caută un fragment…', false, () => refreshTextHighlight('gr'), 'gr'),
    createDailyMessageCard('Latină', 'Se caută un fragment…', false, () => refreshTextHighlight('lat'), 'lat')
  );
  const request = (async () => {
    const results = await Promise.all(['gr', 'lat'].map(async languageGroup => {
      try {
        return { languageGroup, selection: await chooseRandomTextExcerpt(languageGroup) };
      } catch (error) {
        console.error(`Nu s-a putut alege fragmentul pentru ${languageGroup}.`, error);
        return { languageGroup, error };
      }
    }));

    textsDailyCards.replaceChildren(...results.map(result =>
      result.selection
        ? createTextHighlightCard(result.languageGroup, result.selection)
        : createDailyMessageCard(
          result.languageGroup === 'gr' ? 'Greacă veche' : 'Latină',
          'Nu s-a putut încărca un fragment. Reîncearcă.',
          true,
          () => refreshTextHighlight(result.languageGroup),
          result.languageGroup
        )
    ));
    textsDailyLoaded = results.every(result => Boolean(result.selection));
  })();
  textsDailyLoadPromise = request;
  try {
    await request;
  } finally {
    if (textsDailyLoadPromise === request) textsDailyLoadPromise = null;
  }
}

async function loadTextDatabase() {
  if (textDatabaseLoadPromise) return textDatabaseLoadPromise;
  if (textDatabaseLoaded) return true;

  textDatabaseLoaded = true;
  setTextsSearchStatus('Se încarcă textele…');
  textDatabaseLoadPromise = (async () => {
    try {
      if (!textCatalogLoaded && !await loadTextCatalog()) {
        throw new Error('Catalogul textelor nu este disponibil.');
      }
      const loadedDocuments = await Promise.allSettled(
        textCatalog.map(reference => loadAndCacheTextDocument(reference))
      );
      const failedDocuments = loadedDocuments
        .filter(result => result.status === 'rejected')
        .map(result => result.reason);
      if (failedDocuments.length) {
        console.error('Unele documente nu au putut fi încărcate.', failedDocuments);
      }
      if (!textDatabase.length) {
        throw new Error(failedDocuments[0]?.message || 'Nu s-a putut încărca niciun document.');
      }
      if (showingTextFavoritesPage) {
        renderTextFavoritesPage();
        setTextsSearchStatus('');
      }
      return true;
    } catch (error) {
      textDatabaseLoaded = false;
      console.error('Nu s-a putut încărca baza de texte.', error);
      setTextsSearchStatus('Nu s-au putut încărca documentele. Verifică data/texte/texte.json și reîncearcă.', 'error');
      return false;
    }
  })();
  const loadPromise = textDatabaseLoadPromise;
  const loaded = await loadPromise;
  if (textDatabaseLoadPromise === loadPromise) textDatabaseLoadPromise = null;
  return loaded;
}

