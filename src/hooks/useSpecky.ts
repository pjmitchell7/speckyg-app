import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import type { AppConfig, CharacterState, ChatMessage, ChatReply, ChatRequest, MemoryNote, Mode, Mood, Preferences } from '../../shared/types';
import { demoReply } from '../../shared/demo';
import { DEFAULT_PREFERENCES, eraseAllData, loadMemories, loadPreferences, removePrivateData, savePrivateData, saveSettings } from '../lib/storage';
import { TurnGate } from '../lib/turnGate';
import { recognitionConstructor, type BrowserRecognition } from '../lib/browserVoice';
import { freeConversation, FREE_CONVERSATION_COOLDOWN_MS, FreeConversationError } from '../lib/freeConversation';

const NO_CONFIG: AppConfig = { liveChat: false, liveVoice: false, transcription: false };
const welcome = (): ChatMessage => ({ id: crypto.randomUUID(), role: 'assistant',
  text: 'Mi name SpeckyG. Good fi meet yuh. Come, get comfortable. How yuh day a go?', createdAt: Date.now() });

async function readError(response: Response, fallback: string) {
  try { const body = await response.json(); return typeof body.error === 'string' ? body.error : fallback; }
  catch { return fallback; }
}

export function useSpecky() {
  const [preferences, setPrefs] = useState(loadPreferences);
  const [messages, setMessages] = useState<ChatMessage[]>(() => [welcome()]);
  const [memories, setMemories] = useState<MemoryNote[]>(() => loadMemories(loadPreferences().remember));
  const config = NO_CONFIG;
  const ready = true;
  const [mode, setModeState] = useState<Mode>('demo');
  const [state, setState] = useState<CharacterState>('idle');
  const [mood, setMood] = useState<Mood>('warm');
  const [amplitude, setAmplitude] = useState(0);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const gate = useRef(new TurnGate());
  const prefsRef = useRef(preferences);
  const messagesRef = useRef(messages);
  const memoriesRef = useRef(memories);
  const modeRef = useRef(mode);
  const modeChosen = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const contextRef = useRef<AudioContext | null>(null);
  const frameRef = useRef(0);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<BrowserRecognition | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const discardRecording = useRef(false);
  const recordingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastReply = useRef<ChatReply | null>(null);
  const lastFailedRequest = useRef<{text:string; action:'chat'|'topic'; topic?:string} | null>(null);
  const failureKind = useRef<'chat'|'speech'|'mic'|null>(null);
  const micRetry = useRef<() => Promise<void>>(async () => {});
  const cooldownRef = useRef(0);
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const sendRef = useRef<(text?: string) => Promise<void>>(async () => {});
  const mounted = useRef(true);

  const updateMessages = useCallback((value: ChatMessage[] | ((old: ChatMessage[]) => ChatMessage[])) => {
    const next = typeof value === 'function' ? value(messagesRef.current) : value;
    messagesRef.current = next;
    setMessages(next);
  }, []);

  const releaseMedia = useCallback(() => {
    cancelAnimationFrame(frameRef.current);
    const audio = audioRef.current;
    if (audio) { audio.onplay = audio.onended = audio.onerror = null; audio.pause(); audio.removeAttribute('src'); audio.load(); }
    audioRef.current = null;
    const utterance = utteranceRef.current;
    if (utterance) { utterance.onstart = utterance.onend = utterance.onerror = utterance.onboundary = null; window.speechSynthesis?.cancel(); utteranceRef.current = null; }
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    if (recordingTimer.current) clearTimeout(recordingTimer.current);
    recordingTimer.current = null;
    setAmplitude(0);
  }, []);

  const stop = useCallback(() => {
    gate.current.cancel();
    discardRecording.current = true;
    const recorder = recorderRef.current;
    recorderRef.current = null;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    const recognition = recognitionRef.current; recognitionRef.current = null;
    if (recognition) { recognition.onresult = recognition.onend = recognition.onerror = null; recognition.abort(); }
    const wasSpeaking = (audioRef.current && !audioRef.current.paused) || !!utteranceRef.current;
    releaseMedia();
    if (wasSpeaking) updateMessages(old => {
      const last = old.at(-1);
      return last?.role === 'assistant' ? [...old.slice(0, -1), { ...last, interrupted: true }] : old;
    });
    setState('idle'); setPending(false); setIsRecording(false);
  }, [releaseMedia, updateMessages]);

  useEffect(() => {
    mounted.current = true;
    // Free/device voice has no owner-paid backend. Do not probe or activate one.
    const online = () => setIsOnline(navigator.onLine);
    window.addEventListener('online', online); window.addEventListener('offline', online);
    return () => {
      mounted.current = false; gate.current.cancel();
      discardRecording.current = true;
      const recognition = recognitionRef.current; recognitionRef.current = null;
      if (recognition) { recognition.onresult = recognition.onend = recognition.onerror = null; recognition.abort(); }
      const recorder = recorderRef.current;
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      releaseMedia(); contextRef.current?.close().catch(() => {}); contextRef.current = null;
      window.removeEventListener('online', online); window.removeEventListener('offline', online);
    };
  }, [releaseMedia]);

  useEffect(() => { saveSettings(preferences); savePrivateData(preferences, memories); }, [preferences, memories]);

  const setPreferences: Dispatch<SetStateAction<Preferences>> = useCallback(value => {
    const old = prefsRef.current;
    const next = typeof value === 'function' ? value(old) : value;
    prefsRef.current = next;
    setPrefs(next);
    if (!next.remember) { memoriesRef.current = []; setMemories([]); removePrivateData(); }
    if ((old.voice && !next.voice) || old.teasing !== next.teasing || old.faith !== next.faith || (old.remember && !next.remember)) stop();
  }, [stop]);

  const setMode = useCallback((value: Mode) => {
    stop(); setError(null);
    modeChosen.current = true;
    if (value === 'live' && !(config.liveChat && config.liveVoice && config.transcription)) { setError('Live voice is not connected yet. The device-voice preview is available in supported browsers.'); return; }
    modeRef.current = value; setModeState(value);
    // Do not send scripted demo history as if it were live conversation.
    updateMessages([welcome()]); lastReply.current = null; lastFailedRequest.current = null; failureKind.current = null; setMood('warm');
  }, [config.liveChat, config.liveVoice, config.transcription, stop, updateMessages]);

  const warmAudio = useCallback(() => {
    try {
      if (!contextRef.current || contextRef.current.state === 'closed') contextRef.current = new AudioContext();
      void contextRef.current.resume().catch(() => {});
    } catch { /* Playback still works without an analyzer. */ }
  }, []);

  const playReply = useCallback(async (reply: ChatReply, turn: {id: number; signal: AbortSignal}) => {
    failureKind.current = 'speech';
    if (modeRef.current !== 'live') {
      if (!window.speechSynthesis || typeof SpeechSynthesisUtterance === 'undefined') { setState('idle'); setError('This browser cannot speak the preview. Try Safari, Chrome or Edge with sound enabled.'); return; }
      const utterance = new SpeechSynthesisUtterance(reply.text);
      utterance.lang = 'en-JM'; utterance.rate = .94;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.lang.toLowerCase() === 'en-jm') ?? voices.find(v => v.lang.toLowerCase().startsWith('en-gb')) ?? voices.find(v => v.lang.toLowerCase().startsWith('en'));
      if (voice) utterance.voice = voice;
      utteranceRef.current = utterance;
      // Device synthesis exposes word/start/end events, not its PCM audio. The
      // preview jaw follows these events; provider speech uses measured audio RMS.
      let boundaryTime = 0;
      utterance.onstart = () => {
        if (!gate.current.isCurrent(turn.id)) return;
        setState('speaking'); boundaryTime = performance.now();
        const move = (now: number) => {
          if (!gate.current.isCurrent(turn.id) || utteranceRef.current !== utterance) return;
          const syllable = Math.max(0, Math.sin((now-boundaryTime)*.023));
          setAmplitude(.08 + syllable*.57); frameRef.current = requestAnimationFrame(move);
        };
        frameRef.current = requestAnimationFrame(move);
      };
      utterance.onboundary = () => { if (gate.current.isCurrent(turn.id)) boundaryTime = performance.now(); };
      utterance.onend = () => { if (gate.current.isCurrent(turn.id)) { releaseMedia(); setState('idle'); failureKind.current = null; } };
      utterance.onerror = () => { if (gate.current.isCurrent(turn.id)) { releaseMedia(); setState('idle'); setError('His voice could not play. Check sound, then tap Hear this reply in history.'); } };
      setState('thinking'); window.speechSynthesis.speak(utterance); return;
    }
    if (!config.liveVoice) { setState('idle'); setError('The live voice service is not connected.'); return; }
    try {
      setState('thinking');
      const response = await fetch('/api/speech', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: reply.text, mood: reply.mood }), signal: turn.signal });
      if (!response.ok) throw new Error(await readError(response, 'His voice could not connect. Tap Retry to try again.'));
      const blob = await response.blob();
      if (!gate.current.isCurrent(turn.id)) return;
      const url = URL.createObjectURL(blob); urlRef.current = url;
      const audio = new Audio(url); audioRef.current = audio;
      audio.onplay = () => {
        if (!gate.current.isCurrent(turn.id)) { audio.pause(); return; }
        setState('speaking');
        const context = contextRef.current;
        if (context && context.state !== 'closed') {
          try {
            const source = context.createMediaElementSource(audio);
            const analyser = context.createAnalyser(); analyser.fftSize = 256;
            source.connect(analyser); analyser.connect(context.destination);
            const samples = new Uint8Array(analyser.frequencyBinCount);
            const sample = () => {
              if (!gate.current.isCurrent(turn.id) || audio.paused) return;
              analyser.getByteTimeDomainData(samples);
              const rms = Math.sqrt(samples.reduce((sum, value) => sum + ((value - 128) / 128) ** 2, 0) / samples.length);
              setAmplitude(Math.min(1, rms * 4)); frameRef.current = requestAnimationFrame(sample);
            };
            sample();
          } catch { /* Character still follows actual play/end events. */ }
        }
      };
      audio.onended = () => { if (gate.current.isCurrent(turn.id)) { releaseMedia(); setState('idle'); failureKind.current = null; } };
      audio.onerror = () => { if (gate.current.isCurrent(turn.id)) { releaseMedia(); setState('idle'); setError('The audio could not play. Check sound, then tap Hear this reply in history.'); } };
      await audio.play();
    } catch (e) {
      if (!gate.current.isCurrent(turn.id)) return;
      releaseMedia(); setState('idle');
      setError(e instanceof Error && e.name !== 'NotAllowedError' ? e.message : 'Tap “Hear this reply” to allow audio playback.');
    }
  }, [config.liveVoice, releaseMedia]);

  const request = useCallback(async (text: string, action: 'chat'|'topic' = 'chat', topic?: string, retry = false) => {
    if (!text.trim() && action === 'chat') return;
    if (text.length > 2000) { setError('Keep each message under 2,000 characters.'); return; }
    stop(); setError(null);
    // A local turn is an explicit choice: a late config response must not change its mode.
    modeChosen.current = true;
    if (modeRef.current === 'live' && !navigator.onLine) { setError('You are offline. The scripted demo still works, or reconnect for live conversation.'); return; }
    if (modeRef.current === 'free' && Date.now() < cooldownRef.current) { setError(`The free service allows one request every 30 seconds. Try again in ${Math.ceil((cooldownRef.current-Date.now())/1000)} seconds.`); return; }
    const turn = gate.current.begin();
    const next = action === 'chat' && !retry ? [...messagesRef.current, { id: crypto.randomUUID(), role: 'user' as const, text: text.trim(), createdAt: Date.now() }] : messagesRef.current;
    updateMessages(next); setInput(''); setState('thinking'); setPending(true);
    const currentPrefs = prefsRef.current;
    const body: ChatRequest = { messages: next.slice(-30).map(({role,text}) => ({role,text})),
      preferences: { teasing: currentPrefs.teasing, faith: currentPrefs.faith },
      memories: currentPrefs.remember ? memoriesRef.current.map(n => n.text) : [], mode: modeRef.current, action, topic };
    try {
      let reply: ChatReply;
      if (modeRef.current === 'demo') {
        // Deliberate short beat for readability; cancellation is checked afterward.
        await new Promise(resolve => setTimeout(resolve, 380));
        reply = demoReply(body);
      } else if (modeRef.current === 'free') {
        cooldownRef.current = Date.now() + FREE_CONVERSATION_COOLDOWN_MS; setCooldownUntil(cooldownRef.current);
        reply = await freeConversation(body, turn.signal);
      } else {
        const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: turn.signal });
        if (!response.ok) throw new Error(await readError(response, 'The conversation could not connect. Try again, or choose the scripted demo.'));
        reply = await response.json() as ChatReply;
        if (!reply || typeof reply.text !== 'string' || !reply.text.trim()) throw new Error('The reply was empty. Please try again.');
      }
      if (!gate.current.isCurrent(turn.id)) return;
      lastFailedRequest.current = null; failureKind.current = null;
      updateMessages(old => [...old, { id: crypto.randomUUID(), role: 'assistant', text: reply.text, createdAt: Date.now() }]);
      setMood(reply.mood); setPending(false); lastReply.current = reply;
      if (prefsRef.current.voice) await playReply(reply, turn);
      else setState('idle');
    } catch (e) {
      if (!gate.current.isCurrent(turn.id)) return;
      setState('idle'); setPending(false);
      lastFailedRequest.current = {text,action,topic};
      failureKind.current = 'chat';
      if (e instanceof FreeConversationError && e.retryAfterSeconds) { cooldownRef.current = Date.now() + e.retryAfterSeconds*1000; setCooldownUntil(cooldownRef.current); }
      setError(e instanceof Error ? e.message : 'Something interrupted the connection. Your message is still here.');
    }
  }, [playReply, stop, updateMessages]);

  const send = useCallback(async (text?: string) => { if (prefsRef.current.voice) warmAudio(); await request(text ?? input); }, [input, request, warmAudio]);
  sendRef.current = send;
  const startTopic = useCallback(async (topic?: string) => { if (prefsRef.current.voice) warmAudio(); await request('', 'topic', topic); }, [request, warmAudio]);
  const retryLast = useCallback(async () => {
    if (failureKind.current === 'mic') { await micRetry.current(); return; }
    if (failureKind.current === 'speech' && lastReply.current) { stop(); warmAudio(); const turn=gate.current.begin(); await playReply(lastReply.current,turn); return; }
    const failed = lastFailedRequest.current;
    if (!failed) { setError(null); return; }
    if (prefsRef.current.voice) warmAudio();
    await request(failed.text, failed.action, failed.topic, true);
  }, [request, warmAudio, stop, playReply]);

  const toggleMic = useCallback(async () => {
    if (recognitionRef.current) { recognitionRef.current.stop(); return; }
    if (recorderRef.current?.state === 'recording') { recorderRef.current.stop(); return; }
    modeChosen.current = true;
    failureKind.current = 'mic';
    if (modeRef.current !== 'live') {
      const Recognition = recognitionConstructor();
      if (!Recognition) { setError('Voice preview is not supported in this browser. Open this page in Chrome, Edge or Safari and allow the microphone.'); return; }
      stop(); setError(null); warmAudio();
      const turn = gate.current.begin(); const recognition = new Recognition();
      recognitionRef.current = recognition; discardRecording.current = false;
      recognition.lang = 'en-JM'; recognition.continuous = false; recognition.interimResults = false; recognition.maxAlternatives = 1;
      let words = '', recognitionFailed = false;
      recognition.onresult = event => { if (gate.current.isCurrent(turn.id)) words = Array.from(event.results).map(result => result[0]?.transcript ?? '').join(' ').trim(); };
      recognition.onerror = event => {
        if (!gate.current.isCurrent(turn.id)) return;
        recognitionFailed = true;
        const reason = event.error === 'not-allowed' || event.error === 'service-not-allowed' ? 'Allow microphone access in your browser to talk with SpeckyG.' : event.error === 'network' ? 'The browser speech service could not connect. Check your connection and try again.' : 'I did not catch that. Tap the microphone and try again.';
        setError(reason); words = '';
      };
      recognition.onend = () => {
        if (recognitionRef.current !== recognition || !gate.current.isCurrent(turn.id)) return;
        recognitionRef.current = null; releaseMedia(); setIsRecording(false); setState('idle');
        if (words) void sendRef.current(words);
        else if (!recognitionFailed) setError('I did not catch that. Tap the microphone and try again.');
      };
      try { recognition.start(); setIsRecording(true); setState('listening'); recordingTimer.current = setTimeout(() => recognition.stop(), 30_000); }
      catch { recognitionRef.current = null; releaseMedia(); setIsRecording(false); setState('idle'); setError('The microphone could not start. Check browser microphone permission and try again.'); }
      return;
    }
    if (!config.transcription) { setError('Live voice is not connected yet.'); return; }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') { setError('Microphone recording needs a recent browser on HTTPS.'); return; }
    stop(); setError(null); warmAudio();
    const turn = gate.current.begin();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (!gate.current.isCurrent(turn.id)) { stream.getTracks().forEach(t => t.stop()); return; }
      streamRef.current = stream; discardRecording.current = false;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find(type => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      const chunks: BlobPart[] = [];
      let ownTimer: ReturnType<typeof setTimeout> | null = null;
      recorderRef.current = recorder;
      recorder.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      recorder.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        if (ownTimer) clearTimeout(ownTimer);
        if (recorderRef.current === recorder) {
          recorderRef.current = null;
          if (recordingTimer.current === ownTimer) recordingTimer.current = null;
        }
        if (discardRecording.current || !gate.current.isCurrent(turn.id)) return;
        setIsRecording(false); setState('thinking'); setPending(true);
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunks, { type: mime });
        if (blob.size < 100) { setState('idle'); setPending(false); setError('I did not catch any audio. Tap the microphone and try again.'); return; }
        const form = new FormData(); form.append('file', blob, mime.includes('mp4') ? 'message.m4a' : 'message.webm');
        try {
          const response = await fetch('/api/transcribe', { method: 'POST', body: form, signal: turn.signal });
          if (!response.ok) throw new Error(await readError(response, 'The recording could not be understood. Please try speaking again.'));
          const result = await response.json() as {text:string};
          if (!gate.current.isCurrent(turn.id)) return;
          setPending(false); setState('idle');
          if (!result.text?.trim()) { setError('No words came through. Tap the microphone and try again.'); return; }
          await sendRef.current(result.text);
        } catch (e) {
          if (gate.current.isCurrent(turn.id)) { setPending(false); setState('idle'); setError(e instanceof Error ? e.message : 'Transcription was interrupted.'); }
        }
      };
      recorder.onerror = () => { if (gate.current.isCurrent(turn.id)) { stop(); setError('Recording stopped unexpectedly. Tap the microphone and try again.'); } };
      recorder.start(250); setIsRecording(true); setState('listening');
      ownTimer = setTimeout(() => { if (recorder.state === 'recording') recorder.stop(); }, 30_000);
      recordingTimer.current = ownTimer;
    } catch (e) {
      if (!gate.current.isCurrent(turn.id)) return;
      releaseMedia(); setState('idle'); setIsRecording(false);
      setError(e instanceof DOMException && e.name === 'NotAllowedError' ? 'Allow microphone access in your browser to talk with SpeckyG.' : 'The microphone could not start. Check browser microphone permission and try again.');
    }
  }, [config.transcription, releaseMedia, stop, warmAudio]);
  micRetry.current = toggleMic;

  const addMemory = useCallback((text: string) => {
    const trimmed = text.trim();
    if (!prefsRef.current.remember) { setError('Turn on “Remember on this device” before adding a note.'); return; }
    if (!trimmed || trimmed.length > 200) { setError('Write a short note, up to 200 characters.'); return; }
    if (memoriesRef.current.length >= 8) { setError('There is room for eight little things. Remove one before adding another.'); return; }
    const next = [...memoriesRef.current, { id: crypto.randomUUID(), text: trimmed, createdAt: Date.now() }];
    memoriesRef.current = next; setMemories(next);
  }, []);
  const removeMemory = useCallback((id: string) => { const next = memoriesRef.current.filter(n => n.id !== id); memoriesRef.current = next; setMemories(next); }, []);
  const resetConversation = useCallback(() => { stop(); updateMessages([welcome()]); lastReply.current = null; lastFailedRequest.current = null; setInput(''); setMood('warm'); setError(null); }, [stop, updateMessages]);
  const clearAll = useCallback(() => {
    resetConversation(); eraseAllData(); memoriesRef.current = []; setMemories([]);
    prefsRef.current = { ...DEFAULT_PREFERENCES }; setPrefs({ ...DEFAULT_PREFERENCES });
  }, [resetConversation]);
  const replayLast = useCallback(() => {
    const reply = lastReply.current;
    if (!reply) return;
    stop(); warmAudio(); const turn = gate.current.begin(); void playReply(reply, turn);
  }, [playReply, stop, warmAudio]);

  return { messages, state, mood, amplitude, config, mode, setMode, preferences, setPreferences,
    memories, addMemory, removeMemory, input, setInput, send, startTopic, stop, toggleMic,
    micAvailable: mode !== 'live' ? !!recognitionConstructor() : !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined' && config.transcription,
    cooldownUntil,
    error, clearError: () => setError(null), resetConversation, clearAll, isOnline, ready, pending, isRecording, replayLast, retryLast };
}
