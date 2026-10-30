/** Static project-prefix smoke: no provider calls or real microphone. */
import { chromium } from '@playwright/test';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const base = process.argv.find(arg => arg.startsWith('--base='))?.slice(7) ?? '/speckyg-app/';
const webgl = process.argv.includes('--webgl');
assert(base.startsWith('/') && base.endsWith('/'), 'Supply a slash-delimited --base path');
const dist = path.resolve('dist'), origin = 'http://127.0.0.1:3003';
const forbiddenRequests: string[] = [];
const mime: Record<string,string> = { '.html':'text/html', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml', '.webmanifest':'application/manifest+json', '.glb':'model/gltf-binary', '.json':'application/json' };
const server = createServer(async (req,res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url ?? '/',origin).pathname);
    if (!pathname.startsWith(base)) { forbiddenRequests.push(pathname); res.writeHead(404);res.end();return; }
    const local = pathname.slice(base.length);
    if (local === '__pages_probe__') {res.writeHead(200,{'Content-Type':'text/html'});res.end('<!doctype html><title>Cache-scope probe</title><link rel="icon" href="data:,">');return;}
    const file = path.resolve(dist,local || 'index.html');
    if (!file.startsWith(dist + path.sep)) {res.writeHead(400);res.end();return;}
    const bytes = await readFile(file);
    res.writeHead(200,{'Content-Type':mime[path.extname(file)] ?? 'application/octet-stream'});res.end(bytes);
  } catch {res.writeHead(404);res.end();}
});
await new Promise<void>(resolve=>server.listen(3003,'127.0.0.1',resolve));
const browser=await chromium.launch({headless:true,args:['--enable-unsafe-swiftshader']});
try {
  const context=await browser.newContext({serviceWorkers:'allow',viewport:{width:390,height:844}});
  const page=await context.newPage();
  await page.route('https://text.pollinations.ai/**',route=>route.abort());
  if (!webgl) await page.addInitScript(()=>{const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(this:HTMLCanvasElement,kind:string,...args:any[]):any{if(kind.startsWith('webgl'))return null;return(original as any).apply(this,[kind,...args]);}as typeof HTMLCanvasElement.prototype.getContext;});
  await page.goto(origin+base+'__pages_probe__');
  await page.evaluate(async()=>{await caches.open('speckyg-shell:/other-app/:keep');});
  await page.goto(origin+base);
  await page.getByRole('button',{name:'Talk to SpeckyG',exact:true}).waitFor();
  assert.equal(await page.locator('textarea,input,[contenteditable=true]').count(),0);
  await page.waitForFunction(()=>document.querySelector<HTMLImageElement>('.world-backdrop img')?.complete);
  assert(new URL(await page.locator('.world-backdrop img').getAttribute('src') ?? '',page.url()).pathname.startsWith(base));
  await page.evaluate(async()=>{await navigator.serviceWorker.ready;});
  await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
  const scope=await page.evaluate(async()=>(await navigator.serviceWorker.ready).scope);
  assert.equal(scope,origin+base);
  const cacheState=await page.evaluate(async()=>({names:await caches.keys(),urls:(await Promise.all((await caches.keys()).filter(key=>key!=='speckyg-shell:/other-app/:keep').map(async key=>(await(await caches.open(key)).keys()).map(req=>new URL(req.url).pathname)))).flat()}));
  assert(cacheState.names.includes('speckyg-shell:/other-app/:keep'),'Another project cache was deleted');
  assert(cacheState.urls.every(url=>url.startsWith(base)),'An out-of-scope URL entered the app cache');
  assert(cacheState.urls.some(url=>url.endsWith('/models/speckyg-reconstruction.glb')));
  assert(!cacheState.urls.some(url=>url.includes('/api/')));
  const manifestResponse=await context.request.get(origin+base+'manifest.webmanifest');assert.equal(manifestResponse.status(),200);
  const manifest=await manifestResponse.json();assert.equal(new URL(manifest.scope,origin+base+'manifest.webmanifest').href,origin+base);
  for (const item of manifest.icons) assert.equal((await context.request.get(new URL(item.src,origin+base+'manifest.webmanifest').href)).status(),200);
  const model=await context.request.get(origin+base+'models/speckyg-reconstruction.glb');assert.equal(model.status(),200);assert.equal((await model.body()).subarray(0,4).toString(),'glTF');
  if (webgl) await page.waitForFunction(()=>document.querySelector<HTMLElement>('.island-canvas')?.dataset.characterModelReady==='true',undefined,{timeout:60_000});
  await page.getByRole('button',{name:'Open menu',exact:true}).click();await page.getByRole('button',{name:'About SpeckyG',exact:true}).click();
  assert.equal(new URL(await page.getByRole('link',{name:'Compare with the original'}).getAttribute('href') ?? '',page.url()).pathname,base);
  await context.setOffline(true);await page.goto(origin+base+'?view=likeness');
  await page.getByRole('link',{name:'Back to the island',exact:true}).waitFor();
  assert.equal(new URL(await page.getByRole('link',{name:'Back to the island',exact:true}).getAttribute('href') ?? '',page.url()).pathname,base);
  await page.waitForFunction(()=>{const image=document.querySelector<HTMLImageElement>('.reference-frame img');return !!image?.complete&&image.naturalWidth>0;});
  assert.equal(forbiddenRequests.length,0,JSON.stringify(forbiddenRequests));
  console.log(JSON.stringify({base,webgl,scope,voiceOnly:true,scopedAssets:true,manifestIcons:true,modelValid:true,otherProjectCachePreserved:true,offlineLikenessNavigation:true,publicCachedAssets:cacheState.urls.length,apiEntries:0}));
  await context.close();
} finally {await browser.close();await new Promise<void>(resolve=>server.close(()=>resolve()));}
