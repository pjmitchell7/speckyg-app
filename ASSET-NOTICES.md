# Visual assets and third-party notices

The root MIT license applies to authored software. It does not grant rights in the SpeckyG name/visual branding, original supplied character image, derived illustrations, reconstructed model, environment images, textures or icons. They are included to display the requested prototype; no blanket redistribution, commercial-use or trademark license is established here. Contact the maintainer before reusing artwork independently of reviewing/forking this repository.

The original reference is preserved in public/assets/speckyg-original-reference.png. The detailed reference texture is a generated same-pose isolation derived from that reference. The GLB was reconstructed locally with TripoSR and augmented at runtime by an authored head/jaw/eyelid/wing rig and approximate anatomy repairs. Hidden surfaces are inferred and projection is view dependent; this is not the recovered original model.

Runtime construction also includes authored articulated wing/hand geometry and closure of missing body surfaces. The new poses are inferred from the character reference rather than recovered from original animation files. The supplied reference and source GLB are preserved.

TripoSR upstream: https://github.com/VAST-AI-Research/TripoSR (commit 107cefdc244c39106fa830359024f6a2f1c78871). Its MIT notice is retained in public/licenses/TripoSR.txt. That code license does not establish rights in reference artwork or automatically relicense the output model. No weights or reconstruction environment are distributed.

The cove/forest backplates, branch albedo and leaf texture were generated for this prototype. They are fictional imagery, not a claim of a photographed location or fully volumetric forest. Asset hashes are recorded in ASSET-PROVENANCE.json. No voice is cloned; speech uses the visitor's available device/browser voice.

Optional on-device speech recognition downloads Transformers.js 3.8.1, its matching ONNX Runtime and Xenova/whisper-tiny.en at revision 79fb389fc764e7c395bd330e9531d9d32ada7049. The converted model card declares Apache 2.0; upstream Whisper is MIT. Runtime and model files are not included in this repository. Sources and license texts are retained in public/licenses/LOCAL-SPEECH.txt.
