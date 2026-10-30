/** Invalidate network and media callbacks together when a turn is superseded. */
export class TurnGate {
  private generation = 0;
  private controller: AbortController | null = null;
  begin() {
    this.cancel();
    this.controller = new AbortController();
    return { id: this.generation, signal: this.controller.signal };
  }
  isCurrent(id: number) { return this.generation === id && !this.controller?.signal.aborted; }
  cancel() { this.generation += 1; this.controller?.abort(); this.controller = null; }
}
