let currentMode = 'latin-dir';
const dictionaryTextDecoder = document.createElement('div');
let greekTypingSource = '';
let greekOutputToSource = [0];
let pendingGreekInput = null;
const greekTransliterationMap = {
  th: 'θ', q: 'θ', ph: 'φ', ch: 'χ', kh: 'χ', ps: 'ψ', ks: 'ξ',
  h: 'η', a: 'α', b: 'β', g: 'γ', d: 'δ', e: 'ε', z: 'ζ',
  i: 'ι', k: 'κ', l: 'λ', m: 'μ', n: 'ν', x: 'ξ',
  o: 'ο', p: 'π', r: 'ρ', s: 'σ', t: 'τ', y: 'υ', u: 'υ',
  f: 'φ', w: 'ω'
};
const remoteDictionaryCache = new Map();
const loadedDictionaryTargets = new Set();
let dictionaryCatalog = null;
let dictionaryCatalogLoadPromise = null;
let dictionaryDailyLoadPromise = null;
let dictionaryDailyLoaded = false;
const previousDailyLemmas = { gr: '', lat: '' };
let searchRequestId = 0;
const lexiconData = Object.create(null);
const recentSearchStorageKey = 'dic-ionar-online-recent-searches';
const recentSearchModes = new Set(['omnia-dir', 'greek-dir', 'latin-dir', 'omnia-rev', 'greek-rev', 'latin-rev']);
let recentSearchStorageError = null;
let recentSearches = [];
const favoriteStorageKey = 'dic-ionar-online-favorite-words';
let favoriteStorageError = null;
let favoriteWords = [];
const textFavoriteStorageKey = 'dic-ionar-online-favorite-texts';
let textFavoriteStorageError = null;
let textFavorites = [];
let showingFavoritesPage = false;
let showingTextFavoritesPage = false;
const dictionaryPage = document.getElementById('dictionaryPage');
const dictionaryFooter = document.getElementById('dictionaryFooter');
const textsPage = document.getElementById('textsPage');
const textsFooter = document.getElementById('textsFooter');
const pageNavigationLink = document.getElementById('pageNavigationLink');
const pageNavigationLabel = document.getElementById('pageNavigationLabel');
const dictionaryDailySection = document.getElementById('dictionaryDailySection');
const dictionaryDailyCards = document.getElementById('dictionaryDailyCards');
const textsDailySection = document.getElementById('textsDailySection');
const textsDailyCards = document.getElementById('textsDailyCards');
const textsSearchForm = document.getElementById('textsSearchForm');
const textsSearchInput = document.getElementById('textsSearchInput');
const textsSearchStatus = document.getElementById('textsSearchStatus');
const textsAutocomplete = document.getElementById('textsAutocomplete');
const textsAutocompleteTitle = document.getElementById('textsAutocompleteTitle');
const textsAutocompleteList = document.getElementById('textsAutocompleteList');
const textsSearchResults = document.getElementById('textsSearchResults');
const textsBrowser = document.getElementById('textsBrowser');
const textsBreadcrumbs = document.getElementById('textsBreadcrumbs');
const textsDirectoryHeading = document.getElementById('textsDirectoryHeading');
const textsDirectoryTitle = document.getElementById('textsDirectoryTitle');
const textsDirectoryList = document.getElementById('textsDirectoryList');
const textsChapterView = document.getElementById('textsChapterView');
const textsBackButton = document.getElementById('textsBackButton');
const dictionaryPageTitle = document.title;
let textDatabase = [];
let textDatabaseLoaded = false;
let textDatabaseLoadPromise = null;
let textCatalog = [];
let textCatalogLoaded = false;
let textCatalogLoadPromise = null;
const textDocumentCache = new Map();
const textDocumentLoadPromises = new Map();
let textsDailyLoadPromise = null;
let textsDailyLoaded = false;
const previousTextSelections = { gr: '', lat: '' };
const textLanguageGroups = [
  {
    id: 'gr',
    label: 'Autori greci',
    description: 'Texte în greacă veche',
    emptyMessage: 'Nu există încă autori greci în colecție.'
  },
  {
    id: 'lat',
    label: 'Autori latini',
    description: 'Texte în latină',
    emptyMessage: 'Nu există încă autori latini în colecție.'
  }
];
let textNavigation = { level: 'collections', languageGroup: '', author: '', work: '', volume: '' };
let authorProfiles = {
  Caesar: {
    name: 'Gaius Iulius Caesar',
    image: 'assets/authors/caesar.jpg',
    alt: 'Portret sculptat al lui Iulius Caesar',
    years: '100–44 î.Hr.',
    description: 'General, om politic și scriitor roman; autorul comentariilor despre războaiele din Gallia și războiul civil.'
  },
  Cicero: {
    name: 'M. Tullius Cicero',
    image: 'assets/authors/cicero.jpg',
    alt: 'Bustul lui Marcus Tullius Cicero',
    years: '106–43 î.Hr.',
    description: 'Orator, filosof și om politic roman, autor al unor discursuri și scrieri despre retorică și filosofie.'
  },
  Plato: {
    name: 'Platon',
    image: 'assets/authors/plato.jpg',
    alt: 'Bustul lui Platon',
    years: 'c. 428/427–348/347 î.Hr.',
    description: 'Filosof grec, fondator al Academiei din Atena și autor al unor dialoguri fundamentale.'
  },
  Aristotel: {
    name: 'Aristotel',
    image: 'assets/authors/aristotle.jpg',
    alt: 'Bustul lui Aristotel',
    years: '384–322 î.Hr.',
    description: 'Filosof și cercetător grec, discipol al lui Platon și fondator al școlii peripatetice.'
  },
  Aristofan: {
    name: 'Aristofan',
    image: 'assets/authors/aristophanes.jpg',
    alt: 'Bustul lui Aristofan',
    years: 'c. 446–386 î.Hr.',
    description: 'Dramaturg atenian, cel mai cunoscut reprezentant al comediei vechi grecești. Comediile sale satirizează viața politică, societatea și cultura Atenei.'
  },
  Homer: {
    name: 'Homer',
    image: 'assets/authors/homer.jpg',
    alt: 'Bustul lui Homer (Musei Capitolini, MC 557)',
    years: 'tradițional, sec. VIII î.Hr.',
    description: 'Poet epic al Greciei antice, căruia îi sunt atribuite în mod tradițional Iliada și Odiseea. Opera sa a influențat profund literatura și cultura greacă.'
  },
  Ovidiu: {
    name: 'Ovidiu',
    image: 'assets/authors/ovid.jpg',
    alt: 'Statuia lui Ovidiu din Constanța',
    years: '43 î.Hr.–17/18 d.Hr.',
    description: 'Poet roman cunoscut pentru elegiile sale, Ars amatoria și poemul mitologic Metamorfoze.'
  },
  Horatius: {
    name: 'Horatius',
    image: 'assets/authors/horatius.jpg',
    alt: 'Statuia lui Horatius din Venosa',
    years: '65–8 î.Hr.',
    description: 'Poet liric roman cunoscut pentru Ode, Epode, Satire și Epistole; autor al Ars poetica.'
  },
  Vergilius: {
    name: 'Vergil',
    image: 'assets/authors/vergilius.jpg',
    alt: 'Bustul lui Vergil',
    years: '70–19 î.Hr.',
    description: 'Poet roman, autorul Eneidei, Georgicelor și Bucolicelor.'
  },
  Liviu: {
    name: 'Titus Livius',
    image: 'assets/authors/livius.jpg',
    alt: 'Bustul lui Titus Livius',
    years: '59 î.Hr.–17 d.Hr.',
    description: 'Istoric roman, autorul lucrării Ab urbe condita, o amplă istorie a Romei.'
  },
  Tucidide: {
    name: 'Tucidide',
    image: 'assets/authors/thucydides.jpg',
    alt: 'Bustul lui Tucidide',
    years: 'c. 460–c. 400 î.Hr.',
    description: 'Istoric atenian, autorul Istoriei războiului peloponesiac, una dintre cele mai importante relatări ale conflictului dintre Atena și Sparta.'
  },
  Xenofon: {
    name: 'Xenofon',
    image: 'assets/authors/xenophon.jpg',
    alt: 'Bustul lui Xenofon',
    years: 'c. 430–354 î.Hr.',
    description: 'Istoric, comandant și eseist grec, cunoscut pentru Anabasis, Memorabilia și relatările despre Socrate.'
  },
  Lucretius: {
    name: 'Titus Lucretius Carus',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Lucretius_Carus_Titus_Lucretius_Carus_floruit_55_BCE_Ancient_Roman_poet_and_philosopher.jpg/440px-Lucretius_Carus_Titus_Lucretius_Carus_floruit_55_BCE_Ancient_Roman_poet_and_philosopher.jpg',
    alt: 'Portretul lui Lucretius',
    years: 'c. 94–55 î.Hr.',
    description: 'Poet roman și filosof epicurean, autorul poemului didactic De rerum natura (Despre natura lucrurilor), care prezintă filosofia lui Epicur și teoriile atomiste.'
  },
  Quintilian: {
    name: 'Marcus Fabius Quintilianus',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Quintilian_bust.jpg/440px-Quintilian_bust.jpg',
    alt: 'Portretul lui Marcus Fabius Quintilianus',
    years: 'c. 35–100 d.Hr.',
    description: 'Retor și pedagog roman, autorul Institutio oratoria (Instituțiile oratorului), tratat complet despre educație și arta oratoriei.'
  },
  Seneca: {
    name: 'Lucius Annaeus Seneca',
    image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Seneca_MAN_Napoli_6265_cropped.jpg/440px-Seneca_MAN_Napoli_6265_cropped.jpg',
    alt: 'Portretul lui Seneca',
    years: 'c. 4 î.Hr.–65 d.Hr.',
    description: 'Filosof stoic, dramaturg și om politic roman, autorul unor tratate filosofice, tragedii și Epistole morale.'
  }
};
let activeTextChapter = null;


function syncSitePageFromLocation() {
  const showingTexts = window.location.hash === '#texte';
  if (!showingTexts) showingTextFavoritesPage = false;
  dictionaryPage.hidden = showingTexts;
  dictionaryFooter.hidden = showingTexts;
  textsPage.hidden = !showingTexts;
  textsFooter.hidden = !showingTexts;
  pageNavigationLink.href = showingTexts ? '#dictionar' : '#texte';
  pageNavigationLabel.textContent = showingTexts ? 'Dicționar' : 'Texte';
  document.title = showingTexts ? 'Texte clasice — GrecLaRo' : 'GrecLaRo — Dicționar Latin-Român și Greacă Veche-Român';

  if (showingTexts) {
    initializeTextBrowserHistory();
    if (!textCatalogLoaded) loadTextCatalog();
    if (textNavigation.level === 'collections' && !showingTextFavoritesPage) {
      requestAnimationFrame(() => {
        if (window.location.hash === '#texte'
          && textNavigation.level === 'collections'
          && !showingTextFavoritesPage) {
          refreshTextHighlights();
        }
      });
    }
  } else if (!showingFavoritesPage) {
    requestAnimationFrame(() => {
      if (window.location.hash !== '#texte' && !showingFavoritesPage) {
        refreshDictionaryHighlights();
      }
    });
  }
}

function navigateToSitePage(page) {
  const targetHash = page === 'texts' ? '#texte' : '#dictionar';
  if (window.location.hash !== targetHash) window.location.hash = targetHash;
  syncSitePageFromLocation();
}

function randomItem(items) {
  if (!items.length) return null;
  return items[Math.floor(Math.random() * items.length)];
}






function createDailyCardRefreshButton(label, refreshAction) {
  const button = document.createElement('button');
  button.className = 'daily-card-refresh';
  button.type = 'button';
  button.setAttribute('aria-label', label);
  button.title = label;
  const icon = document.createElement('span');
  icon.className = 'daily-card-refresh-icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.textContent = '🎲';
  button.appendChild(icon);
  const text = document.createElement('span');
  text.textContent = 'Schimbă';
  button.appendChild(text);
  button.addEventListener('click', async event => {
    event.stopPropagation();
    if (button.disabled) return;
    button.disabled = true;
    button.classList.add('is-loading');
    try {
      await refreshAction();
    } finally {
      button.disabled = false;
      button.classList.remove('is-loading');
    }
  });
  return button;
}

function createDailyMessageCard(title, message, isError = false, refreshAction = null, dataLanguage = null) {
  const card = document.createElement('article');
  card.className = 'daily-selection-card';
  if (dataLanguage) card.dataset.dailyLanguage = dataLanguage;
  const heading = document.createElement('h3');
  heading.textContent = title;
  const status = document.createElement('p');
  status.className = 'daily-selection-status';
  status.textContent = message;
  status.setAttribute('role', 'status');
  if (isError) status.dataset.state = 'error';
  card.append(heading, status);
  if (refreshAction) {
    card.appendChild(createDailyCardRefreshButton(`Reîmprospătează ${title}`, refreshAction));
  }
  return card;
}










































































function showFavoritesPage() {
  navigateToSitePage('dictionary');
  toggleSiteMenu();
  showingFavoritesPage = true;
  renderFavoritesPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function showTextFavoritesPage() {
  showingFavoritesPage = false;
  showingTextFavoritesPage = false;
  navigateToSitePage('texts');
  showingTextFavoritesPage = true;
  pushTextBrowserHistoryState();
  toggleSiteMenu();
  renderTextFavoritesPage();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}







































function clearSearch() {
  searchRequestId++;
  pendingGreekInput = null;
  const input = document.getElementById('searchInput');
  input.value = '';
  document.getElementById('autocompleteDropdown').classList.remove('active');
  input.focus();
  handleSearch('');
}

function resetToHome() {
  showingFavoritesPage = false;
  showingTextFavoritesPage = false;
  navigateToSitePage('dictionary');
  setSearchMode('latin-dir');
  clearSearch();
}

function toggleKeyboard() {
  const panel = document.getElementById('keyboardPanel');
  panel.classList.toggle('active');
  if (panel.classList.contains('active')) {
    const language = currentMode === 'greek-dir' ? 'greek' : 'latin';
    setKeyboardLanguage(language);
  }
}

function renderKeyboardGroup(container, title, forms) {
  const group = document.createElement('div');
  group.className = 'kb-group';

  const heading = document.createElement('div');
  heading.className = 'kb-group-title';
  heading.textContent = title;

  const keys = document.createElement('div');
  keys.className = 'kb-keys';
  forms.forEach(({ character, description }) => {
    const button = document.createElement('button');
    button.className = 'kb-key';
    button.type = 'button';
    button.textContent = character;
    button.title = description;
    button.setAttribute('aria-label', `${character} — ${description}`);
    button.addEventListener('click', () => insertChar(character));
    keys.appendChild(button);
  });

  group.append(heading, keys);
  container.appendChild(group);
}

function renderLatinKeyboard() {
  const container = document.getElementById('latinKeyboardKeys');
  if (container.childElementCount) return;

  const vowels = ['a', 'e', 'i', 'o', 'u', 'y'];
  [
    { title: 'Vocale cu macron (lungi)', mark: '\u0304', name: 'macron' },
    { title: 'Vocale cu breve (scurte)', mark: '\u0306', name: 'breve' }
  ].forEach(({ title, mark, name }) => {
    const forms = vowels.flatMap(vowel => [vowel, vowel.toUpperCase()].map(letter => ({
      character: (letter + mark).normalize('NFC'),
      description: `${letter} cu ${name}`
    })));
    renderKeyboardGroup(container, title, forms);
  });
}

function renderGreekKeyboard() {
  const container = document.getElementById('greekKeyboardKeys');
  if (container.childElementCount) return;

  const vowels = [
    { lower: 'α', upper: 'Α', subscript: true },
    { lower: 'ε', upper: 'Ε' },
    { lower: 'η', upper: 'Η', subscript: true },
    { lower: 'ι', upper: 'Ι', diaeresis: true },
    { lower: 'ο', upper: 'Ο' },
    { lower: 'υ', upper: 'Υ', diaeresis: true },
    { lower: 'ω', upper: 'Ω', subscript: true }
  ];
  const breathings = [
    { mark: '\u0313', name: 'spiritus lenis' },
    { mark: '\u0314', name: 'spiritus asper' }
  ];
  const accents = [
    { mark: '\u0301', name: 'accent acut' },
    { mark: '\u0300', name: 'accent grav' },
    { mark: '\u0342', name: 'accent circumflex' }
  ];

  vowels.forEach(({ lower, upper, subscript, diaeresis }) => {
    [lower, upper].forEach(base => {
      const forms = [{ character: base, description: `${base} fără diacritice` }];
      breathings.forEach(breathing => {
        forms.push({
          character: (base + breathing.mark).normalize('NFC'),
          description: `${base}, ${breathing.name}`
        });
      });
      accents.forEach(accent => {
        forms.push({
          character: (base + accent.mark).normalize('NFC'),
          description: `${base}, ${accent.name}`
        });
      });
      breathings.forEach(breathing => accents.forEach(accent => {
        forms.push({
          character: (base + breathing.mark + accent.mark).normalize('NFC'),
          description: `${base}, ${breathing.name} și ${accent.name}`
        });
      }));

      if (subscript) {
        const subscriptMark = '\u0345';
        forms.push({
          character: (base + subscriptMark).normalize('NFC'),
          description: `${base} cu iotă subscrisă`
        });
        breathings.forEach(breathing => {
          forms.push({
            character: (base + breathing.mark + subscriptMark).normalize('NFC'),
            description: `${base}, ${breathing.name} și iotă subscrisă`
          });
        });
        accents.forEach(accent => {
          forms.push({
            character: (base + accent.mark + subscriptMark).normalize('NFC'),
            description: `${base}, ${accent.name} și iotă subscrisă`
          });
        });
        breathings.forEach(breathing => accents.forEach(accent => {
          forms.push({
            character: (base + breathing.mark + accent.mark + subscriptMark).normalize('NFC'),
            description: `${base}, ${breathing.name}, ${accent.name} și iotă subscrisă`
          });
        }));
      }

      if (diaeresis) {
        const diaeresisMark = '\u0308';
        forms.push({
          character: (base + diaeresisMark).normalize('NFC'),
          description: `${base} cu trema`
        });
        accents.slice(0, 2).forEach(accent => {
          forms.push({
            character: (base + diaeresisMark + accent.mark).normalize('NFC'),
            description: `${base} cu trema și ${accent.name}`
          });
        });
      }

      renderKeyboardGroup(
        container,
        `Vocale ${base === lower ? 'mici' : 'mari'}: ${base}`,
        forms
      );
    });
  });
}

function setKeyboardLanguage(language) {
  const latinSelected = language === 'latin';
  document.getElementById('kbTabLatin').classList.toggle('active', latinSelected);
  document.getElementById('kbTabLatin').setAttribute('aria-selected', String(latinSelected));
  document.getElementById('kbTabGreek').classList.toggle('active', !latinSelected);
  document.getElementById('kbTabGreek').setAttribute('aria-selected', String(!latinSelected));
  document.getElementById('kbLatinPanel').hidden = !latinSelected;
  document.getElementById('kbGreekPanel').hidden = latinSelected;
  if (latinSelected) renderLatinKeyboard();
  else renderGreekKeyboard();
}

function insertChar(char) {
  const input = document.getElementById('searchInput');
  pendingGreekInput = null;
  const start = input.selectionStart;
  const end = input.selectionEnd;
  input.value = input.value.substring(0, start) + char + input.value.substring(end);
  input.focus();
  input.selectionStart = input.selectionEnd = start + char.length;
  handleSearchInput(input.value);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const target = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', target);
  if (target === 'dark') document.documentElement.classList.add('dark');
  else document.documentElement.classList.remove('dark');
  try {
    localStorage.setItem('grelaro-theme-mode', target);
  } catch (error) {
    console.warn('Nu s-a putut salva tema.', error);
  }
  const themeToggle = document.getElementById('themeToggleBtn');
  const actionLabel = target === 'dark' ? 'Activează modul luminos' : 'Activează modul nocturn';
  document.getElementById('themeToggleIcon').textContent = target === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', actionLabel);
  themeToggle.title = actionLabel;
}

function toggleSiteMenu() {
  const panel = document.getElementById('siteMenuPanel');
  const toggle = document.getElementById('siteMenuToggle');
  const isOpen = !panel.hidden;
  panel.hidden = isOpen;
  toggle.setAttribute('aria-expanded', String(!isOpen));
  const actionLabel = isOpen ? 'Deschide meniul' : 'Închide meniul';
  toggle.setAttribute('aria-label', actionLabel);
  toggle.title = actionLabel;
  if (isOpen) showMainMenu();
}

function showAppearanceMenu() {
  document.getElementById('siteMenuMain').hidden = true;
  document.getElementById('appearanceMenu').hidden = false;
}

function showMainMenu() {
  document.getElementById('siteMenuMain').hidden = false;
  document.getElementById('appearanceMenu').hidden = true;
}
function setColorTheme(color) {
  const root = document.documentElement;
  if (color === 'default') root.removeAttribute('data-color-theme');
  else root.setAttribute('data-color-theme', color);
  try {
    localStorage.setItem('grelaro-color-theme', color);
  } catch (error) {
    console.warn('Nu s-a putut salva culoarea temei.', error);
  }

  document.querySelectorAll('.theme-swatch').forEach((swatch) => {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.colorTheme === color));
  });
}

const feedbackDialog = document.getElementById('feedbackDialog');
feedbackDialog.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') closeFeedbackDialog();
});
feedbackDialog.addEventListener('click', (event) => {
  if (event.target === feedbackDialog) closeFeedbackDialog();
});

function openFeedbackDialog() {
  document.getElementById('feedbackStatus').textContent = '';
  document.getElementById('feedbackStatus').removeAttribute('data-state');
  feedbackDialog.showModal();
  document.getElementById('feedbackMessage').focus();
}

function closeFeedbackDialog() {
  feedbackDialog.close();
}

async function submitFeedback(event) {
  event.preventDefault();
  const form = document.getElementById('feedbackForm');
  const submitButton = document.getElementById('feedbackSubmit');
  const status = document.getElementById('feedbackStatus');
  const formData = new FormData(form);

  submitButton.disabled = true;
  status.textContent = 'Se trimite mesajul…';
  status.removeAttribute('data-state');

  try {
    let response;
    try {
      response = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: formData.get('message'),
          email: formData.get('email'),
          website: formData.get('website')
        })
      });
    } catch {
      throw new Error('Nu s-a putut conecta la server. Încearcă din nou.');
    }

    let result;
    try {
      result = await response.json();
    } catch {
      throw new Error('Serverul a returnat un răspuns invalid. Încearcă din nou.');
    }
    if (!response.ok) {
      throw new Error(result.error || 'Mesajul nu a putut fi trimis. Încearcă din nou.');
    }

    form.reset();
    status.textContent = 'Mesajul a fost trimis. Mulțumim!';
    status.dataset.state = 'success';
  } catch (error) {
    status.textContent = error.message || 'Nu s-a putut trimite mesajul. Verifică internetul și încearcă din nou.';
    status.dataset.state = 'error';
  } finally {
    submitButton.disabled = false;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.innerText = text;
  return div.innerHTML;
}

function escapeHtmlAttribute(text) {
  return escapeHtml(text).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const clickActions = {
  'reset-home': () => resetToHome(),
  'toggle-theme': () => toggleTheme(),
  'toggle-site-menu': () => toggleSiteMenu(),
  'show-appearance-menu': () => showAppearanceMenu(),
  'show-favorites': () => showFavoritesPage(),
  'show-text-favorites': () => showTextFavoritesPage(),
  'show-main-menu': () => showMainMenu(),
  'set-color-theme': element => setColorTheme(element.dataset.colorTheme),
  'set-search-mode': element => setSearchMode(element.dataset.mode),
  'submit-search': () => submitSearch(),
  'clear-search': () => clearSearch(),
  'toggle-recent-searches': () => toggleRecentSearches(),
  'clear-recent-searches': () => clearRecentSearches(),
  'toggle-keyboard': () => toggleKeyboard(),
  'toggle-greek-key-table': () => toggleGreekKeyTable(),
  'set-keyboard-language': element => setKeyboardLanguage(element.dataset.language),
  'insert-char': element => insertChar(element.dataset.character),
  'open-feedback': () => openFeedbackDialog(),
  'close-feedback': () => closeFeedbackDialog()
};

const searchInput = document.getElementById('searchInput');
searchInput.addEventListener('beforeinput', handleGreekTransliterationInput);
searchInput.addEventListener('input', () => {
  applyPendingGreekTransliterationInput(searchInput);
  handleSearchInput(searchInput.value);
});
searchInput.addEventListener('keydown', handleSearchKeydown);

textsChapterView.addEventListener('copy', event => {
  const selection = window.getSelection();
  const selectedText = selection?.toString();
  if (!selectedText || !selection.anchorNode || !selection.focusNode
    || !textsChapterView.contains(selection.anchorNode)
    || !textsChapterView.contains(selection.focusNode)
    || !event.clipboardData) {
    return;
  }

  event.clipboardData.clearData();
  event.clipboardData.setData('text/plain', selectedText);
  event.preventDefault();
});

document.getElementById('feedbackForm').addEventListener('submit', submitFeedback);

document.addEventListener('click', (e) => {
  const actionTarget = e.target instanceof Element ? e.target.closest('[data-action]') : null;
  if (actionTarget) {
    clickActions[actionTarget.dataset.action]?.(actionTarget);
  }

  if (!e.target.closest('.search-section')) {
    document.getElementById('autocompleteDropdown').classList.remove('active');
  }
  if (!e.target.closest('.texts-search-panel')) {
    textsAutocomplete.classList.remove('active');
  }
  if (!e.target.closest('.recent-search-wrap') && !document.getElementById('recentSearchDropdown').hidden) {
    closeRecentSearches();
  }
  if (!e.target.closest('.site-menu') && !document.getElementById('siteMenuPanel').hidden) {
    toggleSiteMenu();
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !document.getElementById('recentSearchDropdown').hidden) {
    closeRecentSearches();
    document.getElementById('recentSearchToggle').focus();
  }
  if (e.key === 'Escape' && !document.getElementById('siteMenuPanel').hidden) {
    toggleSiteMenu();
    document.getElementById('siteMenuToggle').focus();
  }
});

textsSearchForm.addEventListener('submit', async event => {
  event.preventDefault();
  await renderTextsSearchResults(textsSearchInput.value);
});

textsSearchInput.addEventListener('input', () => {
  updateTextAutocomplete(textsSearchInput.value);
});

textsSearchInput.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    textsAutocomplete.classList.remove('active');
  }
});

textsBackButton.addEventListener('click', navigateBackInTextBrowser);

window.addEventListener('hashchange', syncSitePageFromLocation);

window.addEventListener('DOMContentLoaded', () => {
  let savedMode = 'dark';
  let savedColor = 'blue';
  try {
    savedMode = localStorage.getItem('grelaro-theme-mode') || 'dark';
    savedColor = localStorage.getItem('grelaro-color-theme') || 'blue';
  } catch (error) {
    console.warn('Nu s-au putut încărca preferințele de temă.', error);
  }
  document.documentElement.setAttribute('data-theme', savedMode);
  document.documentElement.classList.toggle('dark', savedMode === 'dark');
  if (savedColor === 'default') document.documentElement.removeAttribute('data-color-theme');
  else document.documentElement.setAttribute('data-color-theme', savedColor);
  document.querySelectorAll('.theme-swatch').forEach(swatch => {
    swatch.setAttribute('aria-pressed', String(swatch.dataset.colorTheme === savedColor));
  });
  const themeToggle = document.getElementById('themeToggleBtn');
  const actionLabel = savedMode === 'dark' ? 'Activează modul luminos' : 'Activează modul nocturn';
  document.getElementById('themeToggleIcon').textContent = savedMode === 'dark' ? '☀️' : '🌙';
  themeToggle.setAttribute('aria-label', actionLabel);
  themeToggle.title = actionLabel;
  
  // Initialize storage-based variables after all scripts have loaded
  recentSearches = loadRecentSearches();
  favoriteWords = loadFavoriteWords();
  textFavorites = loadTextFavorites();
  
  setSearchMode('latin-dir');
  syncSitePageFromLocation();
});