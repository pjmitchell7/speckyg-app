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
export function speechGesture(text: string, mood: Mood): {kind: ActiveGesture; index: number} | null {
  if (/\b(mi name|good fi meet|nice to meet|welcome|sorry|griev(?:e|ing)|funeral|passed away|death|died)\b/i.test(text) || mood === 'gentle') return null;
  const stretch = /\b(stretch|breathe|breath|relax|unwind|feathers?|wings?|tek it easy|take it easy)\b/i.exec(text);
  if (stretch) return { kind: 'stretch', index: stretch.index };
  const point = /\b(remember|look|listen|one thing|watch|here['’]s|here is|first|mek sure|make sure)\b/i.exec(text);
  if (point) return { kind: 'point', index: point.index };
  const question = /\b(really|wonder|think|suppose|tell mi|tell me|how come|what if)\b/i.exec(text);
  if (question && (mood === 'curious' || mood === 'thoughtful' || mood === 'amused')) return { kind: 'crossed', index: question.index };
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
  private idleSequence = 0;
  private previousState: CharacterState = 'idle';
  private previousReply: string | undefined;
  private speechTime = 0;
  private cue: ReturnType<typeof speechGesture> = null;
  private cueUsed = false;
  private boundarySeen = false;
  constructor(private random: () => number = Math.random) { this.nextIdle = this.pause(); }
  private pause() { return 14 + Math.max(0, Math.min(1, this.random())) * 10; }
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
      this.previousState = input.state; this.previousReply = input.replyId;
      return this.frame = {kind: 'rest', amount: 0, source: 'rest'};
    }
    const beganSpeech = input.state === 'speaking' && (this.previousState !== 'speaking' || this.previousReply !== input.replyId);
    if (beganSpeech) {
      this.release(); this.queued = null; this.speechTime = 0; this.boundarySeen = false;
      this.cue = speechGesture(input.text ?? '', input.mood); this.cueUsed = false;
    } else if (input.state !== this.previousState && (input.state !== 'idle' || this.previousState === 'speaking')) {
      this.release(); this.queued = null; this.idleTime = 0; this.nextIdle = this.pause();
    }
    if (input.state === 'speaking') {
      this.speechTime += dt;
      this.boundarySeen ||= (input.charIndex ?? 0) > 0;
      // A time estimate is used only inside actual playback when word events are unavailable.
      const cursor = this.boundarySeen ? input.charIndex ?? 0 : this.speechTime * 13;
      if (!this.cueUsed && this.cue && cursor >= this.cue.index && !this.returning && this.active?.source !== 'manual') {
        this.start(this.cue.kind, 'speech'); this.cueUsed = true;
      }
    } else if (input.state === 'idle' && input.mood !== 'gentle' && !this.active && !this.returning) {
      this.idleTime += dt;
      if (this.idleTime >= this.nextIdle) {
        const sequence: ActiveGesture[] = ['stretch', 'point', 'crossed'];
        this.start(sequence[this.idleSequence++ % sequence.length], 'idle');
      }
    }
    this.previousState = input.state; this.previousReply = input.replyId;
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
