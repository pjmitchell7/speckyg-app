import { assetUrl } from './lib/assetUrl';
import { Suspense, lazy, useCallback, useEffect, useRef, useState } from 'react';

import { ArrowRight, Menu, AudioLines, Bell, Check, CloudRain, Feather, Heart, MessageCircle, Mic, Moon, Music2, RotateCcw, Settings2, Square, Sun, Trash2, Volume2, Wind, X } from 'lucide-react';

import { useSpecky } from './hooks/useSpecky';
import { FREE_CONVERSATION_DISCLOSURE } from './lib/freeConversation';
import { recognitionConstructor } from './lib/browserVoice';
import { LOCAL_SPEECH_DOWNLOAD_ESTIMATE_MB } from './lib/localSpeech';

import { Modal } from './components/Modal';

import type { SceneAction } from './world/IslandScene';

import { WorldBoundary } from './world/WorldBoundary';

import type { Preferences } from '../shared/types';

import './island.css';

import './immersive.css';



const IslandScene=lazy(()=>import('./world/IslandScene').then(module=>({default:module.IslandScene})));



function Switch({ checked, onChange, label, detail }: { checked:boolean; onChange:()=>void; label:string; detail:string }) {

  return <div className="setting-row"><div><span className="setting-label">{label}</span><p>{detail}</p></div><button type="button" role="switch" aria-checked={checked} aria-label={label} className={`switch ${checked?'on':''}`} onClick={onChange}><span /></button></div>;

}



export default function App() {

  const specky=useSpecky();
  const onDeviceListening=!recognitionConstructor();

  const [panel,setPanel]=useState<'settings'|'memories'|'about'|'menu'|'history'|'voice'|null>(null);

  const [confirm,setConfirm]=useState<'chat'|'all'|null>(null);

  const [memoryNotice,setMemoryNotice]=useState('');

  const [autoScroll,setAutoScroll]=useState(true);

  const [night,setNight]=useState(false);

  const [rain,setRain]=useState(false);

  const [action,setAction]=useState<SceneAction|null>(null);

  const [notice,setNotice]=useState('');
  const [voiceChosen,setVoiceChosen]=useState(false);
  const [clock,setClock]=useState(Date.now());
  const freeWait=specky.mode==='free'?Math.max(0,Math.ceil((specky.cooldownUntil-clock)/1000)):0;
  useEffect(()=>{const timer=setInterval(()=>setClock(Date.now()),500);return()=>clearInterval(timer);},[]);

  const scrollRef=useRef<HTMLDivElement>(null);

  const soundContext=useRef<AudioContext|null>(null);

  const active=specky.state==='thinking'||specky.state==='speaking';

  const motionOff=specky.preferences.reducedMotion || window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(()=>{ if(autoScroll && scrollRef.current) scrollRef.current.scrollTop=scrollRef.current.scrollHeight; },[specky.messages.length,specky.pending,autoScroll,panel]);

  useEffect(()=>{const listener=(e:KeyboardEvent)=>{if(e.key==='Escape'&&!panel&&!confirm&&(active||specky.isRecording))specky.stop();};window.addEventListener('keydown',listener);return()=>window.removeEventListener('keydown',listener);},[active,panel,confirm,specky.isRecording,specky.stop]);

  useEffect(()=>()=>{void soundContext.current?.close().catch(()=>{});},[]);

  function update<K extends keyof Preferences>(key:K,value:Preferences[K]){specky.setPreferences(old=>({...old,[key]:value}));}

  const lastSpoken=[...specky.messages].reverse().find(message=>message.role==='user');

  function saveLastSpoken(){

    if(!lastSpoken||!specky.preferences.remember)return;

    if(lastSpoken.text.length>200){setMemoryNotice('That was a little long for a note. Keep a note under 200 characters.');return;}

    specky.addMemory(lastSpoken.text);setMemoryNotice('What you last said is saved on this device.');

  }

  function sound(kind:'radio'|'chime'){

    if(specky.state==='listening'||specky.state==='speaking')return;

    try{

      const context=soundContext.current??new AudioContext();soundContext.current=context;void context.resume();

      const notes=kind==='radio'?[130.81,0,164.81,196,0,164.81,146.83,130.81]:[523.25,659.25,783.99];

      notes.forEach((frequency,index)=>{if(!frequency)return;const start=context.currentTime+index*(kind==='radio'?.18:.13);const oscillator=context.createOscillator();const gain=context.createGain();oscillator.type=kind==='radio'?'triangle':'sine';oscillator.frequency.value=frequency;gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(kind==='radio'?.07:.035,start+.012);gain.gain.exponentialRampToValueAtTime(.0001,start+(kind==='radio'?.18:1.2));oscillator.connect(gain);gain.connect(context.destination);oscillator.start(start);oscillator.stop(start+(kind==='radio'?.2:1.25));oscillator.onended=()=>{oscillator.disconnect();gain.disconnect();};});

    }catch{ /* Scene interactions remain available without audio hardware. */ }

  }

  const interact=useCallback((kind:SceneAction['kind'])=>{

    setAction({kind,id:Date.now()+Math.random()});

    const words:Record<string,string>={radio:'A little bass line for the branches.',chime:'Shells, a breeze, and a little space to breathe.',leaves:'The whole canopy has something to say.',greet:'Good company starts with a little hello.',head:'Yuh have mi attention.',wing:'A little room for the feathers.',dance:'The bass gets him every time.',point:'One little point, then mi a listen.',stretch:'A little room for the feathers.',crossed:'Mi a give that some thought.',rest:''};

    setNotice(words[kind]);

    if(kind==='radio'||kind==='chime')sound(kind);

  },[specky.state]);



  const latestAssistant=[...specky.messages].reverse().find(message=>message.role==='assistant');

  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),3500);return()=>clearTimeout(timer);},[notice]);

  useEffect(()=>{const viewport=window.visualViewport;const resize=()=>document.documentElement.style.setProperty('--app-height',`${viewport?.height??innerHeight}px`);resize();viewport?.addEventListener('resize',resize);window.addEventListener('resize',resize);return()=>{viewport?.removeEventListener('resize',resize);window.removeEventListener('resize',resize);};},[]);



  return <div className={`island-app immersive ${night?'blue-hour':''} ${rain?'passing-rain':''} ${motionOff?'reduce-motion':''}`}>

    <a className="skip-link" href="#voice-control">Skip to microphone</a>

    <picture className="world-backdrop" aria-hidden="true"><source media="(orientation:portrait)" srcSet={assetUrl('assets/environment/treetop-portrait.jpg')}/><img src={assetUrl('assets/environment/treetop-landscape.jpg')} alt="" fetchPriority="high"/></picture>

    <section className={`character-scene state-${specky.state} mood-${specky.mood}`} aria-label="SpeckyG’s treetop world">

      <WorldBoundary><Suspense fallback={<div className="quiet-loading" role="status">Opening the perch…</div>}><IslandScene state={specky.state} mood={specky.mood} amplitude={specky.amplitude} reducedMotion={motionOff} night={night} rain={rain} action={action} replyId={latestAssistant?.id} replyText={latestAssistant?.text} speechCharIndex={specky.speechCharIndex} onInteract={interact}/></Suspense></WorldBoundary>

    </section>

    <header className="perch-header"><span className="perch-wordmark">SpeckyG<span>.</span></span><button className="perch-menu-button" aria-label="Open menu" onClick={()=>setPanel('menu')}><Menu size={23}/></button></header>

    {notice&&<div className="perch-toast" role="status">{notice}</div>}

    <main className="perch-conversation" aria-label="Talk with SpeckyG">

      <div className="stage-caption" aria-live="off">

        {specky.voiceProgress?<p role="status">{specky.voiceProgress}</p>:specky.isRecording?<p>Mi a listen. Take yuh time.</p>:specky.pending?<p aria-label="Specky is thinking" className="caption-thinking">Give him a moment<span>…</span></p>:<p>{latestAssistant?.text}</p>}

        {latestAssistant?.interrupted&&<small>You stopped this reply</small>}

      </div>

      <div className="sr-only" role="log" aria-live="polite" aria-relevant="additions" aria-label="Conversation messages" aria-hidden={panel==='history'}>{specky.messages.map(message=><p key={message.id}>{message.role==='assistant'?'SpeckyG: ':'You: '}{message.text}{message.interrupted?' You stopped this reply':''}</p>)}</div>

      {specky.error&&<div className="quiet-error" role="alert"><p>{specky.error}</p><button onClick={()=>{specky.clearError();void specky.retryLast();}}>Retry</button><button aria-label="Dismiss error" onClick={specky.clearError}><X size={15}/></button></div>}

      <div className={`voice-controls ${specky.isRecording?'is-listening':''} ${specky.state==='speaking'?'is-speaking':''}`}>

        <div className="voice-orbit" aria-hidden="true"><i/><i/><i/></div>

        <button id="voice-control" type="button" className="voice-button" disabled={!specky.ready||(!active&&!specky.isRecording&&freeWait>0)} aria-label={specky.voicePhase==='loading'||specky.voicePhase==='opening'?'Cancel voice setup':specky.voicePhase==='transcribing'?'Cancel speech recognition':specky.isRecording?'Finish speaking':active?'Stop Specky’s reply':'Talk to SpeckyG'} aria-pressed={specky.isRecording} onClick={()=>{setAutoScroll(true);if(active)specky.stop();else if(!voiceChosen)setPanel('voice');else void specky.toggleMic();}}>

          {specky.isRecording?<Check size={28}/>:active?<Square size={22} fill="currentColor"/>:<Mic size={29}/>}

        </button>

        <span className="voice-hint">{specky.voicePhase==='loading'?'Loading voice pack · tap to cancel':specky.voicePhase==='opening'?'Opening microphone · tap to cancel':specky.voicePhase==='transcribing'?'Recognizing speech · tap to cancel':specky.isRecording?'Listening · tap when you’re done':specky.state==='thinking'?'A moment…':specky.state==='speaking'?'Specky’s talking · tap to interrupt':freeWait>0?`Free service ready in ${freeWait}s`:'Tap to talk'}</span>

        {specky.isRecording&&<button className="cancel-voice" aria-label="Cancel recording" onClick={specky.stop}>Cancel</button>}

      </div>

      <p className="experience-note"><span className="mode-badge">{specky.mode==='free'?'FREE ONLINE':specky.mode==='live'?'LIVE VOICE':'VOICE PREVIEW'}</span><span>{specky.mode==='demo'?'Device speech · scripted replies':'AI replies · device voice'}</span></p>

    </main>



    <Modal open={panel==='voice'} onClose={()=>setPanel(null)} title="Come, have a word." subtitle="Voice in. Specky answers aloud.">
      <div className="voice-choice-content"><p className="voice-choice-lead">Free online conversation · ages 16+</p><p>{FREE_CONVERSATION_DISCLOSURE}</p><p>By starting free conversation, you confirm you’re 16 or older, as required by this service. The scripted preview is available separately.</p><p>{onDeviceListening?`This browser uses free on-device listening. First use downloads a voice pack of about ${LOCAL_SPEECH_DOWNLOAD_ESTIMATE_MB} MB from Hugging Face and jsDelivr. It can take a little time; later uses reuse cached files. Your recording stays on this device for transcription.`:"Your browser handles listening. Its speech service may process your audio."} Replies use your device’s available voice. Specky’s Patois and voice are still being refined.</p><button className="primary-button" onClick={()=>{specky.setMode('free');setVoiceChosen(true);setPanel(null);void specky.toggleMic();}}><Mic size={18}/>Start free conversation</button><button className="secondary-button" onClick={()=>{specky.setMode('demo');setVoiceChosen(true);setPanel(null);void specky.toggleMic();}}>Try scripted voice preview</button><small>There’s no paid fallback. Free online may pause or be unavailable. <a href="https://raw.githubusercontent.com/pollinations/pollinations/main/pollinations.ai/public/legal/PRIVACY_POLICY.md" target="_blank" rel="noreferrer">Privacy</a> · <a href="https://raw.githubusercontent.com/pollinations/pollinations/main/pollinations.ai/public/legal/TERMS_OF_SERVICE.md" target="_blank" rel="noreferrer">Terms</a></small></div>
    </Modal>
    <Modal open={panel==='menu'} onClose={()=>setPanel(null)} title="On the perch." subtitle="A few things, whenever you need them.">

      <div className="perch-menu-content">

        <div className="perch-menu-grid"><button onClick={()=>setPanel('history')}><MessageCircle size={20}/><span>Conversation history</span></button><button aria-label="Open preferences" onClick={()=>setPanel('settings')}><Settings2 size={20}/><span>Make it yours</span></button><button aria-label="Little things" onClick={()=>setPanel('memories')}><Feather size={20}/><span>Little things{specky.memories.length?` · ${specky.memories.length}`:''}</span></button><button aria-label="A fresh conversation" onClick={()=>{setPanel(null);setConfirm('chat');}}><RotateCcw size={20}/><span>Start fresh</span></button></div>

        <details className="perch-extra"><summary>A little island life</summary><div className="island-extra-actions"><button aria-label="Stir the palm leaves" onClick={()=>{interact('leaves');setPanel(null);}}><Wind size={18}/>Breeze</button><button aria-label="Play the little radio" onClick={()=>{interact('radio');setPanel(null);}}><Music2 size={18}/>Radio</button><button aria-label="Ring the shell chime" onClick={()=>{interact('chime');setPanel(null);}}><Bell size={18}/>Chimes</button><button aria-label={night?'Bring back the sunshine':'Switch to blue hour'} aria-pressed={night} onClick={()=>{setNight(value=>!value);setPanel(null);}}>{night?<Sun size={18}/>:<Moon size={18}/>}Light</button><button aria-label={rain?'Stop the passing shower':'Start a passing shower'} aria-pressed={rain} onClick={()=>{setRain(value=>!value);setPanel(null);}}><CloudRain size={18}/>Shower</button><button aria-label="Ask SpeckyG to stretch his wings" onClick={()=>{interact('wing');setPanel(null);}}><Feather size={18}/>Wings</button><button aria-label="Ask SpeckyG to look this way" onClick={()=>{interact('head');setPanel(null);}}><Feather size={18}/>Look here</button><button aria-label="Greet SpeckyG" onClick={()=>{interact('greet');setPanel(null);}}><Feather size={18}/>Say hello</button><button aria-label="Ask SpeckyG to point" onClick={()=>{interact('point');setPanel(null);}}><Feather size={18}/>Make a point</button><button aria-label="Ask SpeckyG to fold his wings" onClick={()=>{interact('crossed');setPanel(null);}}><Feather size={18}/>Fold wings</button></div></details>

        <details className="perch-extra"><summary>About this preview</summary><p className="menu-fine-print">SpeckyG is a moving 3D reconstruction of the reference, with an authored face and wing deformation rig. His sides and fine facial detail still need work. <a href={assetUrl('?view=likeness')}>Compare with the original</a></p><p className="menu-fine-print">Moving 3D foliage, birds and water sit within a photographic island setting. {specky.mode==='demo'?'Voice preview uses authored replies and device speech. Browsers without built-in recognition use an optional on-device voice pack; other browsers may process audio through their speech provider. This is not open-ended AI conversation.':specky.mode==='free'?'Free online sends recognized conversation text and enabled notes to Pollinations; on-device listening keeps recordings here, while built-in browser recognition may process audio with your browser provider. One request per 30 seconds per internet address. No API key or payment.':'Live voice sends your recording to the speech service and uses AI-generated replies.'} Recordings stop after 30 seconds. Conversations are not saved here.</p><button className="menu-about" aria-label="About SpeckyG" onClick={()=>setPanel('about')}>Meet SpeckyG<ArrowRight size={15}/></button></details>

      </div>

    </Modal>

    <Modal open={panel==='history'} onClose={()=>setPanel(null)} title="Our conversation." subtitle={specky.mode==='demo'?'Voice preview · authored replies.':'AI replies · made in the moment.'}>

      <div className="history-scroll" ref={scrollRef} onScroll={()=>{const el=scrollRef.current;if(el)setAutoScroll(el.scrollHeight-el.scrollTop-el.clientHeight<80);}}><div className="history-messages" role="log" aria-label="Conversation messages">{specky.messages.map((message,index)=><article key={message.id} className={`history-message ${message.role}`}><span>{message.role==='assistant'?'SPECKYG':'YOU'}</span><p>{message.text}</p>{message.interrupted&&<small>You stopped this reply</small>}{message.role==='assistant'&&index===specky.messages.length-1&&index>0&&<button className="hear-reply" onClick={specky.replayLast}><Volume2 size={13}/>Hear this reply</button>}</article>)}</div></div>

      {specky.messages.length===1&&<div className="quiet-topics"><button onClick={()=>{setPanel(null);void specky.startTopic('day');}}>How the day going?<ArrowRight size={15}/></button><button onClick={()=>{setPanel(null);void specky.startTopic('music');}}>A little music talk<Music2 size={15}/></button></div>}

    </Modal>

    <Modal open={panel === 'settings'} onClose={() => setPanel(null)} title="Make it yours." subtitle="A few little things, so the perch feels comfortable.">

      <div className="settings-content"><div className="setting-section-label">THE CONVERSATION</div><div className="setting-row mode-setting"><div><span className="setting-label">Choose your experience</span><p>Voice preview uses authored replies. Free online creates replies in the moment, using your device’s voice.</p></div></div><div className="segmented"><button className={specky.mode === 'demo' ? 'chosen' : ''} onClick={() => {specky.setMode('demo');setVoiceChosen(true);}}>Voice preview{specky.mode === 'demo' && <Check size={13} />}</button><button className={specky.mode === 'free' ? 'chosen' : ''} onClick={() => setPanel('voice')}>Free online{specky.mode === 'free' && <Check size={13} />}</button></div><p className="setting-help">Free online uses an accountless, best-effort service. Its 30-second limit is shared by people on the same internet connection.</p><Switch label="A little teasing" detail="Gentle mischief once the conversation feels familiar." checked={specky.preferences.teasing === 'gentle'} onChange={() => update('teasing', specky.preferences.teasing === 'gentle' ? 'off' : 'gentle')} /><Switch label="Make room for faith" detail="Christian encouragement when it fits. Off means only when you ask." checked={specky.preferences.faith === 'welcome'} onChange={() => update('faith', specky.preferences.faith === 'welcome' ? 'only-if-asked' : 'welcome')} /><div className="setting-section-label">YOUR COMFORT</div><Switch label="Use my little things" detail="Use saved notes in live chat. Turning this off deletes those notes from this browser." checked={specky.preferences.remember} onChange={() => update('remember', !specky.preferences.remember)} /><Switch label="Less movement" detail="Keep the perch still and skip decorative animations." checked={specky.preferences.reducedMotion} onChange={() => update('reducedMotion', !specky.preferences.reducedMotion)} /><p className="voice-disclosure"><AudioLines size={16} /><span>AI-generated voice. Patois is a work in progress. This is a character prototype, and his cultural and voice authenticity haven’t been validated.</span></p><button className="text-danger" onClick={() => { setPanel(null); setConfirm('all'); }}><Trash2 size={14} />Clear conversations & saved notes</button></div>

    </Modal>

    <Modal open={panel === 'memories'} onClose={() => setPanel(null)} title="The little things." subtitle="Only the things you ask him to remember.">

      <div className="memory-content"><div className="memory-explainer"><Feather size={21} /><p>These notes stay in this browser. When memory is on, saved notes are included in live conversations. Nothing is added automatically.</p></div><Switch label="Remember on this device" detail="Save notes here and include them in live chat. Turning this off deletes saved notes." checked={specky.preferences.remember} onChange={() => { update('remember', !specky.preferences.remember); setMemoryNotice(''); }} /><div className="spoken-note"><p>Save the last thing you said, only when you choose.</p>{lastSpoken&&<blockquote>{lastSpoken.text}</blockquote>}<button className="primary-button" onClick={saveLastSpoken} disabled={!lastSpoken||!specky.preferences.remember||specky.memories.length>=8}><Feather size={15}/>Save what I last said</button></div>{memoryNotice && <p className="memory-notice" role="status">{memoryNotice}</p>}<div className="memory-list">{specky.memories.length ? specky.memories.map(note => <div className="memory-note" key={note.id}><span className="memory-note-dot" /><p>{note.text}</p><button className="icon-button" aria-label={`Delete memory: ${note.text}`} onClick={() => specky.removeMemory(note.id)}><Trash2 size={15} /></button></div>) : <div className="empty-memory"><span>Nothing tucked away yet.</span><p>There’s no need to save anything to have a good conversation.</p></div>}</div></div>

    </Modal>

    <Modal open={panel === 'about'} onClose={() => setPanel(null)} title="Meet SpeckyG." subtitle="Good company, with a beak.">

      <div className="about-content"><div className="about-monogram"><Feather size={34} /></div><p className="about-lead">A Jamaican parrot with a police cap, a soft spot for a good conversation, and a little mischief waiting in the wings.</p><p>He starts warmly. The teasing can come later. Talk about your day, a tune that won’t leave your head, faith, or whatever brought you to the perch.</p><p>This is an early character prototype. Demo replies are authored examples; live replies are generated by AI. He can get things wrong. Patois and voice authenticity still need Jamaican listener feedback.</p><div className="about-facts"><span><Heart size={15} />Christian grounding, room for your own view</span><span><Feather size={15} />Memory is yours to choose</span><span><MessageCircle size={15} />No script for you to follow</span></div><button className="primary-button about-dismiss" onClick={() => setPanel(null)}>Back to the perch<ArrowRight size={16} /></button></div>

    </Modal>

    <Modal open={confirm !== null} onClose={() => setConfirm(null)} title={confirm === 'all' ? 'A clean slate?' : 'Start fresh?'} subtitle={confirm === 'all' ? 'This clears this browser’s conversation and saved memory notes.' : 'This clears the current conversation. Your saved little things stay.'}>

      <div className="confirmation-actions"><button className="secondary-button" onClick={() => setConfirm(null)}>Keep chatting</button><button className="primary-button" onClick={() => { if (confirm === 'all') specky.clearAll(); else specky.resetConversation(); setConfirm(null); setAutoScroll(true); }}><RotateCcw size={15} />{confirm === 'all' ? 'Clear everything' : 'Start fresh'}</button></div>

    </Modal>

  </div>;

}
