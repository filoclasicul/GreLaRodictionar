function truncateFeaturedText(value, limit = 320) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  if (characters.length <= limit) return text;
  const excerpt = characters.slice(0, limit).join('');
  const lastSpace = excerpt.lastIndexOf(' ');
  return `${excerpt.slice(0, lastSpace > limit * 0.65 ? lastSpace : limit).trimEnd()}…`;
}

function decodeDictionaryText(value) {
  dictionaryTextDecoder.innerHTML = String(value ?? '');
  return dictionaryTextDecoder.textContent.replace(/<br\s*\/?>/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function loadDictionaryCatalog() {
  if (dictionaryCatalog) return dictionaryCatalog;
  if (!dictionaryCatalogLoadPromise) {
    dictionaryCatalogLoadPromise = (async () => {
      const response = await fetch('data/litere/catalog.json', { cache: 'force-cache' });
      if (!response.ok) throw new Error(`Catalogul dicționarelor: HTTP ${response.status}`);
      const catalog = await response.json();
      for (const language of ['lat', 'gr']) {
        if (!Array.isArray(catalog?.[language])
          || !catalog[language].length
          || catalog[language].some(letter => typeof letter !== 'string' || !/^\p{L}+$/u.test(letter))) {
          throw new TypeError(`Catalogul nu conține litere valide pentru ${language}.`);
        }
      }
      dictionaryCatalog = catalog;
      return catalog;
    })();
  }

  try {
    return await dictionaryCatalogLoadPromise;
  } catch (error) {
    dictionaryCatalogLoadPromise = null;
    throw error;
  }
}

async function chooseRandomDictionaryEntry(language, catalog) {
  const letter = randomItem(catalog[language]);
  const target = buildDictionaryTargets(letter, language)[0];
  if (!target) throw new Error(`Nu există un fișier de dicționar pentru litera ${letter}.`);
  await loadDictionaryTarget(target);

  const languageName = language === 'gr' ? 'Greacă Veche' : 'Latină';
  const entries = Object.values(lexiconData).filter(entry =>
    entry.lang === languageName
    && getDictionaryFileLetter(entry.lemmaKey) === letter
    && entry.defs?.some(definition => decodeDictionaryText(definition))
  );
  if (!entries.length) throw new Error(`Nu există definiții disponibile pentru litera ${letter}.`);

  const freshEntries = entries.filter(entry => entry.lemmaKey !== previousDailyLemmas[language]);
  const selected = randomItem(freshEntries.length ? freshEntries : entries);
  previousDailyLemmas[language] = selected.lemmaKey;
  return selected;
}

function createDailyWordCard(language, entry) {
  const card = document.createElement('article');
  card.className = 'daily-selection-card';
  card.dataset.dailyLanguage = language;
  const table = document.createElement('table');
  table.className = 'daily-selection-table';
  const caption = document.createElement('caption');
  caption.textContent = `Cuvântul ${language === 'gr' ? 'grecesc' : 'latin'} al zilei`;
  table.appendChild(caption);
  const body = document.createElement('tbody');
  const addRow = (label, value) => {
    if (!value) return;
    const row = document.createElement('tr');
    const heading = document.createElement('th');
    heading.scope = 'row';
    heading.textContent = label;
    const cell = document.createElement('td');
    cell.textContent = value;
    row.append(heading, cell);
    body.appendChild(row);
  };
  const wordRow = document.createElement('tr');
  const wordHeading = document.createElement('th');
  wordHeading.scope = 'row';
  wordHeading.textContent = 'Cuvânt';
  const wordCell = document.createElement('td');
  const wordButton = document.createElement('button');
  wordButton.className = 'daily-word-link';
  wordButton.type = 'button';
  wordButton.textContent = entry.lemmaKey;
  wordButton.addEventListener('click', () => openDailyDictionaryEntry(entry.lemmaKey, language));
  wordCell.appendChild(wordButton);
  wordRow.append(wordHeading, wordCell);
  body.appendChild(wordRow);

  addRow('Definiție', truncateFeaturedText(decodeDictionaryText(entry.defs?.[0]), 220));
  addRow('Etimologie', truncateFeaturedText(decodeDictionaryText(entry.etym), 180));
  table.appendChild(body);
  card.appendChild(table);
  card.appendChild(createDailyCardRefreshButton(
    `Reîmprospătează cuvântul ${language === 'gr' ? 'grecesc' : 'latin'}`,
    () => refreshDictionaryHighlight(language)
  ));
  return card;
}

function openDailyDictionaryEntry(lemma, language) {
  navigateToSitePage('dictionary');
  const input = document.getElementById('searchInput');
  input.value = lemma;
  setSearchMode(language === 'gr' ? 'greek-dir' : 'latin-dir');
  document.getElementById('autocompleteDropdown').classList.remove('active');
  updateHomeView(lemma);
  renderEntry(lemma);
}

async function refreshDictionaryHighlight(language) {
  const currentCard = dictionaryDailyCards.querySelector(`[data-daily-language="${language}"]`);
  try {
    const catalog = await loadDictionaryCatalog();
    const entry = await chooseRandomDictionaryEntry(language, catalog);
    const nextCard = createDailyWordCard(language, entry);
    if (currentCard?.isConnected) currentCard.replaceWith(nextCard);
    else dictionaryDailyCards.appendChild(nextCard);
  } catch (error) {
    console.error(`Nu s-a putut reîmprospăta cuvântul pentru ${language}.`, error);
    const title = language === 'gr' ? 'Greacă veche' : 'Latină';
    const nextCard = createDailyMessageCard(
      title,
      'Nu s-a putut încărca un cuvânt. Reîncearcă.',
      true,
      () => refreshDictionaryHighlight(language),
      language
    );
    if (currentCard?.isConnected) currentCard.replaceWith(nextCard);
    else dictionaryDailyCards.appendChild(nextCard);
  }
}

async function refreshDictionaryHighlights(force = false) {
  if (dictionaryDailyLoadPromise) return dictionaryDailyLoadPromise;
  if (dictionaryDailyLoaded && !force) return;

  dictionaryDailySection.hidden = false;
  dictionaryDailyCards.replaceChildren(
    createDailyMessageCard('Greacă veche', 'Se alege un cuvânt…', false, () => refreshDictionaryHighlight('gr'), 'gr'),
    createDailyMessageCard('Latină', 'Se alege un cuvânt…', false, () => refreshDictionaryHighlight('lat'), 'lat')
  );
  const request = (async () => {
    let results;
    try {
      const catalog = await loadDictionaryCatalog();
      results = await Promise.all(['gr', 'lat'].map(async language => {
        try {
          return { language, entry: await chooseRandomDictionaryEntry(language, catalog) };
        } catch (error) {
          console.error(`Nu s-a putut alege cuvântul zilei pentru ${language}.`, error);
          return { language, error };
        }
      }));
    } catch (error) {
      console.error('Nu s-au putut încărca selecțiile din dicționar.', error);
      results = ['gr', 'lat'].map(language => ({ language, error }));
    }

    dictionaryDailyCards.replaceChildren(...results.map(result =>
      result.entry
        ? createDailyWordCard(result.language, result.entry)
        : createDailyMessageCard(
          result.language === 'gr' ? 'Greacă veche' : 'Latină',
          'Nu s-a putut încărca un cuvânt. Reîncearcă.',
          true,
          () => refreshDictionaryHighlight(result.language),
          result.language
        )
    ));
    dictionaryDailyLoaded = results.every(result => Boolean(result.entry));
  })();
  dictionaryDailyLoadPromise = request;
  try {
    await request;
  } finally {
    if (dictionaryDailyLoadPromise === request) dictionaryDailyLoadPromise = null;
  }
}

function normalizeDictionaryWord(word) {
  return String(word)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’']/g, '')
    .trim()
    .toLocaleLowerCase('la');
}

function findTextDictionaryLemma(word, languageGroup) {
  const normalizedWord = normalizeDictionaryWord(word);
  const wantedLanguage = languageGroup === 'gr' ? 'Greacă Veche' : 'Latină';

  for (const lemma in lexiconData) {
    const entry = lexiconData[lemma];
    if (entry.lang !== wantedLanguage) continue;
    const normalizedLemma = normalizeDictionaryWord(lemma);
    const lemmaMatches = languageGroup === 'gr'
      ? matchesSearchText(lemma, word)
      : normalizedLemma === normalizedWord;
    if (lemmaMatches) return lemma;

    const formMatches = entry.searchForms?.some(form =>
      languageGroup === 'gr'
        ? matchesSearchText(form, word)
        : normalizeDictionaryWord(form) === normalizedWord
    );
    if (formMatches) return lemma;
  }
  return null;
}

async function openTextDictionaryWord(word, languageGroup) {
  try {
    await loadRemoteDictionary(word, languageGroup);
    let lemma = findTextDictionaryLemma(word, languageGroup);
    if (lemma) {
      const redirect = lexiconData[lemma]?.redirect?.trim();
      if (redirect) {
        const redirected = Object.prototype.hasOwnProperty.call(lexiconData, redirect)
          ? redirect
          : findTextDictionaryLemma(redirect, languageGroup);
        if (redirected) lemma = redirected;
      }
      navigateToSitePage('dictionary');
      setSearchMode(languageGroup === 'gr' ? 'greek-dir' : 'latin-dir');
      const input = document.getElementById('searchInput');
      input.value = word;
      updateHomeView(word);
      renderEntry(lemma);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setTextsSearchStatus(`Cuvântul „${word}” nu este în dicționar.`, 'error');
    }
  } catch (error) {
    setTextsSearchStatus(`Nu s-a putut verifica „${word}” în dicționar.`, 'error');
  }
}

function loadRecentSearches() {
  try {
    const stored = localStorage.getItem(recentSearchStorageKey);
    if (!stored) return [];

    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new TypeError('Istoricul căutărilor salvat nu are formatul așteptat.');
    }

    return parsed
      .filter(item => item && typeof item.query === 'string' && item.query.trim()
        && item.query.length <= 200 && recentSearchModes.has(item.mode))
      .slice(0, 10);
  } catch (error) {
    recentSearchStorageError = error;
    console.error('Nu s-a putut încărca istoricul căutărilor.', error);
    return [];
  }
}

function saveRecentSearches() {
  try {
    localStorage.setItem(recentSearchStorageKey, JSON.stringify(recentSearches));
    recentSearchStorageError = null;
  } catch (error) {
    recentSearchStorageError = error;
    console.error('Nu s-a putut salva istoricul căutărilor.', error);
  }
}

function rememberRecentSearch(query, mode = currentMode) {
  const cleanQuery = query.trim();
  if (!cleanQuery || cleanQuery.length > 200 || !recentSearchModes.has(mode)) return;

  const normalizedQuery = cleanQuery.normalize('NFC').toLocaleLowerCase();
  recentSearches = [
    { query: cleanQuery, mode },
    ...recentSearches.filter(item =>
      item.query.normalize('NFC').toLocaleLowerCase() !== normalizedQuery || item.mode !== mode
    )
  ].slice(0, 10);

  saveRecentSearches();
  if (!document.getElementById('recentSearchDropdown').hidden) renderRecentSearches();
}

function getRecentSearchModeLabel(mode) {
  return ({
    'omnia-dir': 'Omnia',
    'greek-dir': 'Greacă veche',
    'latin-dir': 'Latină',
    'omnia-rev': 'Omnia',
    'greek-rev': 'Greacă veche',
    'latin-rev': 'Latină'
  })[mode];
}

function renderRecentSearches() {
  const list = document.getElementById('recentSearchList');
  const clearButton = document.getElementById('clearRecentSearchesBtn');
  list.replaceChildren();
  clearButton.hidden = recentSearches.length === 0;

  if (!recentSearches.length) {
    const emptyMessage = document.createElement('p');
    emptyMessage.className = 'recent-search-empty';
    emptyMessage.textContent = recentSearchStorageError
      ? 'Istoricul nu poate fi accesat pe acest dispozitiv.'
      : 'Căutările tale recente vor apărea aici.';
    list.appendChild(emptyMessage);
    return;
  }

  recentSearches.forEach(item => {
    const button = document.createElement('button');
    button.className = 'recent-search-item';
    button.type = 'button';

    const query = document.createElement('span');
    query.textContent = item.query;
    const mode = document.createElement('span');
    mode.className = 'recent-search-mode';
    mode.textContent = getRecentSearchModeLabel(item.mode);
    button.append(query, mode);
    button.addEventListener('click', () => openRecentSearch(item));
    list.appendChild(button);
  });

  if (recentSearchStorageError) {
    const warning = document.createElement('p');
    warning.className = 'recent-search-empty';
    warning.textContent = 'Căutările sunt disponibile doar cât timp pagina este deschisă.';
    list.appendChild(warning);
  }
}

function toggleRecentSearches() {
  const dropdown = document.getElementById('recentSearchDropdown');
  const toggle = document.getElementById('recentSearchToggle');
  const isOpen = !dropdown.hidden;
  dropdown.hidden = isOpen;
  toggle.setAttribute('aria-expanded', String(!isOpen));
  if (!isOpen) renderRecentSearches();
}

function closeRecentSearches() {
  document.getElementById('recentSearchDropdown').hidden = true;
  document.getElementById('recentSearchToggle').setAttribute('aria-expanded', 'false');
}

function clearRecentSearches() {
  recentSearches = [];
  saveRecentSearches();
  renderRecentSearches();
}

function openRecentSearch(item) {
  showingFavoritesPage = false;
  const input = document.getElementById('searchInput');
  closeRecentSearches();
  input.value = '';
  setSearchMode(item.mode);
  input.value = item.query;

  if (item.mode.endsWith('-rev')) submitSearch();
  else submitSearch();
}

function loadFavoriteWords() {
  try {
    const stored = localStorage.getItem(favoriteStorageKey);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    if (!Array.isArray(parsed)) {
      throw new TypeError('Lista cuvintelor favorite salvată nu are formatul așteptat.');
    }
    return parsed
      .filter(item => item && typeof item.key === 'string' && typeof item.word === 'string'
        && item.word.trim() && (item.lang === 'Greacă Veche' || item.lang === 'Latină'))
      .slice(0, 500);
  } catch (error) {
    favoriteStorageError = error;
    console.error('Nu s-au putut încărca cuvintele favorite.', error);
    return [];
  }
}

function saveFavoriteWords() {
  try {
    localStorage.setItem(favoriteStorageKey, JSON.stringify(favoriteWords));
    favoriteStorageError = null;
    return true;
  } catch (error) {
    favoriteStorageError = error;
    console.error('Nu s-au putut salva cuvintele favorite.', error);
    return false;
  }
}

function isFavoriteWord(data) {
  return favoriteWords.some(item => item.key === data.lemmaKey || (
    item.lang === data.lang && item.word.normalize('NFC').toLocaleLowerCase()
      === data.id.normalize('NFC').toLocaleLowerCase()
  ));
}

function toggleFavoriteWord(lemmaKey) {
  const data = lexiconData[lemmaKey];
  if (!data) return;
  const existingIndex = favoriteWords.findIndex(item =>
    item.key === data.lemmaKey || (item.lang === data.lang
      && item.word.normalize('NFC').toLocaleLowerCase() === data.id.normalize('NFC').toLocaleLowerCase())
  );
  if (existingIndex >= 0) favoriteWords.splice(existingIndex, 1);
  else favoriteWords.unshift({ key: data.lemmaKey ?? lemmaKey, word: data.id, lang: data.lang });

  const saved = saveFavoriteWords();
  const button = document.querySelector('.entry-favorite-button');
  if (button) {
    const isFavorite = isFavoriteWord(data);
    button.textContent = isFavorite ? '★' : '☆';
    button.setAttribute('aria-pressed', String(isFavorite));
    button.setAttribute('aria-label', isFavorite ? 'Elimină din cuvintele favorite' : 'Adaugă la cuvintele favorite');
    button.title = isFavorite ? 'Elimină din favorite' : 'Adaugă la favorite';
  }
  const status = document.getElementById('favoriteStatus');
  if (status) status.textContent = saved ? '' : 'Nu s-a putut salva pe acest dispozitiv.';
  if (showingFavoritesPage) renderFavoritesPage();
}

function renderFavoritesPage() {
  const display = document.getElementById('dictionaryDisplay');
  dictionaryDailySection.hidden = true;
  display.innerHTML = `
    <section class="favorites-page" aria-labelledby="favoritesPageTitle">
      <div class="favorites-page-header">
        <h1 id="favoritesPageTitle">Cuvinte favorite</h1>
        <button class="favorites-page-back" type="button">Înapoi la dicționar</button>
      </div>
      ${favoriteStorageError ? '<p class="favorites-error" role="status">Lista nu poate fi accesată pe acest dispozitiv.</p>' : ''}
      <div class="favorites-list"></div>
    </section>
  `;
  display.querySelector('.favorites-page-back').addEventListener('click', () => {
    showingFavoritesPage = false;
    display.replaceChildren();
    const input = document.getElementById('searchInput');
    if (input.value.trim()) {
      if (currentMode.endsWith('-rev')) submitSearch();
      else handleSearchInput(input.value);
    } else {
      updateHomeView('');
    }
  });

  const list = display.querySelector('.favorites-list');
  if (!favoriteWords.length) {
    const empty = document.createElement('p');
    empty.className = 'favorite-empty';
    empty.textContent = 'Nu ai adăugat încă niciun cuvânt la favorite.';
    list.appendChild(empty);
    return;
  }

  favoriteWords.forEach(item => {
    const row = document.createElement('div');
    row.className = 'favorite-list-item';
    const openButton = document.createElement('button');
    openButton.className = 'favorite-open-button';
    openButton.type = 'button';
    openButton.textContent = item.word;
    openButton.addEventListener('click', () => openFavoriteWord(item));
    const removeButton = document.createElement('button');
    removeButton.className = 'favorite-remove-button';
    removeButton.type = 'button';
    removeButton.textContent = 'Elimină';
    removeButton.setAttribute('aria-label', `Elimină ${item.word} din favorite`);
    removeButton.addEventListener('click', () => {
      favoriteWords = favoriteWords.filter(favorite => favorite !== item);
      saveFavoriteWords();
      renderFavoritesPage();
    });
    row.append(openButton, removeButton);
    list.appendChild(row);
  });
}

function openFavoriteWord(item) {
  showingFavoritesPage = false;
  const input = document.getElementById('searchInput');
  input.value = '';
  setSearchMode(item.lang === 'Greacă Veche' ? 'greek-dir' : 'latin-dir');
  input.value = item.word;
  submitSearch();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function cleanUniversal(str) {
  if (!str) return '';
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[āă]/gi, 'a')
    .replace(/[ēĕ]/gi, 'e')
    .replace(/[īĭ]/gi, 'i')
    .replace(/[ōŏ]/gi, 'o')
    .replace(/[ūŭ]/gi, 'u')
    .replace(/[șş]/gi, 's')
    .replace(/[țţ]/gi, 't')
    .replace(/[îâ]/gi, 'i')
    .toLowerCase()
    .trim();
}

function transliterateGreek(str) {
  const greekLetters = {
    "α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e",
    "ζ": "z", "η": "e", "θ": "th", "ι": "i", "κ": "k",
    "λ": "l", "μ": "m", "ν": "n", "ξ": "x", "ο": "o",
    "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t",
    "υ": "y", "φ": "ph", "χ": "ch", "ψ": "ps", "ω": "o"
  };
  const normalized = cleanUniversal(str).replace(/ς/g, "σ");
  return Array.from(normalized, letter => greekLetters[letter] || letter).join("");
}

function greekSearchKey(str) {
  const cleanText = cleanUniversal(str);
  const containsGreek = /[\u0370-\u03ff\u1f00-\u1fff]/.test(cleanText);
  return containsGreek
    ? transliterateGreek(cleanText)
    : cleanText.replace(/kh/g, "ch").replace(/ks/g, "x");
}

function getGreekFileLettersForLatinQuery(query) {
  const cleanQuery = cleanUniversal(query);
  const digraph = /^(th|ph|ch|kh|ps|ks)/.exec(cleanQuery);
  if (digraph) {
    const greekDigraphs = { th: 'θ', ph: 'φ', ch: 'χ', kh: 'χ', ps: 'ψ', ks: 'ξ' };
    return [greekDigraphs[digraph[0]]];
  }

  const firstLetter = [...cleanQuery].find(character => /\p{L}/u.test(character));
  const greekLetters = {
    a: ['α'], b: ['β'], g: ['γ'], d: ['δ'], e: ['ε', 'η'],
    z: ['ζ'], i: ['ι'], k: ['κ'], l: ['λ'], m: ['μ'],
    n: ['ν'], x: ['ξ'], o: ['ο', 'ω'], p: ['π'], r: ['ρ'],
    s: ['σ'], t: ['τ'], u: ['υ'], y: ['υ'], f: ['φ'], w: ['ω']
  };
  return greekLetters[firstLetter] || [firstLetter || 'α'];
}

function matchesSearchText(text, query) {
  const textKey = greekSearchKey(text);
  const queryKey = greekSearchKey(query);
  if (!/[\u0370-\u03ff\u1f00-\u1fff]/.test(text)) return textKey === queryKey;
  return getGreekSearchKeyVariants(queryKey).includes(textKey);
}

function matchesSearchPrefix(text, queryKey) {
  const textKey = greekSearchKey(text);
  if (!/[\u0370-\u03ff\u1f00-\u1fff]/.test(text)) return textKey.startsWith(queryKey);
  return getGreekSearchKeyVariants(queryKey).some(variant => textKey.startsWith(variant));
}

function getGreekSearchKeyVariants(key) {
  const variants = new Set([key]);
  const alternatives = [
    value => value.replace(/y/g, 'u'),
    value => value.replace(/u/g, 'y'),
    value => value.replace(/ph/g, 'f'),
    value => value.replace(/f/g, 'ph')
  ];

  alternatives.forEach(alternative => {
    [...variants].forEach(variant => variants.add(alternative(variant)));
  });
  return [...variants];
}

function buildDictionaryTargets(query, languageOverride = null) {
  const raw = query.trim();
  if (!raw) return [];

  const firstLetter = [...raw].find(ch => /[\p{L}]/u.test(ch)) || raw[0] || 'a';
  const normalizedFirstLetter = String(firstLetter).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const containsGreek = /[\u0370-\u03ff\u1f00-\u1fff]/.test(raw);
  const language = languageOverride || (currentMode === 'greek-dir' || (currentMode === 'omnia-dir' && containsGreek)
    ? 'gr'
    : 'lat');
  const fileLetters = language === 'gr'
    ? containsGreek
      ? [normalizedFirstLetter === 'ς' ? 'σ' : normalizedFirstLetter]
      : getGreekFileLettersForLatinQuery(raw)
    : [normalizedFirstLetter || 'a'];

  return fileLetters.map(fileLetter => ({
    language,
    fileLetter,
    path: language === 'gr'
      ? `data/litere/gr/${encodeURIComponent(fileLetter)}.jsonl`
      : `data/litere/lat/${encodeURIComponent(fileLetter)}.json`
  }));
}

function normalizeRemoteEntry(lemma, entry, language) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new TypeError(`Intrarea „${lemma}” nu este un obiect valid.`);
  }

  const rawForms = entry.forme ?? entry.forms ?? entry.variante ?? [];
  const searchForms = Array.isArray(rawForms)
    ? rawForms.map(String)
    : String(rawForms).split(/[;,]/).map(form => form.trim()).filter(Boolean);
  const rawDefinitions = entry.definitie ?? entry.definitie_ro ?? entry.defs ?? [];
  const definitions = (Array.isArray(rawDefinitions) ? rawDefinitions : [rawDefinitions])
    .map(String)
    .filter(Boolean);
  const escape = value => escapeHtml(String(value ?? ''));
  const normalizeRelatedWords = value => {
    const words = Array.isArray(value)
      ? value
      : typeof value === 'string'
        ? value.split(/[;,]/)
        : [];
    return [...new Set(words.map(word => String(word).trim()).filter(Boolean))];
  };

  return {
    ...entry,
    lemmaKey: lemma,
    id: escape(entry.id ?? lemma),
    lang: language === 'gr' ? 'Greacă Veche' : 'Latină',
    pos: escape(entry.pos ?? 'Parte de vorbire nespecificată'),
    forms: escape(Array.isArray(rawForms) ? rawForms.join(', ') : rawForms),
    indicatii: escape(entry.indicatii ?? ''),
    redirect: escape(entry.trimite_la ?? ''),
    synonyms: normalizeRelatedWords(entry.sinonime ?? entry.synonyms ?? entry.sinonim),
    antonyms: normalizeRelatedWords(entry.antonime ?? entry.antonyms ?? entry.antonim),
    searchForms,
    etym: escape(entry.etym ?? entry.etimologie ?? entry.etimologia ?? entry.etymology ?? ''),
    defs: definitions.map(escape),
    citations: Array.isArray(entry.citations) ? entry.citations.map(citation => ({
      text: escape(citation.text),
      trans: escape(citation.trans),
      author: escape(citation.author)
    })) : [],
    paradigm: Array.isArray(entry.paradigm ?? entry.paradigma)
      ? (entry.paradigm ?? entry.paradigma).map(row => Array.isArray(row) ? row.map(escape) : [])
      : []
  };
}

async function loadDictionaryTarget(target, allowMissing = false) {
  if (loadedDictionaryTargets.has(target.path)) return true;

  if (!remoteDictionaryCache.has(target.path)) {
    const request = fetch(target.path).then(async response => {
      if (!response.ok) {
        const error = new Error(`Răspuns HTTP ${response.status}`);
        error.status = response.status;
        throw error;
      }
      const body = await response.text();
      try {
        if (target.path.endsWith('.jsonl')) {
          return body.split(/\r?\n/).filter(line => line.trim()).map((line, index) => {
            let entry;
            try {
              entry = JSON.parse(line);
            } catch (error) {
              throw new Error(`rândul ${index + 1} nu este JSON valid: ${error.message}`);
            }
            if (!entry || typeof entry.lema !== 'string' || !entry.lema) {
              throw new TypeError(`rândul ${index + 1} nu conține o lemă validă.`);
            }
            return [entry.lema, entry];
          });
        }
        return Object.entries(JSON.parse(body));
      } catch (error) {
        if (body.trimStart().startsWith('<')) {
          throw new Error('serverul a returnat o pagină HTML, nu fișierul JSON cerut');
        }
        throw error;
      }
    });
    remoteDictionaryCache.set(target.path, request);
  }

  try {
    const entries = await remoteDictionaryCache.get(target.path);
    if (!Array.isArray(entries)) {
      throw new TypeError('Fișierul dicționarului nu conține intrări valide.');
    }
    if (loadedDictionaryTargets.has(target.path)) return true;
    for (const [lemma, entry] of entries) {
      if (!Object.prototype.hasOwnProperty.call(lexiconData, lemma)) {
        lexiconData[lemma] = normalizeRemoteEntry(lemma, entry, target.language);
      }
    }
    loadedDictionaryTargets.add(target.path);
    remoteDictionaryCache.delete(target.path);
    return true;
  } catch (error) {
    remoteDictionaryCache.delete(target.path);
    if (allowMissing && error.status === 404) return false;
    throw new Error(`${target.path}: ${error.message}`);
  }
}

async function loadRemoteDictionary(query, languageOverride = null) {
  const targets = buildDictionaryTargets(query, languageOverride);
  if (!targets.length) return;
  const needsRefresh = targets.some(target => !loadedDictionaryTargets.has(target.path));
  await Promise.all(targets.map(target => loadDictionaryTarget(target)));
  return needsRefresh;
}

function getDictionaryFileLetter(lemma) {
  const firstLetter = [...lemma.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()]
    .find(character => /\p{L}/u.test(character));
  return firstLetter === 'ς' ? 'σ' : firstLetter || '';
}

function sortDictionaryEntries(entries, language) {
  const locale = language === 'gr' ? 'el' : 'la';
  return entries.sort((a, b) =>
    a.id.localeCompare(b.id, locale, { sensitivity: 'base' }) ||
    a.lemmaKey.localeCompare(b.lemmaKey, locale, { sensitivity: 'base' })
  );
}

async function findAdjacentDictionaryEntry(lemmaKey, direction) {
  const currentEntry = lexiconData[lemmaKey];
  if (!currentEntry) return null;

  const language = currentEntry.lang === 'Greacă Veche' ? 'gr' : 'lat';
  const alphabet = language === 'gr'
    ? Array.from('αβγδεζηθικλμνξοπρστυφχψω')
    : Array.from('abcdefghijklmnopqrstuvwxyz');
  const currentLetter = getDictionaryFileLetter(lemmaKey);
  const currentLetterIndex = alphabet.indexOf(currentLetter);
  if (currentLetterIndex === -1) return null;

  const entriesForLetter = letter => sortDictionaryEntries(
    Object.values(lexiconData).filter(entry =>
      entry.lang === currentEntry.lang && getDictionaryFileLetter(entry.lemmaKey) === letter
    ),
    language
  );
  const currentLetterEntries = entriesForLetter(currentLetter);
  const currentIndex = currentLetterEntries.findIndex(entry => entry.lemmaKey === lemmaKey);
  const adjacentEntry = currentLetterEntries[currentIndex + direction];
  if (adjacentEntry) return adjacentEntry;

  for (let index = currentLetterIndex + direction;
    index >= 0 && index < alphabet.length;
    index += direction) {
    const letter = alphabet[index];
    const target = buildDictionaryTargets(letter, language)[0];
    if (!target) continue;
    const loaded = await loadDictionaryTarget(target, true);
    if (!loaded) continue;

    const entries = entriesForLetter(letter);
    if (entries.length) {
      return direction > 0 ? entries[0] : entries[entries.length - 1];
    }
  }

  return null;
}

async function navigateDictionary(lemmaKey, direction, button) {
  const display = document.getElementById('dictionaryDisplay');
  const buttons = [...display.querySelectorAll('.dictionary-navigation button')];
  const errorMessage = display.querySelector('.dictionary-navigation-error');
  buttons.forEach(navigationButton => {
    navigationButton.disabled = true;
  });
  errorMessage.textContent = '';

  let reachedBoundary = false;
  try {
    const adjacentEntry = await findAdjacentDictionaryEntry(lemmaKey, direction);
    if (!adjacentEntry) {
      reachedBoundary = true;
      errorMessage.textContent = direction < 0
        ? 'Nu există un cuvânt anterior în această listă.'
        : 'Nu există un cuvânt următor în această listă.';
      return;
    }
    selectSuggestion(adjacentEntry.lemmaKey);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    errorMessage.textContent = `Nu s-a putut încărca cuvântul următor: ${error.message}`;
  } finally {
    buttons.forEach(navigationButton => {
      if (navigationButton.isConnected) {
        navigationButton.disabled = reachedBoundary && navigationButton === button;
      }
    });
  }
}

function setSearchMode(mode) {
  const previousMode = currentMode;
  currentMode = mode;
  const allModeButtons = ['omnia-dir', 'greek-dir', 'latin-dir', 'omnia-rev', 'greek-rev', 'latin-rev'];
  allModeButtons.forEach(m => {
    const btn = document.getElementById('btn-' + m);
    if (btn) btn.classList.toggle('active', m === mode);
  });

  const input = document.getElementById('searchInput');
  if (mode === 'greek-dir' && previousMode !== 'greek-dir') {
    greekTypingSource = input.value;
    const convertedInput = transliterateGreekInput(greekTypingSource);
    input.value = convertedInput.text;
    greekOutputToSource = convertedInput.outputToSource;
  }
  const kbdBtn = document.getElementById('kbdToggleBtn');
  const searchSubmitBtn = document.getElementById('searchSubmitBtn');
  const kbdPanel = document.getElementById('keyboardPanel');

  kbdPanel.classList.remove('active');
  document.getElementById('autocompleteDropdown').classList.remove('active');

  const isReverse = mode.endsWith('-rev');
  kbdBtn.hidden = isReverse;
  searchSubmitBtn.hidden = !isReverse;

  if (!isReverse) {
    input.placeholder = mode === 'greek-dir'
      ? 'Tastează transliterarea: „logos” → „λόγος”'
      : "Tastează o literă sau un cuvânt";
  } else {
    input.placeholder = "Tastează un cuvânt în română...";
  }

  if (isReverse) {
    document.getElementById('autocompleteDropdown').classList.remove('active');
    document.getElementById('dictionaryDisplay').innerHTML = '';
  } else {
    handleSearchInput(input.value);
  }
  input.focus();
}

function toggleGreekKeyTable() {
  const table = document.getElementById('greekKeyTable');
  const button = document.getElementById('greekKeyTableToggle');
  table.hidden = !table.hidden;
  button.setAttribute('aria-expanded', String(!table.hidden));
}

function transliterateGreekInput(text) {
  const outputToSource = [0];
  let converted = '';

  for (const match of text.matchAll(/th|ph|ch|kh|ps|ks|[\s\S]/giu)) {
    const token = match[0];
    const sourceStart = match.index;
    const sourceEnd = sourceStart + token.length;
    let greek = greekTransliterationMap[token.toLowerCase()] || token;

    if (greek !== token && token === token.toUpperCase()) {
      greek = greek.toUpperCase();
    } else if (greek !== token && token[0] === token[0].toUpperCase()) {
      greek = greek[0].toUpperCase() + greek.slice(1);
    }

    const outputStart = converted.length;
    converted += greek;
    outputToSource[outputStart] = sourceStart;
    for (let offset = outputStart + 1; offset < converted.length; offset++) {
      outputToSource[offset] = sourceStart;
    }
    outputToSource[converted.length] = sourceEnd;
  }

  converted = converted.replace(/σ(?=[\s.,;:!?)}\]]|$)/g, 'ς');
  return { text: converted, outputToSource };
}

function synchronizeGreekTypingInput(input) {
  if (currentMode !== 'greek-dir') return;

  const currentConversion = transliterateGreekInput(greekTypingSource);
  if (currentConversion.text === input.value) return;

  const caret = input.selectionStart;
  greekTypingSource = input.value;
  const convertedInput = transliterateGreekInput(greekTypingSource);
  greekOutputToSource = convertedInput.outputToSource;
  input.value = convertedInput.text;
  if (caret !== null) {
    const nextCaret = convertedInput.outputToSource.findIndex(offset => offset >= caret);
    const position = nextCaret < 0 ? input.value.length : nextCaret;
    input.setSelectionRange(position, position);
  }
}

function handleGreekTransliterationInput(event) {
  if (currentMode !== 'greek-dir') return;

  const input = event.currentTarget;
  synchronizeGreekTypingInput(input);
  if (input.selectionStart === null || input.selectionEnd === null) return;

  let selectionStart = input.selectionStart;
  let selectionEnd = input.selectionEnd;
  let sourceStart = greekOutputToSource[selectionStart] ?? greekTypingSource.length;
  let sourceEnd = greekOutputToSource[selectionEnd] ?? greekTypingSource.length;
  let insertedText = '';

  if (event.inputType.startsWith('insert')) {
    insertedText = event.data ?? event.dataTransfer?.getData('text/plain');
    if (insertedText === null || insertedText === undefined) return;
  } else if (event.inputType === 'deleteContentBackward' && selectionStart === selectionEnd) {
    if (selectionStart === 0) return;
    sourceStart = greekOutputToSource[selectionStart - 1] ?? 0;
  } else if (event.inputType === 'deleteContentForward' && selectionStart === selectionEnd) {
    if (selectionEnd >= input.value.length) return;
    sourceEnd = greekOutputToSource[selectionEnd + 1] ?? greekTypingSource.length;
  } else if (!event.inputType.startsWith('delete') || selectionStart === selectionEnd) {
    return;
  }

  event.preventDefault();
  const nextSource = greekTypingSource.slice(0, sourceStart)
    + insertedText
    + greekTypingSource.slice(sourceEnd);
  const caretSource = sourceStart + insertedText.length;
  greekTypingSource = nextSource;

  const convertedInput = transliterateGreekInput(greekTypingSource);
  greekOutputToSource = convertedInput.outputToSource;
  input.value = convertedInput.text;
  const caretPosition = convertedInput.outputToSource.findIndex(offset => offset >= caretSource);
  const nextCaret = caretPosition < 0 ? input.value.length : caretPosition;
  input.setSelectionRange(nextCaret, nextCaret);
  handleSearchInput(input.value);
}

function handleSearchInput(query) {
  if (currentMode === 'greek-dir') {
    const input = document.getElementById('searchInput');
    synchronizeGreekTypingInput(input);
    query = input.value;
  }

  showingFavoritesPage = false;
  updateHomeView(query);
  if (currentMode.endsWith('-rev')) {
    document.getElementById('autocompleteDropdown').classList.remove('active');
    document.getElementById('dictionaryDisplay').innerHTML = '';
    return;
  }

  const requestId = ++searchRequestId;
  updateLiveSuggestions(query);
  if (!query.trim()) return;

  loadRemoteDictionary(query).then(needsRefresh => {
    if (requestId !== searchRequestId || currentMode.endsWith('-rev')) return;
    if (needsRefresh) updateLiveSuggestions(query);
  }).catch(error => {
    if (requestId !== searchRequestId || currentMode.endsWith('-rev')) return;
    const display = document.getElementById('dictionaryDisplay');
    const message = document.createElement('p');
    message.className = 'dictionary-load-error';
    message.textContent = error.message;
    display.appendChild(message);
  });
}

async function submitSearch() {
  document.getElementById('autocompleteDropdown').classList.remove('active');
  const input = document.getElementById('searchInput');
  synchronizeGreekTypingInput(input);
  const query = input.value;
  if (!query.trim()) return;

  if (currentMode.endsWith('-rev')) {
    runReverseSearch(query);
    return;
  }

  try {
    await loadRemoteDictionary(query);
    const raw = query.trim();
    let matchedLemma = null;
    for (const lemma in lexiconData) {
      const item = lexiconData[lemma];
      if (currentMode === 'greek-dir' && item.lang !== 'Greacă Veche') continue;
      if (currentMode === 'latin-dir' && item.lang !== 'Latină') continue;

      const matchesForm = item.searchForms?.some(form => matchesSearchText(form, raw));
      if (lemma === raw || matchesSearchText(lemma, raw) || matchesForm) {
        matchedLemma = lemma;
        break;
      }
    }
    if (matchedLemma) selectSuggestion(matchedLemma);
    else runDirectSearch(raw);
  } catch (error) {
    const display = document.getElementById('dictionaryDisplay');
    const message = document.createElement('p');
    message.className = 'dictionary-load-error';
    message.textContent = error.message;
    display.replaceChildren(message);
  }
}

function handleSearchKeydown(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    submitSearch();
  }
}

function updateHomeView(query) {
  document.querySelector('.search-section').classList.toggle('has-active-search', Boolean(query.trim()));
  document.querySelector('.page-layout').classList.toggle('has-active-search', Boolean(query.trim()));
  dictionaryDailySection.hidden = Boolean(query.trim()) || showingFavoritesPage;
}

function updateLiveSuggestions(query) {
  const dropdown = document.getElementById('autocompleteDropdown');
  const list = document.getElementById('dropdownList');
  const title = document.getElementById('dropdownTitle');

  if (!query || query.trim() === '') {
    dropdown.classList.remove('active');
    return;
  }

  const raw = query.trim();
  const cleanQ = greekSearchKey(raw);
  const suggestions = [];
  let matchCount = 0;
  const compareSuggestions = (left, right) =>
    left.sortKey.localeCompare(right.sortKey, 'en', { sensitivity: 'base' })
    || left.item.lemmaKey.localeCompare(right.item.lemmaKey, 'en', { sensitivity: 'base' });

  for (let lemma in lexiconData) {
    const item = lexiconData[lemma];
    if (currentMode === 'greek-dir' && item.lang !== "Greacă Veche") continue;
    if (currentMode === 'latin-dir' && item.lang !== "Latină") continue;

    const matchesLemma = matchesSearchPrefix(lemma, cleanQ);
    const matchesForm = item.searchForms?.some(form => matchesSearchPrefix(form, cleanQ));
    if (matchesLemma || matchesForm) {
      matchCount++;
      const candidate = { item, sortKey: greekSearchKey(item.id) };
      const insertAt = suggestions.findIndex(suggestion =>
        compareSuggestions(candidate, suggestion) < 0
      );
      if (insertAt === -1) {
        if (suggestions.length < 5) suggestions.push(candidate);
      } else {
        suggestions.splice(insertAt, 0, candidate);
        if (suggestions.length > 5) suggestions.pop();
      }
    }
  }

  if (matchCount > 0) {
    dropdown.classList.add('active');
    title.innerText = `Recomandări pentru „${raw}” (${matchCount})`;
    list.innerHTML = suggestions.map(({ item }) => `
      <div class="dropdown-item" role="button" tabindex="0">
        <div>
          <span class="dropdown-lemma${item.lang === 'Greacă Veche' ? ' greek-text' : ''}">${item.id}</span>
          <span class="dropdown-desc">${item.defs[0] || item.pos}</span>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.dropdown-item').forEach((element, index) => {
      element.addEventListener('click', () => {
        const item = suggestions[index].item;
        selectSuggestion(item.lemmaKey ?? item.id);
      });
      element.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
          event.preventDefault();
          const item = suggestions[index].item;
          selectSuggestion(item.lemmaKey ?? item.id);
        }
      });
    });
  } else {
    dropdown.classList.remove('active');
  }
}

function selectSuggestion(lemma) {
  const input = document.getElementById('searchInput');
  input.value = lemma;
  document.getElementById('autocompleteDropdown').classList.remove('active');
  updateHomeView(lemma);
  renderEntry(lemma);
}

function handleSearch(query) {
  updateHomeView(query);
  if (currentMode.endsWith('-dir')) {
    runDirectSearch(query);
  } else {
    runReverseSearch(query);
  }
}

function italicizeLatinExamples(text) {
  const latinEnding = /\b[\p{L}]+(?:āre|ēre|īre|ō|um|us|ae|is|ibus|orum|arum|are|ere|ire|isse|ent|ant)\b/iu;
  const latinFunctionWords = /\b(?:ab|ad|ante|apud|cum|de|ex|in|inter|per|post|pro|sub|super|et|non|qui|quae|quod|ut|ne|est|sunt|esse)\b/gi;

  return text.replace(/(^|[:;=]\s*)([^,;:=]+)(?=,)/g, (match, prefix, candidate) => {
    if (/[ăâîșț]/i.test(candidate) || candidate.trim().split(/\s+/).length < 2) return match;

    const functionWordCount = (candidate.match(latinFunctionWords) || []).length;
    if (!latinEnding.test(candidate) && functionWordCount < 2) return match;

    return `${prefix}<em class="definition-example">${candidate}</em>`;
  });
}

function formatDefinition(text) {
  const markerPattern = /(^|\s)(¶\s*\d+\.|[IVX]+\.|\d+\.|[a-z]\))/g;
  const markers = [];
  const sections = [];
  let cursor = 0;
  let match;

  while ((match = markerPattern.exec(text)) !== null) {
    markers.push({
      index: match.index,
      end: markerPattern.lastIndex,
      label: match[2].trim()
    });
  }

  markers.forEach((currentMarker, index) => {
    const prefix = text.slice(cursor, currentMarker.index).trim();
    if (prefix) sections.push(`<span class="definition-text">${italicizeLatinExamples(prefix)}</span>`);

    const contentEnd = markers[index + 1]?.index ?? text.length;
    const content = text.slice(currentMarker.end, contentEnd).trim();
    const markerClass = currentMarker.label.startsWith('¶') || /^\d/.test(currentMarker.label)
      ? 'numbered'
      : /^[a-z]\)/.test(currentMarker.label)
        ? 'lettered'
        : 'major';

    if (content) {
      sections.push(
        `<span class="definition-subsection ${markerClass}"><span class="definition-marker">${currentMarker.label}</span>${italicizeLatinExamples(content)}</span>`
      );
    }
    cursor = contentEnd;
  });

  const remainder = text.slice(cursor).trim();
  if (remainder) sections.push(`<span class="definition-text">${italicizeLatinExamples(remainder)}</span>`);
  return sections.length ? sections.join('') : `<span class="definition-text">${italicizeLatinExamples(text)}</span>`;
}

function getDefinitionKeywords(entry) {
  const firstDefinition = entry.defs[0] || '';
  const gloss = firstDefinition
    .split(/[;(]/, 1)[0]
    .replace(/^[\sIVX\d.¶\[\]]+/, '');
  const stopWords = new Set([
    'acesta', 'aceasta', 'acestea', 'asupra', 'care', 'către', 'din', 'este',
    'fiind', 'pentru', 'prin', 'spre', 'sau', 'sub', 'unui', 'unei'
  ]);
  return new Set(
    cleanUniversal(gloss)
      .match(/\p{L}{4,}/gu)?.filter(word => !stopWords.has(word)) || []
  );
}

function getRelatedWords(data, key) {
  const explicitWords = data[key] || [];
  if (explicitWords.length || key !== 'synonyms') return explicitWords;

  const keywords = getDefinitionKeywords(data);
  if (!keywords.size) return [];

  return Object.values(lexiconData)
    .filter(entry => entry.lemmaKey !== data.lemmaKey && entry.lang === data.lang)
    .map(entry => ({
      entry,
      overlap: [...getDefinitionKeywords(entry)].filter(word => keywords.has(word)).length
    }))
    .filter(candidate => candidate.overlap > 0)
    .sort((a, b) => b.overlap - a.overlap || a.entry.id.localeCompare(b.entry.id))
    .slice(0, 10)
    .map(candidate => candidate.entry.lemmaKey);
}

function renderRelatedWords(data) {
  const groups = [
    { key: 'synonyms', label: 'Sinonime' },
    { key: 'antonyms', label: 'Antonime' }
  ];

  return `
    <section class="related-words" aria-label="Sinonime și antonime">
      <div class="section-title">Cuvinte înrudite</div>
      <div class="related-word-groups">
        ${groups.map(({ key, label }) => {
          const words = getRelatedWords(data, key);
          const isSuggested = key === 'synonyms' && !(data[key] || []).length && words.length > 0;
          const listId = `related-${key}-${escapeHtmlAttribute(data.lemmaKey)}`;
          return `
            <div class="related-word-group">
              <button
                class="related-word-toggle"
                type="button"
                aria-expanded="false"
                aria-controls="${listId}"
                data-related-toggle
              >${label} (${words.length})</button>
              <div class="related-word-list" id="${listId}" hidden>
                ${words.length
                  ? `${isSuggested ? '<span class="related-word-empty">Sugestii după cuvinte comune în definiții:</span>' : ''}
                    ${words.map((word, index) => `
                      <a
                        class="related-word-link${index < 3 ? ' featured' : ''}"
                        href="#"
                        data-related-lemma="${escapeHtmlAttribute(word)}"
                        data-related-language="${data.lang === 'Greacă Veche' ? 'gr' : 'lat'}"
                      >${escapeHtml(lexiconData[word]?.id ?? word)}</a>
                    `).join('')}`
                  : `<span class="related-word-empty">${key === 'antonyms'
                    ? 'Nu sunt antonime asociate acestui cuvânt în dicționar.'
                    : 'Nu au fost găsite cuvinte cu definiții apropiate.'}</span>`}
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <p class="related-word-error" role="status" hidden></p>
    </section>
  `;
}

async function openRelatedWord(lemma, language) {
  const display = document.getElementById('dictionaryDisplay');
  try {
    document.getElementById('autocompleteDropdown').classList.remove('active');
    document.getElementById('searchInput').value = lemma;
    updateHomeView(lemma);
    await loadRemoteDictionary(lemma, language);
    if (!lexiconData[lemma]) {
      throw new Error(`Nu a fost găsită fișa pentru „${lemma}”.`);
    }
    renderEntry(lemma);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch (error) {
    const message = display.querySelector('.related-word-error');
    if (message) {
      message.textContent = error.message;
      message.hidden = false;
    }
  }
}

function runDirectSearch(query) {
  const display = document.getElementById('dictionaryDisplay');

  if (!query || query.trim() === '') {
    display.innerHTML = '';
    return;
  }

  const raw = query.trim();

  let matchedLemma = null;
  for (let lemma in lexiconData) {
    const item = lexiconData[lemma];
    if (currentMode === 'greek-dir' && item.lang !== "Greacă Veche") continue;
    if (currentMode === 'latin-dir' && item.lang !== "Latină") continue;

    const matchesForm = item.searchForms && item.searchForms.some(form => matchesSearchText(form, raw));
    if (lemma === raw || matchesSearchText(lemma, raw) || matchesForm) {
      matchedLemma = lemma;
      break;
    }
  }

  if (matchedLemma) {
    renderEntry(matchedLemma);
  } else {
    showingFavoritesPage = false;
    display.innerHTML = '';
  }
}

function runReverseSearch(query) {
  const display = document.getElementById('dictionaryDisplay');

  if (!query || query.trim().length < 2) {
    display.innerHTML = '';
    return;
  }

  const raw = query.trim();
  const cleanQ = cleanUniversal(raw);
  const matches = [];

  for (let key in lexiconData) {
    const item = lexiconData[key];
    if (currentMode === 'greek-rev' && item.lang !== "Greacă Veche") continue;
    if (currentMode === 'latin-rev' && item.lang !== "Latină") continue;

    const matchedDefs = [];
    item.defs.forEach((def, idx) => {
      if (cleanUniversal(def).includes(cleanQ)) {
        matchedDefs.push({ num: idx + 1, text: def });
      }
    });

    if (matchedDefs.length > 0) {
      matches.push({
        lemma: item.lemmaKey ?? item.id,
        displayLemma: item.id,
        lang: item.lang,
        pos: item.pos,
        forms: item.forms,
        defs: matchedDefs
      });
    }
  }

  if (matches.length === 0) {
    display.innerHTML = '';
    return;
  }

  let html = `<div class="reverse-results-container">`;
  matches.forEach(m => {
    html += `
      <div class="reverse-item-card">
        <div class="reverse-header">
          <div>
            <span class="reverse-lemma">${m.displayLemma}</span>
            <span class="badge badge-lang reverse-result-lang">${m.lang}</span>
            <span class="badge badge-pos">${m.pos}</span>
          </div>
          <span class="reverse-result-open-label">Vezi fișa ➔</span>
        </div>
        <div class="reverse-result-forms"><em>${m.forms}</em></div>
        <div class="reverse-match-text">
          ${m.defs.map(d => `<div><strong>${d.num}.</strong> ${formatDefinition(d.text)}</div>`).join('')}
        </div>
      </div>
    `;
  });
  html += `</div>`;
  display.innerHTML = html;
  display.querySelectorAll('.reverse-item-card').forEach((element, index) => {
    element.addEventListener('click', () => selectSuggestion(matches[index].lemma));
  });
}

function renderEntry(lemmaKey) {
  const data = lexiconData[lemmaKey];
  const display = document.getElementById('dictionaryDisplay');
  if (!data) return;
  showingFavoritesPage = false;

  const recentSearchMode = currentMode.endsWith('-rev')
    ? (data.lang === 'Greacă Veche' ? 'greek-dir' : 'latin-dir')
    : currentMode;
  rememberRecentSearch(data.id, recentSearchMode);

  let citationsHtml = '';
  if (data.citations && data.citations.length > 0) {
    citationsHtml += `<div class="section-title">Citate & Atestări Clasice</div>`;
    data.citations.forEach(cit => {
      citationsHtml += `
        <div class="citation-card">
          <div class="citation-original">${cit.text}</div>
          <div class="citation-trans">${cit.trans}</div>
          <div class="citation-source">— ${cit.author}</div>
        </div>
      `;
    });
  }

  let paradigmHtml = '';
  if (data.paradigm && data.paradigm.length > 0) {
    paradigmHtml += `
      <div class="section-title">Paradigmă Gramaticală</div>
      <table class="paradigm-table">
        <thead><tr>${data.paradigm[0].map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>
          ${data.paradigm.slice(1).map(row => `<tr>${row.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}
        </tbody>
      </table>
    `;
  }

  display.innerHTML = `
    <article class="entry-card">
      <div class="entry-header">
        <div>
          <h1 class="lemma-title">${data.id}</h1>
          <div class="lemma-badges">
            <span class="badge badge-lang">${data.lang}</span>
            <span class="badge badge-pos">${data.pos}</span>
          </div>
        </div>
        <div class="entry-header-actions">
          <button
            class="entry-favorite-button"
            type="button"
            aria-pressed="${isFavoriteWord(data)}"
            aria-label="${isFavoriteWord(data) ? 'Elimină din cuvintele favorite' : 'Adaugă la cuvintele favorite'}"
            title="${isFavoriteWord(data) ? 'Elimină din favorite' : 'Adaugă la favorite'}"
          >${isFavoriteWord(data) ? '★' : '☆'}</button>
          <span class="favorite-status" id="favoriteStatus" role="status" aria-live="polite"></span>
        </div>
      </div>

      ${(data.forms || data.indicatii || data.etym) ? `
        <div class="etymology-box">
          ${data.forms ? `<strong>Forme canonice:</strong> ${data.forms}<br>` : ''}
          ${data.indicatii ? `<strong>Indicații:</strong> ${data.indicatii}<br>` : ''}
          ${data.etym ? `<strong>Etimologie & Origine:</strong> ${data.etym}` : ''}
        </div>
      ` : ''}

      ${data.redirect ? `<div class="morph-notice active">Formă flexionată. Trimite la: <strong>${data.redirect}</strong></div>` : ''}

      <div class="section-title">Definiții & Sensuri (Limba Română)</div>
      <ol class="definitions-list">
        ${data.defs.map((d, idx) => `<li class="definition-item"><span class="definition-num">${idx + 1}.</span> ${formatDefinition(d)}</li>`).join('')}
      </ol>

      ${citationsHtml}
      ${paradigmHtml}
      ${renderRelatedWords(data)}
      <nav class="dictionary-navigation" aria-label="Navigare între cuvinte">
        <button type="button" data-direction="-1">← Anterior</button>
        <button type="button" data-direction="1">Următor →</button>
      </nav>
      <p class="dictionary-navigation-error" role="status" aria-live="polite"></p>
    </article>
  `;

  display.querySelectorAll('[data-related-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const list = document.getElementById(button.getAttribute('aria-controls'));
      const expanded = button.getAttribute('aria-expanded') === 'true';
      button.setAttribute('aria-expanded', String(!expanded));
      list.hidden = expanded;
    });
  });

  display.querySelector('.entry-favorite-button').addEventListener('click', () => {
    toggleFavoriteWord(lemmaKey);
  });

  display.querySelectorAll('[data-related-lemma]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      openRelatedWord(link.dataset.relatedLemma, link.dataset.relatedLanguage);
    });
  });

  display.querySelectorAll('.dictionary-navigation button').forEach(button => {
    button.addEventListener('click', () => {
      navigateDictionary(lemmaKey, Number(button.dataset.direction), button);
    });
  });
}

