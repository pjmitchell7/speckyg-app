import * as THREE from 'three';

export interface FeatherGroomOptions {
  radii: [number, number, number];
  count?: number;
  length?: number;
  width?: number;
  color?: THREE.ColorRepresentation;
  rootColor?: THREE.ColorRepresentation;
  tipColor?: THREE.ColorRepresentation;
  seed?: number;
  flow?: THREE.Vector3 | [number, number, number];
  exclude?: (point: THREE.Vector3, normal: THREE.Vector3) => boolean;
  density?: (point: THREE.Vector3, normal: THREE.Vector3) => number;
  interaction?: string;
}

let grainColors: Uint8Array | undefined;
let grainHeights: Uint8Array | undefined;

/** Source-authored vane/shaft microstructure. Works without document or canvas. */
function featherGrain() {
  const width = 128, height = 256;
  const colors = grainColors ?? new Uint8Array(width * height * 4);
  const heights = grainHeights ?? new Uint8Array(width * height * 4);
  let seed = 8191;
  const random = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  if (!grainColors) for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = x / (width - 1) * 2 - 1, v = y / (height - 1);
    const shaft = Math.exp(-u * u * 1900);
    const barb = Math.pow(Math.max(0, Math.sin((v * 89 + Math.abs(u) * 24) * Math.PI)), 13);
    const fine = random() - .5;
    const value = .95 - shaft * .065 - barb * .045 + fine * .055;
    const bump = Math.min(1, .36 + shaft * .35 + barb * .16 + fine * .12);
    const offset = (y * width + x) * 4;
    // Nearly neutral modulation lets caller-owned warm yellow/green remain faithful.
    colors[offset] = Math.min(255, Math.round(value * 255));
    colors[offset + 1] = Math.min(255, Math.round(value * 253));
    colors[offset + 2] = Math.min(255, Math.round(value * 248));
    colors[offset + 3] = 255;
    heights[offset] = heights[offset + 1] = heights[offset + 2] = Math.round(bump * 255);
    heights[offset + 3] = 255;
  }
  grainColors = colors; grainHeights = heights;
  // Cache immutable source bytes, never GPU textures. Separate avatar lifecycles
  // can dispose their maps without invalidating another renderer or StrictMode mount.
  const grainTexture = new THREE.DataTexture(colors, width, height, THREE.RGBAFormat);
  grainTexture.colorSpace = THREE.SRGBColorSpace;
  const grainBump = new THREE.DataTexture(heights, width, height, THREE.RGBAFormat);
  for (const texture of [grainTexture, grainBump]) {
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
  }
  return { map: grainTexture, bumpMap: grainBump };
}

/** Also usable on the smooth, feather-covered volumes beneath the groom. */
export function createFeatherMaterial(color: THREE.ColorRepresentation = '#ffd044') {
  const { map, bumpMap } = featherGrain();
  map.repeat.set(5, 4); bumpMap.repeat.set(5, 4);
  return new THREE.MeshStandardMaterial({
    color, map, bumpMap, bumpScale: .007,
    roughness: .84, metalness: 0,
  });
}

/**
 * Fine contour feathers follow a local ellipsoid, with down-flowing irregular tips.
 * Two merged meshes hold the whole groom: contour vanes and very fine undercoat.
 * There are no transparent image cards and no object/mesh for each strand.
 */
export function createFeatherGroom(options: FeatherGroomOptions): THREE.Group {
  const group = new THREE.Group(); group.name = 'Surface-following feather groom';
  const radii = new THREE.Vector3(...options.radii);
  const count = Math.max(0, Math.min(12000, Math.floor(options.count ?? 1800)));
  const length = Math.max(.008, options.length ?? .085);
  const width = Math.max(.001, options.width ?? .015);
  const rootColor = new THREE.Color(options.rootColor ?? '#e9b42d');
  const color = new THREE.Color(options.color ?? '#ffd044');
  const tipColor = new THREE.Color(options.tipColor ?? '#ffe25c');
  const flow = options.flow instanceof THREE.Vector3 ? options.flow.clone() : new THREE.Vector3(...(options.flow ?? [0, -1, 0]));
  flow.normalize();
  let seed = Math.max(1, Math.floor(options.seed ?? 2731)) % 2147483647;
  const random = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  const positions: number[] = [], colors: number[] = [], uvs: number[] = [], indices: number[] = [];
  const furPositions: number[] = [], furColors: number[] = [], furUVs: number[] = [], furIndices: number[] = [];
  const point = new THREE.Vector3(), normal = new THREE.Vector3();
  const direction = new THREE.Vector3(), side = new THREE.Vector3(), vertex = new THREE.Vector3(), surfaceNormal = new THREE.Vector3();
  const tint = new THREE.Color();
  let accepted = 0;
  for (let attempt = 0; accepted < count && attempt < count * 8; attempt++) {
    // A jittered low-discrepancy distribution fills gaps without combed rows or
    // the random bald patches that made the first version read as felt/scales.
    const y = THREE.MathUtils.clamp(((attempt * .754877666 + .37) % 1) * 2 - 1 + (random() - .5) * .018, -.9999, .9999);
    const azimuth = ((attempt * .569840291 + .11) % 1) * Math.PI * 2 + (random() - .5) * .06;
    const ring = Math.sqrt(Math.max(0, 1 - y * y));
    point.set(ring * Math.cos(azimuth) * radii.x, y * radii.y, ring * Math.sin(azimuth) * radii.z);
    normal.set(point.x / (radii.x * radii.x), point.y / (radii.y * radii.y), point.z / (radii.z * radii.z)).normalize();
    if (options.exclude?.(point, normal)) continue;
    if (options.density && random() > THREE.MathUtils.clamp(options.density(point, normal), 0, 1)) continue;
    const variation = .80 + random() * .42;
    const featherLength = length * variation * 1.22;
    const featherWidth = width * (.74 + random() * .45) * 1.65;
    const splay = (random() - .5) * .42;
    direction.copy(flow).addScaledVector(normal, -flow.dot(normal));
    if (direction.lengthSq() < .012) direction.set(Math.cos(azimuth), -.15, Math.sin(azimuth)).addScaledVector(normal, -.15);
    direction.normalize();
    side.crossVectors(normal, direction).normalize();
    direction.addScaledVector(side, splay).normalize();
    side.crossVectors(normal, direction).normalize();
    const lift = .002 + random() * featherLength * .025;
    const colorVariation = .94 + random() * .12;
    const offset = positions.length / 3;
    for (let row = 0; row <= 3; row++) {
      const t = row / 3;
      const spread = row === 3 ? .025 : .38 + Math.sin(Math.PI * t) * .62;
      for (let column = -1; column <= 1; column++) {
        const edge = column * featherWidth * spread;
        const ridge = column === 0 ? featherWidth * .21 * Math.sin(t * Math.PI) : 0;
        vertex.copy(point)
          .addScaledVector(direction, featherLength * t)
          .addScaledVector(side, edge);
        // Follow the head's actual curvature, then lift the ridge and irregular
        // pointed tip slightly. Floating tangent planes looked like pasted leaves.
        const radius = Math.sqrt((vertex.x / radii.x) ** 2 + (vertex.y / radii.y) ** 2 + (vertex.z / radii.z) ** 2);
        vertex.divideScalar(radius);
        surfaceNormal.set(vertex.x / radii.x ** 2, vertex.y / radii.y ** 2, vertex.z / radii.z ** 2).normalize();
        vertex.addScaledVector(surfaceNormal, .002 + lift * Math.sin(t * Math.PI * .85) + ridge + t * t * featherLength * .09);
        positions.push(vertex.x, vertex.y, vertex.z);
        tint.copy(t < .4 ? rootColor : color).lerp(t < .4 ? color : tipColor, t < .4 ? t / .4 : (t - .4) / .6 * .42).multiplyScalar(colorVariation);
        colors.push(tint.r, tint.g, tint.b); uvs.push((column + 1) * .5, t);
      }
      if (row < 3) for (let column = 0; column < 2; column++) {
        const base = offset + row * 3 + column;
        indices.push(base, base + 1, base + 3, base + 1, base + 4, base + 3);
      }
    }
    // Tiny lifted down catches the silhouette without a shaggy mammal-fur outline.
    for (let filament = 0; filament < 1; filament++) {
      const furOffset = furPositions.length / 3;
      const furLength = length * (.12 + random() * .14);
      const furWidth = .0006 + random() * .0005;
      const along = (random() - .5) * length * .42;
      const across = (random() - .5) * width * 2.4;
      for (let corner = 0; corner < 3; corner++) {
        const t = corner === 2 ? 1 : 0;
        const edge = corner === 0 ? -furWidth : corner === 1 ? furWidth : 0;
        vertex.copy(point).addScaledVector(direction, along + furLength * t).addScaledVector(normal, .0015 + t * t * furLength * .15).addScaledVector(side, across + edge);
        furPositions.push(vertex.x, vertex.y, vertex.z);
        tint.copy(color).lerp(tipColor, .1 + t * .2).multiplyScalar(colorVariation);
        furColors.push(tint.r, tint.g, tint.b); furUVs.push(corner === 0 ? 0 : corner === 1 ? 1 : .5, t);
      }
      furIndices.push(furOffset, furOffset + 1, furOffset + 2);
    }
    accepted++;
  }
  function makeGeometry(p: number[], c: number[], uv: number[], index: number[]) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(c, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geometry.setIndex(index); geometry.computeVertexNormals(); geometry.computeBoundingSphere(); return geometry;
  }
  const contourGeometry = makeGeometry(positions, colors, uvs, indices);
  // Dense narrow vanes stay soft under studio light; the dark roots show between layers.
  const contourMaterial = createFeatherMaterial('#ffffff'); contourMaterial.map?.repeat.set(1, 1); contourMaterial.bumpMap?.repeat.set(1, 1); contourMaterial.vertexColors = true; contourMaterial.side = THREE.DoubleSide;
  const contour = new THREE.Mesh(contourGeometry, contourMaterial); contour.name = 'Short irregular contour feathers'; contour.userData.interaction = options.interaction ?? 'head'; group.add(contour);
  if (furPositions.length) {
    const furMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', vertexColors: true, roughness: .94, side: THREE.DoubleSide });
    const undercoat = new THREE.Mesh(makeGeometry(furPositions, furColors, furUVs, furIndices), furMaterial); undercoat.name = 'Fine down at feather tips'; undercoat.userData.interaction = options.interaction ?? 'head'; group.add(undercoat);
  }
  group.userData.featherCount = accepted;
  group.userData.triangleCount = indices.length / 3 + furIndices.length / 3;
  group.userData.interaction = options.interaction ?? 'head';
  return group;
}
