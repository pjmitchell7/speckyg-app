import { assetUrl } from '../lib/assetUrl';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { CharacterState, Mood } from '../../shared/types';
import type { CharacterReaction } from './types';
import {createReconstructionRig} from './referenceRig';
import {repairReferenceAnatomy} from './referenceRepairs';

export interface ReferenceMeshOptions {
  modelUrl?: string;
  textureUrl?: string;
  height?: number;
  sourceProjection?: boolean;
}

export interface ReferenceMeshHandle {
  /** Empty until readyPromise resolves. This is a real reconstructed mesh, not an image plane. */
  group: THREE.Group;
  readyPromise: Promise<THREE.Group>;
  dispose(): void;
  setSourceProjection(enabled: boolean): void;
  /** Source-space weighted head, jaw, eyelid and wing deformation. */
  update(dt: number, elapsed: number, state: CharacterState, mood: Mood, amplitude: number, reducedMotion: boolean): void;
  react(reaction: CharacterReaction): void;
}

type ProjectionShader = Parameters<THREE.MeshStandardMaterial['onBeforeCompile']>[0];

/**
 * Articulated TripoSR reconstruction adapter with authored regional deformation.
 * Source-photo projection improves the conditioning view; it stretches around
 * oblique surfaces and is not evidence of recovered hidden-side texture or rigging.
 */
export function createReferenceMesh(options: ReferenceMeshOptions = {}): ReferenceMeshHandle {
  const group = new THREE.Group(); group.name = 'SpeckyG articulated image-conditioned reconstruction';
  group.userData = {
    interaction: 'specky', kind: 'articulated-reference-mesh', ready: false,
    independentJaw: true, independentWings: true, rigged: true,
    sourceProjection: options.sourceProjection ?? true,
    provenance: 'ASSET-PROVENANCE.json',
    limitation: 'Authored regional deformation over reconstructed geometry; no recovered anatomical skeleton. Projection stretches at large poses; unseen sides inferred.',
  };
  const performance = new THREE.Group(); performance.name = 'Articulated reconstruction root'; group.add(performance);
  const normalization = new THREE.Group(); normalization.name = 'Height-normalized reconstruction'; performance.add(normalization);
  const orientation = new THREE.Group(); orientation.name = 'Source XYZ to world ZXY'; normalization.add(orientation);
  // source X -> world Z (front), source Y -> world X, source Z -> world Y (up).
  orientation.applyMatrix4(new THREE.Matrix4().set(0,1,0,0, 0,0,1,0, 1,0,0,0, 0,0,0,1));

  let disposed = false, loadedRoot: THREE.Group | null = null, sourcePhoto: THREE.Texture | null = null;
  let projectionEnabled = options.sourceProjection ?? true;
  let rig:ReturnType<typeof createReconstructionRig>|null=null;
  const blinkUniforms:{value:number}[]=[];
  const projectionUniforms: { value: number }[] = [];

  function disposeTextures(textures: Iterable<THREE.Texture>) {
    const images = new Set<object>();
    for (const texture of textures) {
      const image = texture.image as { close?: () => void } | undefined;
      texture.dispose();
      if (image && typeof image === 'object' && typeof image.close === 'function' && !images.has(image)) {
        images.add(image); image.close();
      }
    }
  }

  function disposeRoot(root: THREE.Object3D) {
    const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        materials.add(material);
        for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value);
      }
    });
    geometries.forEach(geometry => geometry.dispose()); materials.forEach(material => material.dispose()); disposeTextures(textures);
  }

  function installProjection(root: THREE.Object3D, bounds: THREE.Box3, texture: THREE.Texture) {
    root.updateMatrixWorld(true);
    const originals = new Set<THREE.BufferGeometry>();
    const dimensions = texture.image as { width: number; height: number };
    // Matches the inspected CPU viewer's foreground crop within the unchanged PNG.
    const crop = new THREE.Vector4(0, 1 - 1573 / dimensions.height, 984 / dimensions.width, 1561 / dimensions.height);
    const boundVector = new THREE.Vector4(bounds.min.y, bounds.max.y, bounds.min.z, bounds.max.z);
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh)) return;
      originals.add(object.geometry);
      const geometry = object.geometry.clone();
      const positions = geometry.getAttribute('position');
      if (!geometry.getAttribute('normal')) geometry.computeVertexNormals();
      const normals = geometry.getAttribute('normal');
      const restPositions = new Float32Array(positions.count * 3), restNormals = new Float32Array(positions.count * 3);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      const point = new THREE.Vector3(), normal = new THREE.Vector3();
      for (let index = 0; index < positions.count; index++) {
        point.fromBufferAttribute(positions, index).applyMatrix4(object.matrixWorld);
        normal.fromBufferAttribute(normals, index).applyMatrix3(normalMatrix).normalize();
        point.toArray(restPositions, index * 3); normal.toArray(restNormals, index * 3);
      }
      // These attributes remain in the source rest frame. External yaw, translation,
      // normalization and whole-body breathing cannot slide the projected photo.
      geometry.setAttribute('sourceRestPosition', new THREE.BufferAttribute(restPositions, 3));
      geometry.setAttribute('sourceRestNormal', new THREE.BufferAttribute(restNormals, 3));
      object.geometry = geometry;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (!(material instanceof THREE.MeshStandardMaterial)) continue;
        material.onBeforeCompile = (shader: ProjectionShader) => {
          const enabled = { value: projectionEnabled ? 1 : 0 }; projectionUniforms.push(enabled);
          shader.uniforms.uSourcePhoto = { value: texture };
          const blink={value:0};blinkUniforms.push(blink);shader.uniforms.uRigBlink=blink;
          shader.uniforms.uSourceProjection = enabled;
          shader.uniforms.uProjectionBounds = { value: boundVector };
          shader.uniforms.uSourceCrop = { value: crop };
          shader.vertexShader = `attribute vec3 sourceRestPosition;
attribute vec3 sourceRestNormal;
uniform vec4 uProjectionBounds;
uniform vec4 uSourceCrop;
varying vec2 vSourcePhotoUv;
varying vec3 vSourceRestNormal;
varying vec2 vRigUv;
` + shader.vertexShader;
          shader.vertexShader = shader.vertexShader.replace('void main() {', `void main() {
vec2 sourceUv=vec2((sourceRestPosition.y-uProjectionBounds.x)/(uProjectionBounds.y-uProjectionBounds.x),(sourceRestPosition.z-uProjectionBounds.z)/(uProjectionBounds.w-uProjectionBounds.z));
vSourcePhotoUv=uSourceCrop.xy+sourceUv*uSourceCrop.zw;
vSourceRestNormal=sourceRestNormal;vRigUv=sourceUv;`);
          shader.fragmentShader = `uniform sampler2D uSourcePhoto;
uniform float uSourceProjection;
uniform float uRigBlink;
uniform vec4 uSourceCrop;
varying vec2 vSourcePhotoUv;
varying vec3 vSourceRestNormal;
varying vec2 vRigUv;
` + shader.fragmentShader;
          shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
vec4 sourcePhoto=texture2D(uSourcePhoto,vSourcePhotoUv);
float frontWeight=smoothstep(0.2,0.65,normalize(vSourceRestNormal).x);
float inPhoto=step(0.0,vSourcePhotoUv.x)*step(vSourcePhotoUv.x,1.0)*step(0.0,vSourcePhotoUv.y)*step(vSourcePhotoUv.y,1.0);
vec3 featherLid=texture2D(uSourcePhoto,uSourceCrop.xy+vec2(.447,.73)*uSourceCrop.zw).rgb;
featherLid=mix(featherLid,vec3(.83,.48,.095),.35);
vec2 eye=(vRigUv-vec2(.541,.724))/vec2(.079,.042);
vec2 farEye=(vRigUv-vec2(.79,.746))/vec2(.027,.027);
float eyeMask=1.0-smoothstep(.85,1.03,length(eye));float farMask=1.0-smoothstep(.85,1.03,length(farEye));
float closeNear=smoothstep(.88-uRigBlink*1.8,.98-uRigBlink*1.8,eye.y);
float closeFar=smoothstep(.88-uRigBlink*1.8,.98-uRigBlink*1.8,farEye.y);
float closure=max(eyeMask*closeNear,farMask*closeFar)*smoothstep(0.0,.09,uRigBlink);
float lidGrain=.94+.06*sin(vRigUv.x*1713.0)*sin(vRigUv.y*1951.0);
float curvedShade=clamp(.73+.23*eye.y+.11*eye.x*eye.x,.55,1.05);
sourcePhoto.rgb=mix(sourcePhoto.rgb,featherLid*lidGrain*curvedShade,closure);
float nearSeam=(1.0-smoothstep(.025,.065,abs(eye.y+.10+.13*(1.0-eye.x*eye.x))))*(1.0-smoothstep(.85,1.0,abs(eye.x)));
float farSeam=(1.0-smoothstep(.035,.09,abs(farEye.y+.10+.13*(1.0-farEye.x*farEye.x))))*(1.0-smoothstep(.85,1.0,abs(farEye.x)));
float lidSeam=max(nearSeam,farSeam)*smoothstep(.55,.95,uRigBlink);
sourcePhoto.rgb=mix(sourcePhoto.rgb,vec3(.055,.027,.009),lidSeam*.9);
diffuseColor.rgb=mix(diffuseColor.rgb,sourcePhoto.rgb,uSourceProjection*frontWeight*sourcePhoto.a*inPhoto);`);
        };
        material.customProgramCacheKey = () => 'speckyg-source-rest-articulation-v2'; material.needsUpdate = true;
      }
      object.castShadow = true; object.receiveShadow = true;
      object.userData.interaction = 'specky'; object.userData.rigged = true;
    });
    originals.forEach(geometry => geometry.dispose());
  }

  const readyPromise = (async () => {
    try {
      const gltf = await new GLTFLoader().loadAsync(options.modelUrl ?? assetUrl('models/speckyg-reconstruction.glb'));
      loadedRoot = gltf.scene;
      if (disposed) { disposeRoot(loadedRoot); loadedRoot = null; throw new Error('Reference mesh was disposed before loading completed.'); }
      const sourceBounds = new THREE.Box3().setFromObject(loadedRoot);
      if (sourceBounds.isEmpty() || sourceBounds.max.z <= sourceBounds.min.z) throw new Error('Reference mesh has invalid source bounds.');
      sourcePhoto = await new THREE.TextureLoader().loadAsync(options.textureUrl ?? assetUrl('assets/speckyg-reference-artwork.png'));
      if (disposed) throw new Error('Reference mesh was disposed before its texture loaded.');
      sourcePhoto.colorSpace = THREE.SRGBColorSpace;
      sourcePhoto.wrapS = sourcePhoto.wrapT = THREE.ClampToEdgeWrapping;
      sourcePhoto.anisotropy = 4;
      installProjection(loadedRoot, sourceBounds, sourcePhoto);
      repairReferenceAnatomy(loadedRoot,sourceBounds);group.userData.anatomyRepairs=loadedRoot.userData.anatomyRepairs;

      rig=createReconstructionRig(loadedRoot,sourceBounds);group.userData.deformation=rig.diagnostics;group.userData.deformationRig='authored-source-regions-v1';
      orientation.add(loadedRoot);
      // Normalize in the adapter's local frame. The caller may already have moved
      // or yawed group while the asynchronous assets were loading.
      const orientedBounds = sourceBounds.clone().applyMatrix4(orientation.matrix);
      const size = orientedBounds.getSize(new THREE.Vector3()), center = orientedBounds.getCenter(new THREE.Vector3());
      const requestedHeight = options.height ?? 3.7;
      if (!Number.isFinite(requestedHeight) || requestedHeight <= 0 || !Number.isFinite(size.y) || size.y <= 0) throw new Error('Reference mesh needs a positive finite height.');
      const factor = requestedHeight / size.y;
      normalization.scale.setScalar(factor);
      normalization.position.set(-center.x * factor, -orientedBounds.min.y * factor, -center.z * factor);
      let triangles = 0, skins = 0;
      loadedRoot.traverse(object => { if (object instanceof THREE.Mesh) triangles += (object.geometry.index?.count ?? object.geometry.getAttribute('position').count) / 3; if (object instanceof THREE.SkinnedMesh) skins++; });
      group.userData.ready = true; group.userData.triangles = triangles; group.userData.skins = skins;
      group.userData.animations = gltf.animations.length; group.userData.height = requestedHeight;
      group.updateMatrixWorld(true);
      return group;
    } catch (error) {
      group.userData.ready = false;
      if (loadedRoot) { loadedRoot.removeFromParent(); disposeRoot(loadedRoot); loadedRoot = null; }
      if (sourcePhoto) disposeTextures([sourcePhoto]); sourcePhoto = null;
      throw new Error('The articulated reconstruction could not load.', { cause: error });
    }
  })();

  return {
    group, readyPromise,
    setSourceProjection(enabled) { projectionEnabled = enabled; group.userData.sourceProjection = enabled; for (const uniform of projectionUniforms) uniform.value = enabled ? 1 : 0; },
    react(kind) { rig?.react(kind); },
    update(dt, elapsed, state, mood, amplitude, reducedMotion) {
      rig?.update(dt,elapsed,state,mood,amplitude,reducedMotion,Number(group.userData.gazeX)||0,Number(group.userData.gazeY)||0);
      if(rig)for(const uniform of blinkUniforms)uniform.value=rig.diagnostics.pose.blink;
    },    dispose() {
      if (disposed) return; disposed = true; group.userData.ready = false;
      if (loadedRoot) { loadedRoot.removeFromParent(); disposeRoot(loadedRoot); loadedRoot = null; }
      if (sourcePhoto) disposeTextures([sourcePhoto]); sourcePhoto = null; projectionUniforms.length = 0; blinkUniforms.length=0;rig=null; group.clear();
    },
  };
}
