/**
 * Text-to-Speech (TTS) Module
 * Suport pentru citirea textelor latine și grecești
 */

class TextToSpeech {
  constructor() {
    this.synth = window.speechSynthesis;
    this.isPlaying = false;
    this.currentUtterance = null;
    this.selectedText = '';
    this.language = 'lat'; // 'lat' pentru latină, 'grc' pentru greacă
    this.rate = 0.8; // Vorbire mai lentă pentru claritate
    this.pitch = 1.0;
    this.volume = 1.0;
  }

  /**
   * Verifică dacă browser-ul suportă Web Speech API
   */
  isSupported() {
    return !!(this.synth && window.SpeechSynthesisUtterance);
  }

  /**
   * Pornește citirea unui text
   */
  speak(text, language = 'lat') {
    if (!this.isSupported()) {
      alert('Browserul tău nu suportă citire vocală. Încearcă o versiune mai nouă.');
      return;
    }

    // Curăță orice vorbire anterioară
    this.stop();

    this.selectedText = text;
    this.language = language;

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = language === 'grc' ? 'el-GR' : 'la'; // la pentru latină
    utterance.rate = this.rate;
    utterance.pitch = this.pitch;
    utterance.volume = this.volume;

    utterance.onstart = () => {
      this.isPlaying = true;
      this.updateUIState('playing');
    };

    utterance.onend = () => {
      this.isPlaying = false;
      this.updateUIState('stopped');
    };

    utterance.onerror = (event) => {
      console.error('Eroare la citire:', event.error);
      this.isPlaying = false;
      this.updateUIState('error');
      alert('Eroare la citire vocală: ' + event.error);
    };

    this.currentUtterance = utterance;
    this.synth.speak(utterance);
  }

  /**
   * Oprește citirea
   */
  stop() {
    if (this.synth.speaking) {
      this.synth.cancel();
      this.isPlaying = false;
      this.updateUIState('stopped');
    }
  }

  /**
   * Pauză/Reluare
   */
  togglePause() {
    if (!this.isSupported()) return;

    if (this.synth.paused) {
      this.synth.resume();
      this.updateUIState('playing');
    } else if (this.synth.speaking) {
      this.synth.pause();
      this.updateUIState('paused');
    }
  }

  /**
   * Setează rata de vorbire (0.5 - 2.0)
   */
  setRate(rate) {
    this.rate = Math.max(0.5, Math.min(2.0, rate));
  }

  /**
   * Setează tonul vocii (0.5 - 2.0)
   */
  setPitch(pitch) {
    this.pitch = Math.max(0.5, Math.min(2.0, pitch));
  }

  /**
   * Setează volumul (0 - 1)
   */
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  /**
   * Actualizează starea UI
   */
  updateUIState(state) {
    document.querySelectorAll('[data-tts-control]').forEach(btn => {
      if (btn.dataset.ttsControl === 'play') {
        btn.disabled = state === 'playing';
        btn.classList.toggle('tts-active', state === 'playing');
      } else if (btn.dataset.ttsControl === 'stop') {
        btn.disabled = !this.isPlaying;
      }
    });
  }

  /**
   * Citește textul dintr-un element
   */
  speakElement(element, language = 'lat') {
    const text = element.innerText || element.textContent;
    if (text.trim()) {
      this.speak(text.trim(), language);
    }
  }
}

// Inițializare globală
const tts = new TextToSpeech();

/**
 * Funcție pentru a adauga controluri TTS la o secțiune de text
 */
function addTTSControls(container, text = null, language = 'lat') {
  const controlsDiv = document.createElement('div');
  controlsDiv.className = 'tts-controls';
  controlsDiv.setAttribute('role', 'group');
  controlsDiv.setAttribute('aria-label', 'Comenzi pentru citire vocală');

  const playBtn = document.createElement('button');
  playBtn.className = 'tts-button tts-play-btn';
  playBtn.type = 'button';
  playBtn.dataset.ttsControl = 'play';
  playBtn.setAttribute('aria-label', 'Citește textul');
  playBtn.title = 'Citește textul (🔊)';
  playBtn.innerHTML = '🔊 Citește';
  playBtn.addEventListener('click', () => {
    if (text) {
      tts.speak(text, language);
    } else {
      tts.speakElement(container, language);
    }
  });

  const stopBtn = document.createElement('button');
  stopBtn.className = 'tts-button tts-stop-btn';
  stopBtn.type = 'button';
  stopBtn.dataset.ttsControl = 'stop';
  stopBtn.setAttribute('aria-label', 'Oprește citirea');
  stopBtn.title = 'Oprește citirea (⏹️)';
  stopBtn.innerHTML = '⏹️ Oprește';
  stopBtn.disabled = true;
  stopBtn.addEventListener('click', () => tts.stop());

  const pauseBtn = document.createElement('button');
  pauseBtn.className = 'tts-button tts-pause-btn';
  pauseBtn.type = 'button';
  pauseBtn.dataset.ttsControl = 'pause';
  pauseBtn.setAttribute('aria-label', 'Pauză/Reluare');
  pauseBtn.title = 'Pauză/Reluare (⏸️)';
  pauseBtn.innerHTML = '⏸️ Pauză';
  pauseBtn.disabled = true;
  pauseBtn.addEventListener('click', () => {
    tts.togglePause();
    pauseBtn.innerHTML = tts.synth.paused ? '▶️ Reluează' : '⏸️ Pauză';
  });

  const speedControl = document.createElement('div');
  speedControl.className = 'tts-speed-control';
  
  const speedLabel = document.createElement('label');
  speedLabel.htmlFor = 'tts-speed-slider';
  speedLabel.textContent = 'Viteză:';
  speedLabel.className = 'tts-speed-label';

  const speedSlider = document.createElement('input');
  speedSlider.type = 'range';
  speedSlider.id = 'tts-speed-slider';
  speedSlider.min = '0.5';
  speedSlider.max = '2.0';
  speedSlider.step = '0.1';
  speedSlider.value = tts.rate;
  speedSlider.className = 'tts-speed-slider';
  speedSlider.setAttribute('aria-label', 'Viteza de citire');
  speedSlider.addEventListener('input', (e) => {
    tts.setRate(parseFloat(e.target.value));
  });

  const speedValue = document.createElement('span');
  speedValue.className = 'tts-speed-value';
  speedValue.textContent = tts.rate + 'x';
  speedSlider.addEventListener('input', (e) => {
    speedValue.textContent = parseFloat(e.target.value).toFixed(1) + 'x';
  });

  speedControl.appendChild(speedLabel);
  speedControl.appendChild(speedSlider);
  speedControl.appendChild(speedValue);

  controlsDiv.appendChild(playBtn);
  controlsDiv.appendChild(stopBtn);
  controlsDiv.appendChild(pauseBtn);
  controlsDiv.appendChild(speedControl);

  if (container.parentElement) {
    container.parentElement.insertBefore(controlsDiv, container);
  }

  return controlsDiv;
}

/**
 * Monitorizează starea de reproducere și actualizează butoanele
 */
if (tts.isSupported()) {
  const synth = window.speechSynthesis;
  setInterval(() => {
    document.querySelectorAll('[data-tts-control="stop"]').forEach(btn => {
      btn.disabled = !synth.speaking;
    });
    document.querySelectorAll('[data-tts-control="pause"]').forEach(btn => {
      btn.disabled = !synth.speaking;
    });
  }, 100);
}
