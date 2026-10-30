import { assetUrl, appBase } from './lib/assetUrl';
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './island.css';
const LikenessLab=React.lazy(()=>import('./world/LikenessLab'));
const content=new URLSearchParams(location.search).get('view')==='likeness'
  ? <React.Suspense fallback={<p style={{padding:24}}>Loading the reference study…</p>}><LikenessLab/></React.Suspense>
  : <App/>;
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode>{content}</React.StrictMode>);
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => { navigator.serviceWorker.register(assetUrl('sw.js'), { scope: appBase }).catch(() => {}); });
}
