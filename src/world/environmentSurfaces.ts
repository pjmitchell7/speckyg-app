import * as THREE from 'three';

// Source-authored, deterministic surface maps. No DOM, downloaded textures or
// shared Texture ownership: every world owns and can dispose its own resources.
export function createEnvironmentSurface(kind: 'wood' | 'bark' | 'leaf') {
  const size = 256;
  const color = new Uint8Array(size * size * 4);
  const relief = new Uint8Array(size * size * 4);
  const fract = (v: number) => v - Math.floor(v);
  const hash = (x: number, y: number) => fract(Math.sin(x * 127.1 + y * 311.7) * 43758.5453);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const u = x / size, v = y / size, noise = hash(x, y);
    let value: number, height: number;
    if (kind === 'leaf') {
      const across = Math.abs(u - .5) * 2;
      const ribs = Math.exp(-Math.pow(Math.sin((v * 13 - across * 3.5) * Math.PI) * 11, 2));
      const midrib = Math.exp(-Math.pow((u - .5) * 105, 2));
      value = .74 + (1 - across) * .12 + ribs * .09 + midrib * .16 + noise * .045;
      height = .43 + ribs * .13 + midrib * .35 + noise * .04;
    } else {
      const warp = Math.sin(v * 12.57) * .7 + Math.sin(v * 31.4) * .19;
      const grain = Math.sin(u * (kind === 'bark' ? 154 : 225) + warp);
      const fine = Math.sin(u * 895 + Math.sin(v * 16) * 1.7);
      const split = Math.pow(Math.max(0, Math.sin(u * 102 + warp * 1.3)), 26);
      value = .75 + grain * .09 + fine * .035 + noise * .07 - split * .22;
      height = .54 + grain * .13 + fine * .055 - split * .30 + noise * .045;
    }
    const i = (y * size + x) * 4;
    color[i] = Math.min(255, value * 255);
    color[i + 1] = Math.min(255, value * (kind === 'leaf' ? 255 : 244));
    color[i + 2] = Math.min(255, value * (kind === 'leaf' ? 238 : 222));
    color[i + 3] = 255;
    relief[i] = relief[i + 1] = relief[i + 2] = Math.max(0, Math.min(255, height * 255)); relief[i + 3] = 255;
  }
  function texture(data: Uint8Array, srgb: boolean) {
    const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
    map.wrapS = map.wrapT = THREE.RepeatWrapping;
    map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
    map.generateMipmaps = true; map.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    map.needsUpdate = true; return map;
  }
  return { map: texture(color, true), bumpMap: texture(relief, false) };
}

export function createOrganicLeaf(round = false) {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  const rows = 12, columns = 4;
  for (let row = 0; row <= rows; row++) {
    const t = row / rows;
    // Unequal shoulders, curled edges and an off-centre tip avoid a fan of
    // perfectly straight flat triangles. Leaflets are deliberately narrow.
    const width = Math.sin(Math.PI * t) ** (round ? .58 : .90) * (round ? .38 : .072);
    const spine = Math.sin(t * 2.7) * (round ? .035 : .015);
    for (let column = 0; column <= columns; column++) {
      const s = column / columns * 2 - 1;
      const edge = Math.abs(s);
      vertices.push(spine + s * width * (1 + s * .07), t,
        t * t * .24 + Math.sin(t * Math.PI) * .045 - edge * edge * width * .38 + Math.sin(t * 19 + s) * edge * .009);
      uv.push(column / columns, t);
      if (row < rows && column < columns) {
        const i = row * (columns + 1) + column;
        indices.push(i, i + columns + 1, i + 1, i + 1, i + columns + 1, i + columns + 2);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}

export function createOrganicBranch(length: number, radius: number) {
  const vertices: number[] = [], uv: number[] = [], indices: number[] = [];
  const rings = 16, sides = 14;
  for (let ring = 0; ring <= rings; ring++) {
    const t = ring / rings;
    for (let side = 0; side <= sides; side++) {
      const a = side / sides * Math.PI * 2;
      const knot = Math.exp(-Math.pow((t - .28) * 13, 2)) * Math.exp(-Math.pow((a - 1.8) * 1.5, 2));
      const r = radius * (1.10 - t * .20) * (1 + Math.sin(a * 5 + t * 7) * .075 + Math.cos(a * 3 - t * 4) * .045 + knot * .27 + Math.sin(t * 21) * .045);
      vertices.push(Math.cos(a) * r + Math.sin(t * 5) * radius * .23, (t - .5) * length, Math.sin(a) * r + Math.sin(t * 7) * radius * .1);
      uv.push(side / sides * 2, t * Math.max(1, length * 1.2));
      if (ring < rings && side < sides) { const i = ring * (sides + 1) + side; indices.push(i, i + sides + 1, i + 1, i + 1, i + sides + 1, i + sides + 2); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
}
