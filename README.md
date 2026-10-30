# SpeckyG

[Open the app](https://pjmitchell7.github.io/speckyg-app/)

A mobile-first, voice-only Jamaican parrot conversation prototype built with React, TypeScript and Three.js. An articulated reference-conditioned character lives in a moving treetop-cove setting. The environment combines photographic scenery with moving 3D foliage, water, birds and interactive props.

The public website needs no ChatGPT or GitHub login. Tap the microphone and allow browser microphone access. Voice availability depends on your browser/device.

## Conversation

Free online uses the anonymous Pollinations Classic service, with explicit first-use consent. No owner API key, account or paid fallback is used. The service is 16+, best effort and limited to one request every 30 seconds per internet address; people sharing a connection share its quota. Conversation and enabled notes go to the provider, which may retain/cache responses. Browser speech services may process microphone audio.

A separately selected scripted voice preview uses authored replies. It is not open-ended AI. Transcripts stay in browser memory; only explicitly saved notes persist locally. Turning memory off removes saved notes. No recording starts until a microphone action.

[Service limits](https://github.com/pollinations/pollinations/blob/master/APIDOCS.md) · [Provider privacy](https://raw.githubusercontent.com/pollinations/pollinations/main/pollinations.ai/public/legal/PRIVACY_POLICY.md)

## Run locally

Use Node 22 or newer. Run npm ci, then npm run dev. npm test checks the character rig, cancellation and bounded free transport without contacting a paid provider. npm run build produces the static website in dist. The two files under server contain only shared prompt/schema code; this public app needs no server or secret.

## GitHub Pages

The workflow takes its deployment base from GitHub Pages metadata and deploys dist after a successful main-branch push. It uses GitHub's built-in deployment token; no custom secret is required. Change VITE_BASE_PATH when deploying a fork under another project path, or use / for a domain root.

## Status and license

This is a prototype. Feet, eyelids and unseen anatomy remain approximate. Real-device microphone behavior, phone performance and Jamaican Patois/voice authenticity need further validation. Cached world assets can reload offline; speech and online conversation may still need a connection.

Authored software is MIT licensed. Character images, model, textures, visual branding and other artwork are excluded from that software grant; see ASSET-NOTICES.md. Dependency notices are in public/licenses/THIRD-PARTY.txt. No private conversation/planning history is part of this repository.
