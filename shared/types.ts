export type Mood = 'warm' | 'amused' | 'thoughtful' | 'gentle' | 'curious' | 'celebrating';
export type CharacterState = 'idle' | 'listening' | 'thinking' | 'speaking';
export type Mode = 'live' | 'demo' | 'free';
export interface ChatMessage { id: string; role: 'user' | 'assistant'; text: string; createdAt: number; interrupted?: boolean }
export interface Preferences {
  voice: boolean;
  teasing: 'off' | 'gentle';
  faith: 'welcome' | 'only-if-asked';
  remember: boolean;
  reducedMotion: boolean;
}
export interface MemoryNote { id: string; text: string; createdAt: number }
export interface ChatRequest {
  messages: Pick<ChatMessage, 'role' | 'text'>[];
  preferences: Pick<Preferences, 'teasing' | 'faith'>;
  memories: string[];
  mode: Mode;
  action?: 'chat' | 'topic';
  topic?: string;
}
export interface ChatReply { text: string; mood: Mood; source: Mode }
export interface AppConfig { liveChat: boolean; liveVoice: boolean; transcription: boolean }
