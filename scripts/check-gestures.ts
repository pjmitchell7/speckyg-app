/** Actual WebGL poses plus controlled speech events. No microphone, audible TTS or provider calls. */
import { chromium, expect, type BrowserContext, type Page } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const url = argument('url') ?? 'http://127.0.0.1:5175/';
const evidence = argument('evidence');
if (evidence) await mkdir(path.resolve(evidence), { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader'] });
const pageErrors: string[] = [], externalRequests: string[] = [], apiRequests: string[] = [];
const captures: { name: string; before: Record<string, string | undefined>; after: Record<string, string | undefined> }[] = [];
let activePage: Page | null = null;
type Pose = 'rest' | 'point' | 'stretch' | 'crossed';
const scene = (page: Page) => page.locator('.island-canvas');

async function installFixture(context: BrowserContext) {
  await context.addInitScript({ content: String.raw`(() => {
    const w = window;
    const request = window.requestAnimationFrame.bind(window), cancel = window.cancelAnimationFrame.bind(window);
    let serial = 0;
    const callbacks = new Map();
    const gate = { frozen: false, target: null, matched: null };
    function schedule(task) {
      task.native = request(timestamp => {
        task.native = undefined;
        if (!callbacks.has(task.id) || gate.frozen) return;
        callbacks.delete(task.id);
        task.callback(timestamp);
        // Inspect only after a normal render callback has completed. No app pose or clock is replaced.
        const data = document.querySelector('.island-canvas')?.dataset, target = gate.target;
        if (target && data?.characterModelReady === 'true' &&
          (!target.kind || data.characterGesture === target.kind) &&
          (!target.source || data.characterGestureSource === target.source) &&
          Number(data.characterGestureAmount) >= target.minimum &&
          Number(data.characterGestureAmount) <= (target.maximum ?? 1)) {
          gate.frozen = true; gate.target = null; gate.matched = { timestamp, scene: { ...data } };
        }
      });
    }
    window.requestAnimationFrame = callback => {
      const task = { id: ++serial, callback, native: undefined };
      callbacks.set(task.id, task); if (!gate.frozen) schedule(task); return task.id;
    };
    window.cancelAnimationFrame = id => {
      const task = callbacks.get(id); if (task?.native !== undefined) cancel(task.native); callbacks.delete(id);
    };
    gate.arm = target => {
      if (gate.frozen) throw new Error('Release the prior visual capture before arming another.');
      gate.target = target; gate.matched = null;
    };
    gate.release = () => {
      gate.target = null; gate.frozen = false;
      for (const task of callbacks.values()) if (task.native === undefined) schedule(task);
    };
    w.__gestureCapture = gate;
    w.__gestureVoice = { recognitions: [], utterances: [], cancellations: 0 };
    class Recognition {
      onresult; onend; onerror;
      start() { w.__gestureVoice.recognitions.push(this); }
      stop() { this.onend?.(); }
      abort() { this.onend?.(); }
    }
    w.SpeechRecognition = Recognition;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [],
      cancel: () => { w.__gestureVoice.cancellations++; },
      speak: utterance => { w.__gestureVoice.utterances.push(utterance); },
    } });
  })();` });
  await context.route('**/*', route => {
    const request = route.request(), requestUrl = new URL(request.url());
    if (/^https?:$/.test(requestUrl.protocol) && requestUrl.origin !== new URL(url).origin) {
      externalRequests.push(request.url()); return route.abort();
    }
    if (/\/api\//.test(requestUrl.pathname)) { apiRequests.push(request.url()); return route.abort(); }
    return route.continue();
  });
}

async function ready(page: Page) {
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(url);
  assert.equal(await page.evaluate(() => typeof (window as any).__gestureCapture?.arm), 'function', 'The self-contained visual capture preload must install before testing app behavior.');
  await expect(scene(page)).toHaveAttribute('data-character-model-ready', 'true', { timeout: 90_000 });
  await expect(scene(page)).toHaveAttribute('data-character-gesture', 'rest');
  await expect.poll(async () => Number(await scene(page).getAttribute('data-triangles'))).toBeGreaterThan(1_000);
  assert.equal(await page.locator('textarea,input,[contenteditable=true]').count(), 0);
  assert.equal(await page.getByRole('button').count(), 2);
}

async function pose(page: Page, kind: Pose, source?: string, minimum = .98) {
  await page.waitForFunction(({ kind, source, minimum }) => {
    const data = document.querySelector<HTMLElement>('.island-canvas')?.dataset;
    return data?.characterGesture === kind &&
      (kind === 'rest' ? Number(data.characterGestureAmount) === 0 : Number(data.characterGestureAmount) >= minimum) &&
      (!source || data.characterGestureSource === source);
  }, { kind, source, minimum }, { timeout: 90_000, polling: 50 });
  const displacement = Number(await scene(page).getAttribute('data-character-displacement'));
  assert(Number.isFinite(displacement));
}

async function capture(page: Page, name: string) {
  if (!evidence) return;
  const before = await scene(page).evaluate(element => ({ ...(element as HTMLElement).dataset }));
  await page.screenshot({ path: path.join(path.resolve(evidence), `${name}.png`) });
  const after = await scene(page).evaluate(element => ({ ...(element as HTMLElement).dataset }));
  captures.push({ name, before, after });
}

async function capturePose(page: Page, name: string, target: { kind?: Pose; source?: string; minimum: number; maximum?: number }, trigger?: () => Promise<void>) {
  await page.evaluate(target => (window as any).__gestureCapture.arm(target), target);
  try {
    await trigger?.();
    await page.waitForFunction(() => (window as any).__gestureCapture.frozen, undefined, { timeout: 90_000, polling: 50 });
    const matched = await page.evaluate(() => (window as any).__gestureCapture.matched);
    assert(matched?.scene, 'A normal render frame must establish the captured pose.');
    const before = matched.scene as Record<string, string | undefined>;
    if (target.kind) assert.equal(before.characterGesture, target.kind);
    if (target.source) assert.equal(before.characterGestureSource, target.source);
    assert(Number(before.characterGestureAmount) >= target.minimum);
    assert(Number(before.characterGestureAmount) <= (target.maximum ?? 1));
    if (evidence) await page.screenshot({ path: path.join(path.resolve(evidence), `${name}.png`) });
    const after = await scene(page).evaluate(element => ({ ...(element as HTMLElement).dataset }));
    assert.deepEqual(after, before, 'The rendered pose changed while its full-page image was being captured.');
    captures.push({ name, before, after });
    console.log(JSON.stringify({ capture: name, kind: before.characterGesture, amount: before.characterGestureAmount, source: before.characterGestureSource, frameHeld: true }));
  } finally {
    await page.evaluate(() => (window as any).__gestureCapture.release());
  }
}

async function islandActions(page: Page) {
  await page.getByRole('button', { name: 'Open menu', exact: true }).click();
  const details = page.locator('details').filter({ hasText: 'A little island life' });
  if (!await details.evaluate(element => (element as HTMLDetailsElement).open)) {
    await details.locator('summary').click();
  }
}

async function manual(page: Page, label: string, kind: Exclude<Pose, 'rest'>, view: string) {
  const trigger = async () => { await islandActions(page); await page.getByRole('button', { name: label, exact: true }).click(); };
  await capturePose(page, `${view}-${kind}-transition`, { kind, source: 'manual', minimum: .30, maximum: .80 }, trigger);
  await pose(page, 'rest');
  await capturePose(page, `${view}-${kind}-peak`, { kind, source: 'manual', minimum: .98 }, trigger);
  await pose(page, 'rest');
  console.log(JSON.stringify({ checkpoint: `${view}-${kind}`, returnedToRest: true }));
}

try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'no-preference' });
  await installFixture(context);
  const page = await context.newPage();
  activePage = page;
  await ready(page); await capturePose(page, 'rest-portrait', { kind: 'rest', minimum: 0, maximum: 0 });
  await manual(page, 'Ask SpeckyG to point', 'point', 'portrait');
  await manual(page, 'Ask SpeckyG to stretch his wings', 'stretch', 'portrait');
  await manual(page, 'Ask SpeckyG to fold his wings', 'crossed', 'portrait');
  await page.setViewportSize({ width: 1280, height: 800 });
  await capturePose(page, 'rest-landscape', { kind: 'rest', minimum: 0, maximum: 0 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await manual(page, 'Ask SpeckyG to point', 'point', 'landscape');
  await manual(page, 'Ask SpeckyG to stretch his wings', 'stretch', 'landscape');
  await manual(page, 'Ask SpeckyG to fold his wings', 'crossed', 'landscape');
  await capturePose(page, 'idle-action', { source: 'idle', minimum: .98 }); await pose(page, 'rest');

  // The authored music reply includes “first”; its semantic pointing cue is after the first word.
  await page.getByRole('button', { name: 'Talk to SpeckyG', exact: true }).click();
  await page.getByRole('button', { name: 'Try scripted voice preview', exact: true }).click();
  await page.getByRole('button', { name: 'Finish speaking', exact: true }).waitFor();
  await page.evaluate(() => {
    const recognition = (window as any).__gestureVoice.recognitions.at(-1);
    recognition.onresult({ results: [[{ transcript: 'Tell me about music' }]] }); recognition.onend();
  });
  await expect.poll(() => page.evaluate(() => (window as any).__gestureVoice.utterances.length)).toBe(1);
  await page.waitForTimeout(500);
  await expect(scene(page)).toHaveAttribute('data-character-state', 'thinking');
  assert.notEqual(await scene(page).getAttribute('data-character-gesture-source'), 'speech');
  const cueIndex = await page.evaluate(() => {
    const utterance = (window as any).__gestureVoice.utterances.at(-1);
    const index = utterance.text.indexOf('first');
    if (index <= 1) throw new Error('The authored fixture reply no longer contains the expected later cue.');
    utterance.onstart?.(); utterance.onboundary?.({ charIndex: 1 });
    return index;
  });
  await expect(scene(page)).toHaveAttribute('data-character-state', 'speaking');
  await page.waitForTimeout(350);
  assert.notEqual(await scene(page).getAttribute('data-character-gesture-source'), 'speech');
  await capturePose(page, 'speech-point', { kind: 'point', source: 'speech', minimum: .98 }, async () => {
    await page.evaluate(index => {
      const w = window as any, utterance = w.__gestureVoice.utterances.at(-1);
      w.__lateBoundary = utterance.onboundary; utterance.onboundary?.({ charIndex: index });
    }, cueIndex);
  });
  await page.getByRole('button', { name: 'Stop Specky’s reply', exact: true }).click();
  await pose(page, 'rest');
  await page.evaluate(index => (window as any).__lateBoundary?.({ charIndex: index }), cueIndex);
  await page.waitForTimeout(350);
  await expect(scene(page)).toHaveAttribute('data-character-state', 'idle');
  await expect(scene(page)).toHaveAttribute('data-character-jaw', '0');
  assert.notEqual(await scene(page).getAttribute('data-character-gesture-source'), 'speech');

  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.reload();
  await expect(scene(page)).toHaveAttribute('data-character-model-ready', 'true', { timeout: 90_000 });
  await islandActions(page);
  await page.getByRole('button', { name: 'Ask SpeckyG to stretch his wings', exact: true }).click();
  await page.waitForTimeout(1_500);
  await pose(page, 'rest');
  await expect(scene(page)).toHaveAttribute('data-character-gesture-amount', '0');
  assert.deepEqual(pageErrors, []); assert.deepEqual(externalRequests, []); assert.deepEqual(apiRequests, []);
  const result = { checkedAtUtc: new Date().toISOString(), browser: await browser.version(), actualWebGLModel: true, initialRest: true, manualPointStretchCrossed: true, allReturnToRest: true, portraitAndLandscape: true, transitionAndPeakCaptures: true, idleGestureObserved: true, speechWaitsForActualStart: true, wordBoundaryTriggersPoint: true, stopAndLateBoundarySettle: true, reducedMotionSuppressesLargePose: true, voiceOnly: true, externalRequests: 0, pageErrors: 0, captures, limits: 'Visual snapshots hold subsequent RAF callbacks only after a matching normal rendered frame, then release. Speech recognition and synthesis use controlled events; no physical microphone, audible voice, Patois quality or visual grade is established by this script.' };
  if (evidence) await writeFile(path.join(path.resolve(evidence), 'receipt.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify({ ...result, captures: captures.map(({ name, before }) => ({ name, kind: before.characterGesture, amount: before.characterGestureAmount, source: before.characterGestureSource })) })); await context.close();
} catch (error) {
  if (activePage && !activePage.isClosed()) {
    const diagnostic = await activePage.evaluate(() => ({ scene: { ...document.querySelector<HTMLElement>('.island-canvas')?.dataset }, visibility: document.visibilityState, text: document.body.innerText })).catch(() => null);
    if (evidence && diagnostic) {
      await writeFile(path.join(path.resolve(evidence), 'failure.json'), JSON.stringify({ ...diagnostic, captures }, null, 2) + '\n');
      await capture(activePage, 'failure').catch(() => {});
    }
    console.error(JSON.stringify({ gestureCheckFailed: true, diagnostic, error: error instanceof Error ? error.message : String(error) }));
  }
  throw error;
} finally { await browser.close(); }
