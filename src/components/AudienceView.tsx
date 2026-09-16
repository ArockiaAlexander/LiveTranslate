import React, { useState, useEffect, useRef } from 'react';
import {
  Headphones,
  Volume2,
  VolumeX,
  Play,
  Pause,
  Radio,
  Globe,
  Sparkles,
  RotateCcw,
  Search,
  Sliders,
  Check,
  User,
  Smartphone,
  ShieldCheck,
  Maximize2,
  Minimize2,
  Copy,
  Zap,
  Bookmark,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  LanguageCode,
  ConferenceSpeechSegment,
  IndianVoicePersona,
  LiveOperatorActivity,
  LiveOperatorStatus,
} from '../types';
import { SUPPORTED_LANGUAGES, LANGUAGE_LIST } from '../data/languages';
import {
  DEFAULT_CONFERENCE_INFO,
  ConferenceMetadata,
} from '../data/conferenceProgram';
import {
  conferenceSpeechManager,
  PlaybackState,
} from '../services/conferenceSpeechManager';
import { indicSpeech } from '../services/indicSpeechService';
import { SSVPLogo } from './SSVPLogo';
import { liveConferenceTransport } from '../services/liveConferenceTransport';

interface AudienceViewProps {
  onSwitchToOperator?: () => void;
}

export function AudienceView({ onSwitchToOperator }: AudienceViewProps) {
  // Conference configuration (shared from localStorage or defaults)
  const [conferenceInfo] = useState<ConferenceMetadata>(() => {
    try {
      const savedUpcoming = localStorage.getItem('indicvoice_upcoming_conference_info');
      if (savedUpcoming) {
        const parsed = JSON.parse(savedUpcoming);
        if (parsed && parsed.title && parsed.title !== 'Live Multilingual Conference') {
          return parsed;
        }
      }
      const saved = localStorage.getItem('indicvoice_conference_metadata');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.title && parsed.title !== 'Live Multilingual Conference') {
          return parsed;
        }
      }
    } catch {}
    return DEFAULT_CONFERENCE_INFO;
  });

  // User Selection of Language to be heard (Defaults to Hindi or saved channel)
  const [listeningLang, setListeningLang] = useState<LanguageCode>(() => {
    try {
      const saved = localStorage.getItem('indicvoice_listening_channel');
      if (saved && saved in SUPPORTED_LANGUAGES) return saved as LanguageCode;
    } catch {}
    return 'hi';
  });

  // Live Proceedings segments
  const [allSegments, setAllSegments] = useState<ConferenceSpeechSegment[]>(() => {
    try {
      const saved = localStorage.getItem('indicvoice_live_proceedings');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);

  // Playback state from manager
  const [playbackState, setPlaybackState] = useState<PlaybackState>(() =>
    conferenceSpeechManager.getPlaybackState(),
  );

  // Audio & Display settings
  const [isAudioTunedIn, setIsAudioTunedIn] = useState(true);
  const [liveConnectionStatus, setLiveConnectionStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('connecting');
  const [operatorStatus, setOperatorStatus] = useState<LiveOperatorStatus>({
    activity: 'offline',
    updatedAt: Date.now(),
  });
  const [volume, setVolume] = useState<number>(85);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState<'normal' | 'slow'>('normal');
  const [voicePersona, setVoicePersona] = useState<IndianVoicePersona>(() => indicSpeech.getConfig().persona);
  const [showSettings, setShowSettings] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // UX Enhancements: Font Zoom & Vocal Clarity EQ Booster
  const [fontSize, setFontSize] = useState<'base' | 'lg' | 'xl' | '2xl'>('xl');
  const [isClarityBoost, setIsClarityBoost] = useState(true);
  const listeningLangRef = useRef(listeningLang);
  const isAudioTunedInRef = useRef(true);
  const voicePersonaRef = useRef(voicePersona);

  useEffect(() => {
    indicSpeech.setMuted(false);
    conferenceSpeechManager.setMuted(false);
  }, []);

  // Sync with live manager and local storage events
  useEffect(() => {
    const unsubPlayback = conferenceSpeechManager.subscribePlayback((state) => {
      setPlaybackState(state);
      if (state.currentSegmentIndex >= 0) {
        setActiveSegmentIndex(state.currentSegmentIndex);
      }
    });

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'indicvoice_live_proceedings') {
        if (e.newValue === null) {
          setAllSegments([]);
          setActiveSegmentIndex(0);
          conferenceSpeechManager.stopAudio();
          indicSpeech.stop();
          return;
        }

        try {
          const updated = JSON.parse(e.newValue);
          if (Array.isArray(updated)) {
            setAllSegments(updated);
            setActiveSegmentIndex(updated.length > 0 ? updated.length - 1 : 0);
          }
        } catch {}
      }
    };

    window.addEventListener('storage', handleStorageChange);

    return () => {
      unsubPlayback();
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useEffect(() => {
    listeningLangRef.current = listeningLang;
    liveConferenceTransport.setLanguage(listeningLang);
  }, [listeningLang]);

  useEffect(() => {
    liveConferenceTransport.connect('audience', listeningLang, {
      onStatus: setLiveConnectionStatus,
      onOperatorStatus: (status) => {
        setOperatorStatus(status);
      },
      onSegment: (segment) => {
        setAllSegments((previous) => {
          if (previous.some((item) => item.id === segment.id)) return previous;
          return [...previous, segment];
        });
        setActiveSegmentIndex((previous) => previous + 1);
        if (isAudioTunedInRef.current) {
          const translation = segment.translations[listeningLangRef.current];
          indicSpeech.speak(translation?.translatedText || segment.speakerText, listeningLangRef.current, {
            persona: voicePersonaRef.current,
            transliteration: translation?.transliteration,
            speed: playbackSpeed,
          });
        }
      },
      onClear: () => {
        setAllSegments([]);
        setActiveSegmentIndex(0);
        conferenceSpeechManager.stopAudio();
        indicSpeech.stop();
        try {
          localStorage.removeItem('indicvoice_live_proceedings');
        } catch {}
      },
    });
    return () => liveConferenceTransport.disconnect();
  }, []);

  // Update listening language
  const handleSelectLanguage = (lang: LanguageCode) => {
    if (lang === listeningLangRef.current) return;

    // V1 policy: never replay or mix a partially spoken segment after a
    // language change. The next complete live segment uses the new language.
    listeningLangRef.current = lang;
    indicSpeech.stop();
    setListeningLang(lang);
    conferenceSpeechManager.setListeningLang(lang);
    try {
      localStorage.setItem('indicvoice_listening_channel', lang);
    } catch {}
  };

  // Playback volume
  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    indicSpeech.setVolume((newVal / 100) * (isClarityBoost ? 1.25 : 1.0));
    if (isMuted && newVal > 0) {
      setIsMuted(false);
      indicSpeech.setMuted(false);
    }
  };

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    indicSpeech.setMuted(nextMuted);
  };

  const handleSpeedChange = (speed: 'normal' | 'slow') => {
    setPlaybackSpeed(speed);
    indicSpeech.setSpeed(speed);
  };

  const handlePersonaChange = (persona: IndianVoicePersona) => {
    voicePersonaRef.current = persona;
    setVoicePersona(persona);
    indicSpeech.setPersona(persona);
    indicSpeech.stop();
    if (isAudioTunedInRef.current && allSegments.length > 0) {
      void handleReplaySegment(allSegments[allSegments.length - 1], persona);
    }
  };

  const handleToggleClarityBoost = () => {
    const nextBoost = !isClarityBoost;
    setIsClarityBoost(nextBoost);
    indicSpeech.setVolume((volume / 100) * (nextBoost ? 1.25 : 1.0));
  };

  // Play a specific segment on demand
  const handleReplaySegment = async (seg: ConferenceSpeechSegment, persona = voicePersonaRef.current) => {
    const trans = seg.translations[listeningLang];
    indicSpeech.setPersona(persona);
    const started = await indicSpeech.speak(trans?.translatedText || seg.speakerText, listeningLang, {
      persona,
      transliteration: trans?.transliteration,
      speed: playbackSpeed,
    });
    if (started) {
      setIsAudioTunedIn(true);
      liveConferenceTransport.setAudioReady(true);
    }
  };

  // Copy segment text
  const handleCopyQuote = (seg: ConferenceSpeechSegment) => {
    const trans = seg.translations[listeningLang];
    const textToCopy = `[${conferenceInfo.title}]\n"${trans?.translatedText || seg.speakerText}"\n— ${seg.speakerName || 'Speaker'} (${SUPPORTED_LANGUAGES[listeningLang].name})`;
    navigator.clipboard.writeText(textToCopy);
    setCopiedId(seg.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Font Zoom Handler
  const handleToggleFontSize = () => {
    if (fontSize === 'base') setFontSize('lg');
    else if (fontSize === 'lg') setFontSize('xl');
    else if (fontSize === 'xl') setFontSize('2xl');
    else setFontSize('base');
  };

  // Filtered segments
  const filteredSegments = allSegments.filter((seg) => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    const trans = seg.translations[listeningLang]?.translatedText?.toLowerCase() || '';
    return (
      seg.speakerText.toLowerCase().includes(query) ||
      trans.includes(query) ||
      (seg.speakerName && seg.speakerName.toLowerCase().includes(query))
    );
  });

  const latestSegment = allSegments[allSegments.length - 1];
  const currentTranslation = latestSegment?.translations[listeningLang];

  const operatorActivityCopy: Record<LiveOperatorActivity, string> = {
    offline: 'Operator is disconnected. Reconnecting...',
    standby: 'Operator is connected. Waiting to begin.',
    starting: 'Microphone is starting. Please keep this page open.',
    listening: 'Listening for the speaker...',
    speaking: 'Speaker is talking now.',
    translating: 'Translating your selected language...',
    live: `New translation ready. Audio will play in ${SUPPORTED_LANGUAGES[listeningLang]?.name}.`,
    error: 'The live translation needs attention. Please wait for the next update.',
  };

  const operatorActivityTone: Record<LiveOperatorActivity, string> = {
    offline: 'border-rose-200 bg-rose-50 text-rose-900',
    standby: 'border-slate-200 bg-slate-50 text-slate-900',
    starting: 'border-amber-200 bg-amber-50 text-amber-950',
    listening: 'border-indigo-200 bg-indigo-50 text-indigo-950',
    speaking: 'border-rose-200 bg-rose-50 text-rose-950',
    translating: 'border-amber-200 bg-amber-50 text-amber-950',
    live: 'border-emerald-200 bg-emerald-50 text-emerald-950',
    error: 'border-rose-200 bg-rose-50 text-rose-900',
  };

  // Text size classes mapping
  const subtitleSizeClass = {
    base: 'text-lg sm:text-xl',
    lg: 'text-xl sm:text-2xl',
    xl: 'text-2xl sm:text-3xl',
    '2xl': 'text-3xl sm:text-4xl',
  }[fontSize];

  return (
    <div className={`space-y-6 max-w-4xl mx-auto pb-20 md:pb-6 ${isFullscreen ? 'fixed inset-0 z-50 bg-slate-50 p-4 sm:p-8 overflow-y-auto' : ''}`}>
      {/* ============================================================ */}
      {/* 1. TOP STATUS BAR: SSVP COUNCIL BRANDED HEADER               */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-4 sm:p-6 shadow-sm relative overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-start gap-3.5">
            {/* Official SSVP National Council of India Logo */}
            <SSVPLogo className="w-14 h-14 sm:w-16 sm:h-16" />

            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-black bg-indigo-950 text-amber-300 border border-amber-400/40 shadow-xs">
                  <Headphones className="w-3 h-3 text-amber-400" />
                  <span>OFFICIAL INTERPRETATION PORTAL</span>
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <Radio className="w-3 h-3 text-emerald-500 animate-pulse" />
                  <span>{liveConnectionStatus === 'connected' ? 'Live Stream Connected' : 'Connecting to Live Stream'}</span>
                </span>
              </div>

              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1">
                {conferenceInfo.title}
              </h1>
              <p className="text-xs sm:text-sm text-slate-600 font-semibold mt-0.5 flex flex-wrap items-center gap-1.5">
                <span className="text-indigo-900 font-bold">{conferenceInfo.subtitle}</span>
                <span>•</span>
                <span className="text-slate-500 font-medium">Main Auditorium</span>
              </p>
            </div>
          </div>

          {/* Action Toolbar for Attendees */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Vocal Clarity EQ Booster Toggle */}
            <button
              onClick={handleToggleClarityBoost}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1.5 ${
                isClarityBoost
                  ? 'bg-amber-50 text-amber-900 border-amber-300 shadow-xs'
                  : 'bg-slate-100 text-slate-600 border-slate-200'
              }`}
              title="Toggle Speech Clarity EQ Boost for noisy halls"
            >
              <Zap className={`w-3.5 h-3.5 ${isClarityBoost ? 'text-amber-600 fill-current' : 'text-slate-400'}`} />
              <span className="hidden sm:inline">Voice EQ Boost</span>
            </button>

            {/* Font Zoom Controls */}
            <button
              onClick={handleToggleFontSize}
              className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 border border-slate-200"
              title={`Current text size: ${fontSize.toUpperCase()}. Click to cycle.`}
            >
              <ZoomIn className="w-3.5 h-3.5 text-slate-600" />
              <span className="font-mono text-[11px] uppercase">{fontSize}</span>
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => setIsFullscreen((prev) => !prev)}
              className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition-colors border border-slate-200"
              title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Earphones Guidance Notice */}
        <div className="mt-3.5 p-3 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center justify-between gap-3 text-xs text-indigo-950">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Zero Setup Required:</strong> Insert your earphones, choose your language channel below, and listen to the floor address translated live.
            </span>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1 font-extrabold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-md text-[11px] shrink-0 border border-emerald-200">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            {isAudioTunedIn ? 'Audio Ready' : 'Tap to Start Audio'}
          </span>
        </div>
      </div>

      <div className={`border rounded-2xl px-4 py-3 ${operatorActivityTone[operatorStatus.activity]}`} aria-live="polite">
        <div className="flex items-start gap-3">
          <span className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${operatorStatus.activity === 'speaking' ? 'bg-rose-500 animate-pulse' : operatorStatus.activity === 'live' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
          <div className="min-w-0">
            <div className="text-xs font-black uppercase tracking-wider">Operator activity</div>
            <div className="mt-1 text-sm font-bold">{operatorActivityCopy[operatorStatus.activity]}</div>
            <div className="mt-1 text-xs font-bold">Delivery mode: {(operatorStatus.deliveryMode || 'v1').toUpperCase()}</div>
            {operatorStatus.speakerLanguage && (
              <div className="mt-1 text-xs opacity-75">
                Speaking in {SUPPORTED_LANGUAGES[operatorStatus.speakerLanguage]?.name || operatorStatus.speakerLanguage} • Your channel: {SUPPORTED_LANGUAGES[listeningLang]?.name}
              </div>
            )}
            {operatorStatus.message && (
              <div className="mt-1 text-xs opacity-75">{operatorStatus.message}</div>
            )}
            {!isAudioTunedIn && operatorStatus.activity !== 'offline' && (
              <div className="mt-2 text-xs font-semibold">Tap Start Listening and keep your phone volume up.</div>
            )}
          </div>
        </div>
      </div>

      {/* ============================================================ */}
      {/* 2. LANGUAGE CHANNEL SELECTION GRID                           */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4 text-indigo-600" />
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-wider text-slate-900">
              Select Your Listening Language Channel
            </h2>
          </div>
          <span className="text-xs font-bold text-indigo-700 bg-indigo-50 px-3 py-1 rounded-full border border-indigo-100">
            Active: {SUPPORTED_LANGUAGES[listeningLang]?.name} ({SUPPORTED_LANGUAGES[listeningLang]?.nativeName})
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
          {LANGUAGE_LIST.map((lang) => {
            const isSelected = listeningLang === lang.code;
            return (
              <button
                key={lang.code}
                onClick={() => handleSelectLanguage(lang.code)}
                className={`p-3 rounded-2xl border text-center transition-all flex flex-col items-center justify-center relative ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-600/20 ring-2 ring-indigo-400'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-800 border-slate-200 hover:border-slate-300'
                }`}
              >
                {isSelected && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-emerald-400 ring-2 ring-indigo-600" />
                )}
                <span className="text-sm font-black leading-tight">
                  {lang.name}
                </span>
                <span
                  className={`text-xs mt-0.5 ${
                    isSelected ? 'text-indigo-100 font-semibold' : 'text-slate-500'
                  }`}
                >
                  {lang.nativeName}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ============================================================ */}
      {/* 3. HEADPHONE AUDIO PLAYER & CONTROLS                        */}
      {/* ============================================================ */}
      <div className="bg-slate-950 text-white rounded-3xl p-5 shadow-lg border border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => {
                const nextState = !isAudioTunedIn;
                setIsAudioTunedIn(nextState);
                isAudioTunedInRef.current = nextState;
                if (!nextState) {
                  indicSpeech.stop();
                  liveConferenceTransport.setAudioReady(false);
                } else if (allSegments.length > 0) {
                  const lastSeg = allSegments[allSegments.length - 1];
                  handleReplaySegment(lastSeg);
                } else {
                  liveConferenceTransport.setAudioReady(true);
                }
              }}
              className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all shadow-md active:scale-95 ${
                isAudioTunedIn
                  ? 'bg-emerald-500 text-slate-950 hover:bg-emerald-400'
                  : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
              }`}
              title={isAudioTunedIn ? 'Mute Live Audio' : 'Start Listening Live'}
            >
              {isAudioTunedIn ? (
                <Volume2 className="w-6 h-6" />
              ) : (
                <VolumeX className="w-6 h-6" />
              )}
            </button>

            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black tracking-wide text-white">
                  {isAudioTunedIn ? 'Headset Audio Active' : 'Headset Audio Paused'}
                </span>
                <span className={`w-2 h-2 rounded-full ${isAudioTunedIn ? 'bg-emerald-400 animate-ping' : 'bg-slate-500'}`} />
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Tuned Language: <strong className="text-amber-400">{SUPPORTED_LANGUAGES[listeningLang]?.name}</strong> ({SUPPORTED_LANGUAGES[listeningLang]?.nativeName})
              </p>
            </div>
          </div>

          {/* Quick Audio Controls */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center space-x-2 bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800">
              <button
                onClick={handleToggleMute}
                className="text-slate-400 hover:text-white transition-colors"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={isMuted ? 0 : volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-20 sm:w-24 accent-indigo-500 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
                title={`Volume: ${volume}%`}
              />
              <span className="text-xs font-mono text-slate-400 w-7 text-right">
                {isMuted ? '0%' : `${volume}%`}
              </span>
            </div>

            <button
              onClick={() => setShowSettings((prev) => !prev)}
              className={`p-2 rounded-xl border transition-colors ${
                showSettings
                  ? 'bg-indigo-600 text-white border-indigo-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
              }`}
              title="Voice & Speed Settings"
            >
              <Sliders className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Collapsible Audio Speed & Persona Settings */}
        {showSettings && (
          <div className="pt-3 border-t border-slate-800 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="text-slate-400 font-bold block mb-1">
                Speech Cadence:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSpeedChange('normal')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border font-bold transition-colors ${
                    playbackSpeed === 'normal'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  Normal (1.0x)
                </button>
                <button
                  onClick={() => handleSpeedChange('slow')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border font-bold transition-colors ${
                    playbackSpeed === 'slow'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  Calm (0.85x)
                </button>
              </div>
            </div>

            <div>
              <label className="text-slate-400 font-bold block mb-1">
                Indian Voice Persona:
              </label>
              <div className="flex gap-2">
                <button
                  onClick={() => handlePersonaChange('ananya')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border font-bold transition-colors ${
                    voicePersona === 'ananya'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  Ananya (Female)
                </button>
                <button
                  onClick={() => handlePersonaChange('arjun')}
                  className={`flex-1 py-1.5 px-2.5 rounded-lg border font-bold transition-colors ${
                    voicePersona === 'arjun'
                      ? 'bg-indigo-600 text-white border-indigo-500'
                      : 'bg-slate-800 text-slate-300 border-slate-700'
                  }`}
                >
                  Arjun (Male)
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 4. LIVE TELEPROMPTER / REAL-TIME SUBTITLE STREAM              */}
      {/* ============================================================ */}
      <div className="bg-white border border-slate-200 rounded-3xl p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-amber-500" />
            <h3 className="font-extrabold text-base text-slate-900">
              Live Stage Subtitles & Speech
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-900">
              {allSegments.length} Interventions
            </span>
          </div>

          {allSegments.length > 0 && (
            <div className="relative w-full sm:w-60">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search session..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          )}
        </div>

        {/* Current / Latest Intervention Spotlight */}
        {latestSegment ? (
          <div className="p-4 sm:p-6 rounded-3xl bg-gradient-to-br from-indigo-50/90 via-indigo-50/50 to-white border border-indigo-200 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse" />
                <span className="text-xs font-black uppercase tracking-wider text-indigo-950 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-600" />
                  <span>
                    {latestSegment.speakerName || 'Stage Speaker'} • {latestSegment.speakerRole || 'Plenary'}
                  </span>
                </span>
                <span className="text-xs text-slate-400">•</span>
                <span className="text-xs font-semibold text-slate-600">
                  Spoken in {SUPPORTED_LANGUAGES[latestSegment.speakerLang]?.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleCopyQuote(latestSegment)}
                  className="px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-slate-200"
                  title="Copy translated quote"
                >
                  {copiedId === latestSegment.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedId === latestSegment.id ? 'Copied' : 'Copy'}</span>
                </button>

                <button
                  onClick={() => handleReplaySegment(latestSegment)}
                  className="px-2.5 py-1 text-indigo-600 hover:text-indigo-900 hover:bg-indigo-100/60 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold"
                  title="Replay Audio"
                >
                  <Volume2 className="w-4 h-4" />
                  <span>Replay</span>
                </button>
              </div>
            </div>

            {/* Original Spoken Text */}
            <div className="text-xs text-slate-500">
              Original Spoken: <span className="text-slate-700 italic">"{latestSegment.speakerText}"</span>
            </div>

            {/* Translated Output for Headset */}
            <div className="pt-2 border-t border-indigo-200/60 space-y-1.5">
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700 flex items-center gap-1">
                <span>In {SUPPORTED_LANGUAGES[listeningLang]?.name}:</span>
              </div>
              <div className={`${subtitleSizeClass} font-black text-indigo-950 leading-relaxed transition-all`}>
                "{currentTranslation?.translatedText || latestSegment.speakerText}"
              </div>
              {currentTranslation?.transliteration && (
                <div className="text-xs sm:text-sm text-indigo-700 font-mono mt-1">
                  {currentTranslation.transliteration}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="py-12 px-4 text-center max-w-md mx-auto space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center mx-auto shadow-inner">
              <Radio className="w-7 h-7 text-indigo-600 animate-pulse" />
            </div>
            <h4 className="text-base font-extrabold text-slate-900">
              Stage Connection Standing By
            </h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              When the plenary speaker or chairman addresses the <strong>72nd Annual General Body Meeting</strong>, translated speech in <strong>{SUPPORTED_LANGUAGES[listeningLang]?.name}</strong> will appear here automatically.
            </p>
          </div>
        )}

        {/* Previous Statements Transcript List */}
        {filteredSegments.length > 1 && (
          <div className="space-y-2.5 pt-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Session Proceedings Log ({filteredSegments.length} entries):
            </div>
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredSegments.slice(0, -1).reverse().map((seg) => {
                const trans = seg.translations[listeningLang];
                return (
                  <div
                    key={seg.id}
                    className="p-3 bg-slate-50 hover:bg-slate-100/80 rounded-xl border border-slate-200 transition-colors space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span className="font-bold text-slate-800">
                        {seg.speakerName || 'Speaker'} ({SUPPORTED_LANGUAGES[seg.speakerLang]?.name})
                      </span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleCopyQuote(seg)}
                          className="text-slate-400 hover:text-slate-600 font-semibold"
                          title="Copy quote"
                        >
                          {copiedId === seg.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleReplaySegment(seg)}
                          className="text-indigo-600 hover:text-indigo-900 flex items-center gap-1 font-semibold"
                          title="Replay this statement"
                        >
                          <Volume2 className="w-3.5 h-3.5" />
                          <span>Play</span>
                        </button>
                      </div>
                    </div>
                    <div className="text-xs font-bold text-slate-900">
                      {trans?.translatedText || seg.speakerText}
                    </div>
                    {trans?.transliteration && (
                      <div className="text-[11px] text-slate-500 font-mono mt-0.5">
                        {trans.transliteration}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ============================================================ */}
      {/* 5. PERSISTENT MOBILE FLOATING LANGUAGE QUICK-BAR              */}
      {/* ============================================================ */}
      <div className="md:hidden fixed bottom-3 left-3 right-3 z-40 bg-slate-950/95 backdrop-blur-md text-white p-2 rounded-2xl border border-slate-800 shadow-2xl flex items-center justify-around gap-1">
        {LANGUAGE_LIST.map((lang) => {
          const isSelected = listeningLang === lang.code;
          return (
            <button
              key={lang.code}
              onClick={() => handleSelectLanguage(lang.code)}
              className={`flex-1 py-1.5 px-1 rounded-xl text-center transition-all ${
                isSelected
                  ? 'bg-indigo-600 text-white font-black shadow-md scale-105'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              <div className="text-[11px] font-black leading-none">{lang.code.toUpperCase()}</div>
              <div className="text-[9px] truncate opacity-80 mt-0.5">{lang.name.slice(0, 3)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
