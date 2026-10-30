// Browser speech is an explicitly labelled preview path, never an AI-provider substitute.
export interface RecognitionResultEvent { results: ArrayLike<ArrayLike<{ transcript: string }>> }
export interface BrowserRecognition {
  lang: string; interimResults: boolean; continuous: boolean; maxAlternatives: number;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void; stop(): void; abort(): void;
}
export function recognitionConstructor(): (new () => BrowserRecognition) | undefined {
  const browser = window as unknown as {
    SpeechRecognition?: new () => BrowserRecognition;
    webkitSpeechRecognition?: new () => BrowserRecognition;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}
