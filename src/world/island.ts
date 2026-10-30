import { assetUrl } from '../lib/assetUrl';
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { IslandWorld, WorldInteraction } from './types';
import { createEnvironmentSurface, createOrganicBranch } from './environmentSurfaces';
import { createLivingEnvironment } from './livingEnvironment';

// Tactile foreground only. The scene wrapper supplies the distant photographic environment.
// Foreground meshes are source-authored; the perch also uses generated bark imagery.
export function createIslandWorld(): IslandWorld {
  const group = new THREE.Group();
  group.name = 'SpeckyG’s treetop verandah';
  const targets: THREE.Object3D[] = [];
  const living = createLivingEnvironment(); group.add(living.group); targets.push(...living.targets);
  const materials: { material: THREE.MeshStandardMaterial; day: number; night: number }[] = [];
  const mat = (day: number, night: number, roughness = .86) => {
    const material = new THREE.MeshStandardMaterial({ color: day, roughness });
    materials.push({ material, day, night });
    return material;
  };
  const wood = mat(0x947044, 0x514438);
  const woodLight = mat(0xb19770, 0x685943);
  const woodDark = mat(0x63513d, 0x302c32);
  const perchBark = mat(0xffffff, 0x777d8a, .95);
  const gold = mat(0xe3b65e, 0xb78a55, .55);
  const cream = mat(0xffe7b4, 0xc6b89b);
  const red = mat(0xe76d40, 0x8d453e);
  const black = mat(0x26382c, 0x202a32);

  const woodSurface = createEnvironmentSurface('wood');
  const barkSurface = createEnvironmentSurface('bark');
  for (const material of [wood, woodLight, woodDark]) { Object.assign(material, woodSurface); material.bumpScale = .022; }
  Object.assign(perchBark, barkSurface); perchBark.bumpScale = .045;
  // Browser-owned generated bark photography. Node smoke tests retain the
  // deterministic source-authored fallback; no global Texture objects are reused.
  if (typeof document !== 'undefined') {
    const bump = new THREE.Texture();
    const photo = new THREE.TextureLoader().load(assetUrl('assets/environment/branch-bark.jpg'), loaded => {
      bump.image = loaded.image; bump.needsUpdate = true;
    });
    photo.colorSpace = THREE.SRGBColorSpace;
    for (const texture of [photo, bump]) {
      texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
      texture.anisotropy = 4;
    }
    perchBark.map = photo; perchBark.bumpMap = bump;
  }

  const sphereGeometry = new THREE.SphereGeometry(1, 12, 8);
  const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
  const dummy = new THREE.Object3D();
  const up = new THREE.Vector3(0, 1, 0);
  function mesh(geometry: THREE.BufferGeometry, material: THREE.Material, parent: THREE.Object3D = group) {
    const result = new THREE.Mesh(geometry, material); parent.add(result); return result;
  }
  function box(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = group) {
    const result = mesh(boxGeometry, material, parent); result.position.set(x, y, z); result.scale.set(sx, sy, sz); return result;
  }
  function ball(x: number, y: number, z: number, sx: number, sy: number, sz: number, material: THREE.Material, parent: THREE.Object3D = group) {
    const result = mesh(sphereGeometry, material, parent); result.position.set(x, y, z); result.scale.set(sx, sy, sz); return result;
  }
  function branch(a: THREE.Vector3, b: THREE.Vector3, radius: number, material: THREE.Material, parent: THREE.Object3D = group) {
    const length = a.distanceTo(b);
    const result = mesh(createOrganicBranch(length, radius), material, parent);
    result.position.copy(a).add(b).multiplyScalar(.5);
    result.quaternion.setFromUnitVectors(up, b.clone().sub(a).normalize());
    return result;
  }
  function target(object: THREE.Object3D, kind: WorldInteraction) {
    const label = kind === 'radio' ? 'Radio' : kind === 'chime' ? 'Shell chime' : 'Tropical leaves';
    object.name = label; object.userData.label = label;
    object.userData.interaction = kind; targets.push(object); return object;
  }
  // Deterministic detail placement keeps reloads stable and avoids frame-time randomness.
  let seed = 173;
  function random() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }

  function instance(instances: THREE.InstancedMesh, index: number, position: THREE.Vector3, rotation: THREE.Euler, scale: THREE.Vector3, tint?: THREE.Color) {
    dummy.position.copy(position); dummy.rotation.copy(rotation); dummy.scale.copy(scale); dummy.updateMatrix(); instances.setMatrixAt(index, dummy.matrix);
    if (tint) instances.setColorAt(index, tint);
  }

  // The distant environment, deck and overhead canopy are photographic.
  // Keep only actual interactive props and the branch supporting the character;
  // opaque proxy timber, rails and trees would mask that more natural setting.
  const perchAssembly = new THREE.Group();
  perchAssembly.name = 'SpeckyG supporting perch'; group.add(perchAssembly);
  const perch = branch(new THREE.Vector3(-2.55, .60, .22), new THREE.Vector3(2.45, .85, -.65), .15, perchBark, perchAssembly);
  perch.castShadow = true; perch.receiveShadow = true;
  branch(new THREE.Vector3(-1.85, -.15, -.14), new THREE.Vector3(-1.62, .65, .06), .075, perchBark, perchAssembly);
  branch(new THREE.Vector3(1.85, -.15, -.14), new THREE.Vector3(1.61, .81, -.50), .075, perchBark, perchAssembly);

  // A small wooden radio with physical tuner, speaker grille and an animated rhythm display.
  const radio = new THREE.Group(); radio.name = 'Radio'; radio.userData.label = 'Radio'; radio.position.set(-3, 0, .5); radio.scale.setScalar(.5); radio.rotation.y = .14; group.add(radio);
  const radioBody = mesh(new RoundedBoxGeometry(.94, .63, .43, 3, .045), woodDark, radio); radioBody.castShadow = true; target(radioBody, 'radio');
  box(0, 0, .225, .84, .52, .025, woodLight, radio);
  const speaker = mesh(new THREE.CylinderGeometry(.187, .187, .024, 24), black, radio); speaker.rotation.x = Math.PI / 2; speaker.position.set(-.18, -.04, .25); target(speaker, 'radio');
  const grille = new THREE.InstancedMesh(sphereGeometry, gold, 18);
  for (let i = 0; i < 18; i++) { const angle = i / 18 * 6.28; instance(grille, i, new THREE.Vector3(-.18 + Math.cos(angle) * .145, -.04 + Math.sin(angle) * .145, .268), new THREE.Euler(), new THREE.Vector3(.008, .008, .008)); }
  radio.add(grille);
  box(.18, .14, .255, .31, .1, .02, cream, radio);
  const tuner = box(.16, .14, .272, .015, .07, .012, red, radio);
  const dial = mesh(new THREE.CylinderGeometry(.071, .071, .045, 16), gold, radio); dial.rotation.x = Math.PI / 2; dial.position.set(.22, -.10, .27); target(dial, 'radio');
  box(0, .385, 0, .46, .06, .07, woodDark, radio); box(-.25, .34, 0, .04, .13, .06, woodDark, radio); box(.25, .34, 0, .04, .13, .06, woodDark, radio);
  branch(new THREE.Vector3(.34, .3, -.1), new THREE.Vector3(.58, 1.06, -.1), .008, gold, radio);
  const music = new THREE.Group(); music.visible = false; radio.add(music);
  for (let i = 0; i < 3; i++) {
    const note = new THREE.Group(); note.position.set(-.2 + i * .3, .7 + i * .24, .38); note.rotation.z = (i - 1) * .25; music.add(note);
    ball(0, 0, 0, .055, .035, .025, gold, note); box(.044, .09, 0, .017, .18, .025, gold, note); box(.09, .17, 0, .09, .035, .025, gold, note);
  }

  // Real shell wind chimes hang outside the avatar's body silhouette.
  const chime = new THREE.Group(); chime.name = 'Shell chime'; chime.userData.label = 'Shell chime'; chime.position.set(3.5, 5.6, .02); chime.scale.setScalar(.5); group.add(chime);
  branch(new THREE.Vector3(0, 3.5, 0), new THREE.Vector3(0, .08, 0), .009, woodDark, chime);
  const chimeRing = mesh(new THREE.TorusGeometry(.29, .024, 5, 18), woodLight, chime); chimeRing.rotation.x = Math.PI / 2; target(chimeRing, 'chime');
  const chimeShells: THREE.Group[] = [];
  for (let i = 0; i < 5; i++) {
    const a = i / 5 * Math.PI * 2, length = .43 + (i % 3) * .16;
    const hanger = new THREE.Group(); hanger.position.set(Math.cos(a) * .23, 0, Math.sin(a) * .23); chime.add(hanger); chimeShells.push(hanger);
    branch(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -length, 0), .005, woodDark, hanger);
    const shell = ball(0, -length, 0, .11, .145, .038, i % 2 ? gold : cream, hanger); shell.rotation.z = (i - 2) * .13; target(shell, 'chime');
  }

  const rainGeometry = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(260 * 3);
  for (let i = 0; i < 260; i++) { rainPositions[i * 3] = (random() - .5) * 14; rainPositions[i * 3 + 1] = random() * 11; rainPositions[i * 3 + 2] = -5 + random() * 6; }
  rainGeometry.setAttribute('position', new THREE.BufferAttribute(rainPositions, 3));
  const rainMaterial = new THREE.PointsMaterial({ color: 0xc5ebef, size: .025, transparent: true, opacity: .5, depthWrite: false });
  const rain = new THREE.Points(rainGeometry, rainMaterial); rain.visible = false; group.add(rain);
  // Bake static timber and planting stems by material. Dynamic props and raycast
  // targets retain their identities; this trims draw calls without flattening the world.
  group.updateMatrixWorld(true);
  const dynamicRoots: THREE.Object3D[] = [music, chime, radio, perchAssembly, living.group];
  const batches = new Map<THREE.Material, THREE.Mesh[]>();
  group.traverse(object => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || targets.includes(object) || Array.isArray(object.material)) return;
    let current: THREE.Object3D | null = object;
    while (current && current !== group) { if (dynamicRoots.includes(current)) return; current = current.parent; }
    const batch = batches.get(object.material) || []; batch.push(object); batches.set(object.material, batch);
  });
  for (const [material, objects] of batches) {
    if (objects.length < 2) continue;
    const parts = objects.map(object => object.geometry.clone().applyMatrix4(object.matrixWorld));
    const merged = mergeGeometries(parts, false);
    parts.forEach(part => part.dispose());
    if (!merged) continue;
    const baked = mesh(merged, material);
    baked.name = 'Static verandah details';
    baked.castShadow = objects.some(object => object.castShadow);
    baked.receiveShadow = objects.some(object => object.receiveShadow);
    objects.forEach(object => object.removeFromParent());
  }
  let chimeEnergy = 0, radioTime = 0, wet = false;
  return {
    group,
    targets,
    update(dt, elapsed, reducedMotion) {
      living.update(dt, elapsed, reducedMotion);
      chimeEnergy = Math.max(0, chimeEnergy - dt * .8); radioTime = Math.max(0, radioTime - dt);
      music.visible = radioTime > 0;
      if (!reducedMotion) {
        chimeShells.forEach((shell, i) => { shell.rotation.z = Math.sin(elapsed * 3.2 + i) * (.025 + chimeEnergy * .2); shell.rotation.x = Math.cos(elapsed * 2.7 + i * .7) * (.015 + chimeEnergy * .09); });
        music.children.forEach((note, i) => { note.position.y = .7 + i * .24 + Math.sin(elapsed * 2.7 + i) * .06; note.rotation.z = Math.sin(elapsed * 2.5 + i) * .16; });
        if (wet) { const positions = rainGeometry.getAttribute('position') as THREE.BufferAttribute; for (let i = 0; i < positions.count; i++) { const y = positions.getY(i) - dt * 4.6; positions.setY(i, y < -2 ? 9 : y); } positions.needsUpdate = true; }
      } else {
        chimeShells.forEach(shell => shell.rotation.set(0, 0, 0));
      }
      tuner.position.x = radioTime > 0 && !reducedMotion ? .16 + Math.sin(elapsed * .8) * .08 : .16;
    },
    interact(kind) {
      if (kind === 'leaves') living.breeze();
      if (kind === 'chime') chimeEnergy = 1;
      if (kind === 'radio') radioTime = radioTime > 0 ? 0 : 6;
    },
    setAtmosphere(night, raining) {
      living.setAtmosphere(night, raining);
      wet = raining; rain.visible = raining;
      for (const entry of materials) entry.material.color.setHex(night ? entry.night : entry.day);
      for (const material of [wood, woodLight, perchBark]) material.roughness = raining ? .62 : .86;
      rainMaterial.opacity = night ? .3 : .5;
    },
    setPortrait(portrait) {
      living.setPortrait(portrait);
      perchAssembly.position.x = 0;
      radio.position.set(portrait ? -1.2 : -3, 0, portrait ? .6 : .5);
      radio.scale.setScalar(.5);
      chime.position.set(portrait ? 1.8 : 3.5, portrait ? 5.7 : 5.6, .02);
      chime.scale.setScalar(.5);
    },
  };
}
