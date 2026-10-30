import type { CharacterState, Mood } from '../../shared/types';

export type PerformanceGesture = 'rest' | 'point' | 'stretch' | 'crossed';
type ActiveGesture = Exclude<PerformanceGesture, 'rest'>;
export interface GestureInput {
  state: CharacterState;
  mood: Mood;
  replyId?: string;
  text?: string;
  /** Actual speech-synthesis word boundary, when supplied by the browser. */
  charIndex?: number | null;
  /** Monotonic native playback-start token; changes even when replaying one reply. */
  playbackId?: number;
  speechAge?: number | null;
  boundaryAge?: number | null;
  reducedMotion: boolean;
}
export interface GestureFrame {
  kind: PerformanceGesture;
  amount: number;
  source: 'rest' | 'idle' | 'speech' | 'manual';
}
const smooth = (value: number) => { const x = Math.max(0, Math.min(1, value)); return x*x*(3-2*x); };
const clips = {
  point: { duration: 3.1, enter: .65, exit: .9 },
  stretch: { duration: 5.4, enter: 1.25, exit: 1.45 },
  crossed: { duration: 6.2, enter: 1.1, exit: 1.3 },
};

/** Content chooses a restrained performance cue; no provider or extra model is needed. */
export function speechGesture(text: string, mood: Mood): {kind: ActiveGesture; index: number; end: number} | null {
  if (/\b(mi name|good fi meet|nice to meet|welcome|sorry|griev(?:e|ing)|funeral|passed away|death|died)\b/i.test(text) || mood === 'gentle') return null;
  const stretch = /\b(stretch|breathe|breath|relax|unwind|feathers?|wings?|tek it easy|take it easy)\b/i.exec(text);
  if (stretch) return { kind: 'stretch', index: stretch.index, end: stretch.index + stretch[0].length };
  const point = /\b(remember|look|listen|one thing|watch|here['’]s|here is|first|mek sure|make sure)\b/i.exec(text);
  if (point) return { kind: 'point', index: point.index, end: point.index + point[0].length };
  const question = /\b(really|wonder|think|suppose|tell mi|tell me|how come|what if)\b/i.exec(text);
  if (question && (mood === 'curious' || mood === 'thoughtful' || mood === 'amused')) return { kind: 'crossed', index: question.index, end: question.index + question[0].length };
  return null;
}

/** One bounded clip at a time. Silence is mostly stillness, with time to settle between poses. */
export class GestureDirector {
  private active: {kind: ActiveGesture; clock: number; source: GestureFrame['source']} | null = null;
  private returning: {kind: ActiveGesture; amount: number; clock: number; source: GestureFrame['source']} | null = null;
  private queued: ActiveGesture | null = null;
  private frame: GestureFrame = {kind: 'rest', amount: 0, source: 'rest'};
  private idleTime = 0;
  private nextIdle: number;
  private lastIdle: ActiveGesture | null = null;
  private previousState: CharacterState = 'idle';
  private previousReply: string | undefined;
  private previousPlayback: number | undefined;
  private cue: ReturnType<typeof speechGesture> = null;
  private cueUsed = false;
  constructor(private random: () => number = Math.random) { this.nextIdle = this.pause(); }
  private pause() { return 14 + Math.max(0, Math.min(1, this.random())) * 10; }
  private chooseIdle(mood: Mood): ActiveGesture {
    const choices: {kind:ActiveGesture; weight:number}[] = [
      {kind:'stretch',weight:6}, {kind:'crossed',weight:mood==='thoughtful'||mood==='curious'?4:2},
      {kind:'point',weight:mood==='amused'?2:1},
    ];
    const eligible=choices.filter(choice=>choice.kind!==this.lastIdle);
    let ticket=Math.max(0,Math.min(.999999,this.random()))*eligible.reduce((sum,choice)=>sum+choice.weight,0);
    for(const choice of eligible){ticket-=choice.weight;if(ticket<0){this.lastIdle=choice.kind;return choice.kind;}}
    this.lastIdle=eligible.at(-1)!.kind;return this.lastIdle;
  }
  private start(kind: ActiveGesture, source: GestureFrame['source']) {
    this.active = {kind, source, clock: 0}; this.returning = null; this.idleTime = 0;
  }
  trigger(kind: ActiveGesture) {
    if (this.frame.kind !== 'rest' && this.frame.amount > 0) { this.release(); this.queued = kind; }
    else this.start(kind, 'manual');
  }
  private release() {
    if (this.frame.kind !== 'rest' && this.frame.amount > 0) this.returning = {...this.frame, kind: this.frame.kind, clock: 0};
    this.active = null;
  }
  update(delta: number, input: GestureInput): GestureFrame {
    // Clip/audio clocks follow real time even when software rendering drops frames.
    // The scene separately bounds physics steps and resets its clock on visibility.
    const dt = Number.isFinite(delta) ? Math.max(0, delta) : 0;
    const runningClip = this.active;
    if (input.reducedMotion) {
      this.active = null; this.returning = null; this.queued = null; this.idleTime = 0; this.cueUsed = true;
      this.previousState = input.state; this.previousReply = input.replyId; this.previousPlayback = input.playbackId;
      return this.frame = {kind: 'rest', amount: 0, source: 'rest'};
    }
    const beganSpeech = input.state === 'speaking' && (this.previousState !== 'speaking' || this.previousReply !== input.replyId || this.previousPlayback !== input.playbackId);
    if (beganSpeech) {
      this.release(); this.queued = null;
      this.cue = speechGesture(input.text ?? '', input.mood); this.cueUsed = false;
    } else if (input.state !== this.previousState && (input.state !== 'idle' || this.previousState === 'speaking')) {
      this.release(); this.queued = null; this.idleTime = 0; this.nextIdle = this.pause();
    }
    if (input.state === 'speaking') {
      // Native callbacks can arrive in a burst after a blocked frame. Drop this
      // utterance's optional cue rather than performing a word that may be over.
      if(dt>.35)this.cueUsed=true;
      // A missed word is dropped, never queued behind another action or replayed
      // after a slow frame. Ages describe monotonic native callback observations,
      // not a measurement of the audible word's exact onset.
      const boundary=typeof input.charIndex==='number'&&Number.isFinite(input.charIndex)&&input.charIndex>=0?input.charIndex:null;
      const fresh=(age:number|null|undefined)=>typeof age==='number'&&Number.isFinite(age)&&age>=0&&age<=.35;
      if (!this.cueUsed && this.cue) {
        const opening=this.cue.index===0;
        const reached=opening||(boundary!==null&&boundary>=this.cue.index);
        if(reached){
          this.cueUsed=true;
          const timely=opening?fresh(input.speechAge):boundary!==null&&boundary<this.cue.end&&fresh(input.boundaryAge);
          if(timely&&!this.returning&&this.active?.source!=='manual')this.start(this.cue.kind,'speech');
        }
      }
    } else if (input.state === 'idle' && input.mood !== 'gentle' && !this.active && !this.returning) {
      this.idleTime += dt;
      if (this.idleTime >= this.nextIdle) {
        this.start(this.chooseIdle(input.mood), 'idle');
      }
    }
    this.previousState = input.state; this.previousReply = input.replyId; this.previousPlayback = input.playbackId;
    if (this.returning) {
      this.returning.clock += dt;
      const amount = this.returning.amount * (1 - smooth(this.returning.clock / .3));
      if (this.returning.clock < .3) return this.frame = {...this.returning, amount};
      this.returning = null;
    }
    if (this.queued) { const kind = this.queued; this.queued = null; this.start(kind, 'manual'); }
    if (this.active) {
      const {kind, source} = this.active, clip = clips[kind];
      // A cue observed on this frame begins now, rather than inheriting the time
      // spent waiting for it before this frame was rendered.
      if (this.active === runningClip) this.active.clock += dt;
      const time = this.active.clock;
      if (time < clip.duration) return this.frame = {kind, source, amount: Math.min(smooth(time / clip.enter), smooth((clip.duration-time) / clip.exit))};
      this.active = null; this.idleTime = 0; this.nextIdle = this.pause();
    }
    return this.frame = {kind: 'rest', amount: 0, source: 'rest'};
  }
}
