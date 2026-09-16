import { LanguageCode, IndianVoicePersona, IndianVoiceConfig } from '../types';
import { offlineTTS } from './offlineTTS';

type SpeechCallback = () => void;
type ErrorCallback = (err: any) => void;

export interface SpeakOptions {
  persona?: IndianVoicePersona;
  transliteration?: string;
  dialect?: string;
  speed?: 'normal' | 'slow';
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: SpeechCallback;
  onEnd?: SpeechCallback;
  onError?: ErrorCallback;
}

class IndicSpeechService {
  private currentPersona: IndianVoicePersona = 'ananya';
  private currentEngine: 'neural' | 'device' = 'neural';
  private currentSpeed: 'normal' | 'slow' = 'normal';
  private currentVolume: number = 1.0;
  private isMuted: boolean = false;
  private currentAudio: HTMLAudioElement | null = null;
  private isCurrentlySpeaking = false;
  private neuralQuotaExhausted = false;
  // Invalidates delayed neural-audio responses after stop() or a new utterance.
  private speechRequestId = 0;
  private listeners: Set<(isSpeaking: boolean) => void> = new Set();
  private volumeLevelListeners: Set<(level: number) => void> = new Set();
  private volumeLevelTimer: any = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        const savedPersona = localStorage.getItem('indic_voice_persona') as IndianVoicePersona | null;
        if (savedPersona && ['ananya', 'arjun', 'pooja'].includes(savedPersona)) {
          this.currentPersona = savedPersona;
        } else {
          this.currentPersona = 'ananya'; // Default Indian voice persona
        }

        const savedEngine = localStorage.getItem('indic_voice_engine') as 'neural' | 'device' | null;
        if (savedEngine && ['neural', 'device'].includes(savedEngine)) {
          this.currentEngine = savedEngine;
        } else {
          this.currentEngine = 'neural';
          localStorage.setItem('indic_voice_engine', 'neural');
        }

        const savedSpeed = localStorage.getItem('indic_voice_speed') as 'normal' | 'slow' | null;
        if (savedSpeed && ['normal', 'slow'].includes(savedSpeed)) {
          this.currentSpeed = savedSpeed;
        }

        const savedVol = localStorage.getItem('indic_voice_volume');
        if (savedVol) {
          const parsed = parseFloat(savedVol);
          if (!isNaN(parsed) && parsed >= 0 && parsed <= 1.5) {
            this.currentVolume = parsed;
          }
        }
      } catch {
        // localStorage may be restricted in sandbox
      }
    }
  }

  public getConfig(): IndianVoiceConfig {
    return {
      persona: this.currentPersona,
      engine: this.currentEngine,
      speed: this.currentSpeed,
    };
  }

  public getVolume(): number {
    return this.isMuted ? 0 : this.currentVolume;
  }

  public getRawVolume(): number {
    return this.currentVolume;
  }

  public isVolumeMuted(): boolean {
    return this.isMuted;
  }

  public setVolume(volume: number) {
    const clamped = Math.max(0, Math.min(1.5, volume));
    this.currentVolume = clamped;
    if (this.currentAudio) {
      this.currentAudio.volume = this.isMuted ? 0 : Math.min(1.0, clamped);
    }
    try {
      localStorage.setItem('indic_voice_volume', String(clamped));
    } catch {}
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
    if (this.currentAudio) {
      this.currentAudio.volume = muted ? 0 : Math.min(1.0, this.currentVolume);
    }
  }

  public subscribeVolumeLevel(listener: (level: number) => void): () => void {
    this.volumeLevelListeners.add(listener);
    return () => this.volumeLevelListeners.delete(listener);
  }

  private startOutputLevelSimulation() {
    if (this.volumeLevelTimer) clearInterval(this.volumeLevelTimer);
    if (this.isMuted || this.currentVolume === 0) {
      for (const listener of this.volumeLevelListeners) listener(0);
      return;
    }
    this.volumeLevelTimer = setInterval(() => {
      if (!this.isCurrentlySpeaking) {
        if (this.volumeLevelTimer) clearInterval(this.volumeLevelTimer);
        for (const listener of this.volumeLevelListeners) listener(0);
        return;
      }
      // Dynamic output level between 0.4 and 0.95 scaled by volume
      const baseAmp = 0.4 + Math.random() * 0.55;
      const effectiveAmp = Math.min(1.0, baseAmp * Math.min(1.2, this.currentVolume));
      for (const listener of this.volumeLevelListeners) {
        listener(effectiveAmp);
      }
    }, 80);
  }

  private stopOutputLevelSimulation() {
    if (this.volumeLevelTimer) {
      clearInterval(this.volumeLevelTimer);
      this.volumeLevelTimer = null;
    }
    for (const listener of this.volumeLevelListeners) listener(0);
  }

  public setPersona(persona: IndianVoicePersona) {
    this.currentPersona = persona;
    try {
      localStorage.setItem('indic_voice_persona', persona);
    } catch {
      // ignore storage errors
    }
  }

  public setEngine(engine: 'neural' | 'device') {
    this.currentEngine = engine;
    try {
      localStorage.setItem('indic_voice_engine', engine);
    } catch {
      // ignore storage errors
    }
  }

  public setSpeed(speed: 'normal' | 'slow') {
    this.currentSpeed = speed;
    try {
      localStorage.setItem('indic_voice_speed', speed);
    } catch {
      // ignore storage errors
    }
  }

  public subscribe(listener: (isSpeaking: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(isSpeaking: boolean) {
    this.isCurrentlySpeaking = isSpeaking;
    if (isSpeaking) {
      this.startOutputLevelSimulation();
    } else {
      this.stopOutputLevelSimulation();
    }
    for (const listener of this.listeners) {
      listener(isSpeaking);
    }
  }

  public isSpeaking(): boolean {
    return this.isCurrentlySpeaking || offlineTTS.isSpeaking();
  }

  public stop() {
    this.speechRequestId += 1;
    this.stopOutputLevelSimulation();
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
      } catch (e) {
        // ignore
      }
      this.currentAudio = null;
    }
    offlineTTS.stop();
    this.notifyListeners(false);
  }

  /**
   * Primary speech synthesis function:
   * Uses Studio AI Neural Indian Voice by default when online,
   * with seamless fallback to offline Indian device voices.
   */
  public async speak(
    text: string,
    lang: LanguageCode,
    options: SpeakOptions = {},
  ): Promise<boolean> {
    if (!text || !text.trim()) return false;

    this.stop();
    const requestId = this.speechRequestId;

    const persona = options.persona || this.currentPersona;
    const speed = options.speed || this.currentSpeed;
    const isOnline = typeof navigator !== 'undefined' && navigator.onLine;

    // 1. If Neural Indian voice is active, device is online, and quota is not exhausted, attempt server TTS
    if (this.currentEngine === 'neural' && isOnline && !this.neuralQuotaExhausted) {
      try {
        this.notifyListeners(true);
        if (options.onStart) options.onStart();

        const res = await fetch('/api/synthesize-speech', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: text.trim(),
            lang,
            persona,
            dialect: options.dialect,
            speed,
          }),
        });

        // The audience may have changed language while the provider was
        // generating audio. Never start audio for an obsolete request.
        if (requestId !== this.speechRequestId) return false;

        if (!res.ok) {
          return this.fallbackToOfflineTTS(text, lang, { ...options, persona }, requestId);
        }

        const data = await res.json();
        if (data.quotaExhausted) {
          this.neuralQuotaExhausted = true;
        }

        if (data.fallbackToDevice || !data.audioBase64) {
          return this.fallbackToOfflineTTS(text, lang, { ...options, persona }, requestId);
        }

        const audioUri = `data:${data.mimeType || 'audio/wav'};base64,${data.audioBase64}`;
        const audio = new Audio(audioUri);
        audio.volume = this.isMuted ? 0 : Math.min(1.0, options.volume ?? this.currentVolume);
        this.currentAudio = audio;

        audio.onended = () => {
          if (requestId !== this.speechRequestId) return;
          this.currentAudio = null;
          this.notifyListeners(false);
          if (options.onEnd) options.onEnd();
        };

        audio.onerror = (e) => {
          if (requestId !== this.speechRequestId) return;
          console.warn('Audio playback error, falling back to device Indian voice:', e);
          this.currentAudio = null;
          this.fallbackToOfflineTTS(text, lang, options, requestId);
        };

        await audio.play();
        return true;
      } catch (err) {
        if (requestId !== this.speechRequestId) return false;
        console.warn('Neural Indian voice synthesis failed, falling back to device voice:', err);
        return this.fallbackToOfflineTTS(text, lang, { ...options, persona }, requestId);
      }
    }

    // 2. Offline or device engine mode
    return this.fallbackToOfflineTTS(text, lang, { ...options, persona });
  }

  private fallbackToOfflineTTS(
    text: string,
    lang: LanguageCode,
    options: SpeakOptions,
    requestId: number = this.speechRequestId,
  ): boolean {
    const rate = options.rate ?? (options.speed === 'slow' || this.currentSpeed === 'slow' ? 0.78 : 0.92);

    return offlineTTS.speak(text, lang, {
      transliteration: options.transliteration,
      persona: options.persona || this.currentPersona,
      rate,
      pitch: options.pitch,
      volume: this.isMuted ? 0 : Math.min(1.0, options.volume ?? this.currentVolume),
      onStart: () => {
        if (requestId !== this.speechRequestId) return;
        this.notifyListeners(true);
        if (options.onStart) options.onStart();
      },
      onEnd: () => {
        if (requestId !== this.speechRequestId) return;
        this.notifyListeners(false);
        if (options.onEnd) options.onEnd();
      },
      onError: (err) => {
        if (requestId !== this.speechRequestId) return;
        this.notifyListeners(false);
        if (options.onError) options.onError(err);
      },
    });
  }

  /**
   * Test current Indian Voice persona with an authentic regional greeting
   */
  public async testIndianVoice(persona?: IndianVoicePersona, lang: LanguageCode = 'en') {
    const selectedPersona = persona || this.currentPersona;
    const previousPersona = this.currentPersona;
    this.currentPersona = selectedPersona;

    const testPhrases: Record<LanguageCode, string> = {
      en: 'Namaste! This is your authentic Indian voice. Regional speech translation is active.',
      hi: 'नमस्ते! यह आपकी प्रामाणिक भारतीय आवाज़ है, स्पष्ट और सहज।',
      ta: 'வணக்கம்! இது உங்கள் உண்மையான இந்தியக் குரல்.',
      te: 'నమస్కారం! ఇది మీ సహజమైన భారతీయ స్వరం.',
      kn: 'ನಮಸ್ಕಾರ! ಇದು ನಿಮ್ಮ ಅಧಿಕೃತ ಭಾರತೀಯ ಧ್ವನಿ.',
      ml: 'നമസ്കാരം! ഇത് നിങ്ങളുടെ സ്വാഭാവികമായ ഇന്ത്യൻ ശബ്ദമാണ്.',
    };

    const phrase = testPhrases[lang] || testPhrases.en;
    await this.speak(phrase, lang);
    this.currentPersona = previousPersona;
  }
}

export const indicSpeech = new IndicSpeechService();
