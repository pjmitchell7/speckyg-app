import { assetUrl } from '../lib/assetUrl';
import * as THREE from 'three';
import { createOrganicBranch, createEnvironmentSurface } from './environmentSurfaces';

/** Moving spatial foreground/midground over a photographic depth base.
 * Geometry is real; the distant hills, coast and mature forest in the photo
 * remain flat. No claim of full scene reconstruction or physical ocean simulation.
 */
export function createLivingEnvironment() {
  const group = new THREE.Group(); group.name = 'Living coastal environment';
  const targets: THREE.Object3D[] = [];
  const leafSurface = createEnvironmentSurface('leaf');
  const leafMaterial = new THREE.MeshStandardMaterial({ color: 0x77894b, roughness: .88, side: THREE.DoubleSide, ...leafSurface, bumpScale: .014 });
  const barkSurface = createEnvironmentSurface('bark');
  const barkMaterial = new THREE.MeshStandardMaterial({ color: 0x76634b, roughness: .95, ...barkSurface, bumpScale: .04 });
  if (typeof document !== 'undefined') {
    const map = new THREE.TextureLoader().load(assetUrl('assets/environment/branch-bark.jpg'));
    map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
    barkMaterial.map = map; barkMaterial.color.setHex(0xc1b99f);
    const leafPhoto = new THREE.TextureLoader().load(assetUrl('assets/environment/sea-grape-leaf.png'));
    leafPhoto.colorSpace = THREE.SRGBColorSpace; leafPhoto.anisotropy = 4;
    leafMaterial.map = leafPhoto; leafMaterial.alphaTest = .35;
    leafMaterial.color.setHex(0xffffff);
  }
  // Let the photographic alpha define the rounded botanical outline. Mapping
  // this image onto a tapered blade compressed both shoulders into angular tips.
  // This smooth curved grid retains real surface depth without a second outline.
  const leafGeometry = new THREE.PlaneGeometry(.84, 1, 8, 16);
  leafGeometry.translate(0, .5, 0);
  const leafPositions = leafGeometry.getAttribute('position');
  for (let i = 0; i < leafPositions.count; i++) {
    const x = leafPositions.getX(i), y = leafPositions.getY(i);
    leafPositions.setZ(i, y * y * .15 - x * x * .22 + Math.sin(y * 8) * Math.abs(x) * .014);
  }
  leafGeometry.computeVertexNormals();
  const dummy = new THREE.Object3D();
  const clusters: { root: THREE.Group; side: number; level: number; phase: number }[] = [];
  let seed = 1937;
  const random = () => { seed = seed * 16807 % 2147483647; return seed / 2147483647; };
  for (const side of [-1, 1]) for (let level = 0; level < 3; level++) {
    const root = new THREE.Group(); root.name = 'Swaying sea-grape branch'; group.add(root);
    const stem = new THREE.Mesh(createOrganicBranch(.92, .018), barkMaterial);
    stem.position.y = .35; stem.rotation.z = side * -.27; root.add(stem);
    const leaves = new THREE.InstancedMesh(leafGeometry, leafMaterial, 7);
    leaves.name = 'Living leaves'; leaves.userData.interaction = 'leaves'; leaves.userData.label = 'Sea-grape leaves'; targets.push(leaves);
    for (let i = 0; i < 7; i++) {
      const alternating = i % 2 ? -1 : 1;
      dummy.position.set(alternating * .07, i * .105, (random() - .5) * .14);
      dummy.rotation.set(.45 + random() * .5, alternating * .6, alternating * (.7 + random() * .3));
      dummy.scale.set(.7 + random() * .25, .55 + random() * .23, .7);
      dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix);
      leaves.setColorAt(i, new THREE.Color().setHSL(.23 + random() * .055, .13 + random() * .15, .62 + random() * .3));
    }
    root.add(leaves); clusters.push({ root, side, level, phase: random() * 6.28 });
  }

  // A transparent, spatial ocean surface adds flowing capillary highlights to
  // the open water portion of the image without painting over the headland.
  const waterMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, strength: { value: .44 }, tint: { value: new THREE.Color('#ffe3a0') } },
    vertexShader: `varying vec2 vUv; uniform float time; void main(){vUv=uv;vec3 p=position;p.z+=sin(p.x*1.3+time*.8)*.025+cos(p.y*1.8-time*.6)*.018;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader: `varying vec2 vUv; uniform float time; uniform float strength; uniform vec3 tint;
      void main(){vec2 p=vUv;float edge=smoothstep(0.,.12,p.x)*(1.-smoothstep(.84,1.,p.x))*smoothstep(0.,.2,p.y)*(1.-smoothstep(.8,1.,p.y));
      float drift=sin(p.x*31.+time*.36)*.12+sin(p.x*73.-time*.52)*.035;
      float wave=pow(max(0.,sin(p.y*230.+drift*10.-time*1.8)),16.);
      float broken=smoothstep(.22,.83,sin(p.x*117.+sin(p.y*31.+time*.21)*3.+time*.4)*.5+.5);
      float patches=.35+.65*pow(max(0.,sin(p.x*8.+p.y*7.-time*.1)),2.);
      gl_FragColor=vec4(tint,edge*wave*broken*patches*strength);}` });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(16, 13, 35, 28), waterMaterial);
  water.name = 'Moving cove water highlights'; water.rotation.x = -Math.PI / 2; water.position.set(-7.5, -.85, -12); group.add(water);

  // Thin, soft volumetric-looking wisps, drawn on real drifting spatial planes.
  // These are transparent atmosphere cards, not a volumetric cloud simulation.
  const cloudMaterial = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, opacity: { value: .11 }, tint: { value: new THREE.Color('#fff2d9') } },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `varying vec2 vUv;uniform float time;uniform float opacity;uniform vec3 tint;
    float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
    float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x),f.y);}
    void main(){vec2 p=vUv*vec2(5.,3.);float f=n(p)+.5*n(p*2.1+time*.009)+.25*n(p*4.2);float edge=pow(max(0.,1.-length((vUv-.5)*vec2(2.,2.4))),1.4);gl_FragColor=vec4(tint,smoothstep(.63,1.2,f)*edge*opacity);}` });
  const clouds: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const cloud = new THREE.Mesh(new THREE.PlaneGeometry(8 + i * 2, 2), cloudMaterial);
    cloud.name = 'Drifting sky wisp'; cloud.position.set(-8 + i * 7, 6.4 + i * .4, -17 - i * 2); group.add(cloud); clouds.push(cloud);
  }

  // Small coastal birds: independent curved wings flap in depth, away from the
  // character's facial region. Their path periodically crosses the open sky.
  const birdMaterial = new THREE.MeshStandardMaterial({ color: 0x5c5144, roughness: 1, side: THREE.DoubleSide });
  const wingGeometry = new THREE.BufferGeometry();
  wingGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0,0,0, .18,.015,-.025, .37,-.045,-.09, .22,-.015,.04],3));
  wingGeometry.setIndex([0,1,3,1,2,3]); wingGeometry.computeVertexNormals();
  const birds: { root: THREE.Group; left: THREE.Mesh; right: THREE.Mesh }[] = [];
  for (let i = 0; i < 4; i++) {
    const root = new THREE.Group(); root.name = 'Coastal bird';
    const left = new THREE.Mesh(wingGeometry, birdMaterial), right = new THREE.Mesh(wingGeometry, birdMaterial);
    left.scale.x = -1; root.add(left, right); root.scale.setScalar(.55 + i * .07); group.add(root); birds.push({ root, left, right });
  }

  // The former plain gold butterflies were removed after rendered review:
  // their flat decorative appearance broke the photographic environment.

  let windImpulse = 0, localTime = 0, portrait = false;
  function layout() {
    for (const { root, side, level } of clusters) {
      root.position.set(side * ((portrait ? 1.70 : 3.25) + level * .38), (level === 0 ? 4.16 : 4.5 + level * .37), -.2 - level * .5);
      root.rotation.z = side * (.55 + level * .19);
      root.scale.setScalar(portrait ? .87 : 1.1);
    }
  }
  layout();
  return { group, targets,
    setPortrait(value: boolean) { portrait = value; layout(); },
    setAtmosphere(night: boolean, rain: boolean) {
      leafMaterial.color.setHex(night ? 0x8296b0 : typeof document !== 'undefined' ? 0xffffff : 0x77894b);
      birdMaterial.color.setHex(night ? 0x383f4c : 0x5c5144);
      waterMaterial.uniforms.tint.value.set(night ? '#a3c4ea' : rain ? '#cde0df' : '#ffe3a0');
      waterMaterial.uniforms.strength.value = night ? .22 : rain ? .25 : .44;
      cloudMaterial.uniforms.opacity.value = night ? .06 : rain ? .18 : .11;
    },
    breeze() { windImpulse = 1; },
    update(dt: number, _elapsed: number, reduced: boolean) {
      if (!reduced) localTime += dt;
      windImpulse = Math.max(0, windImpulse - dt * .28);
      const t = reduced ? 0 : localTime;
      for (const { root, side, level, phase } of clusters) {
        root.rotation.z = side * (.55 + level * .19) + (reduced ? 0 : Math.sin(t * .72 + phase) * (.11 + windImpulse * .11) + Math.sin(t * 1.7 + phase) * .017);
        root.rotation.x = reduced ? 0 : Math.sin(t * .58 + phase) * .12;
      }
      waterMaterial.uniforms.time.value = t; cloudMaterial.uniforms.time.value = t;
      clouds.forEach((cloud, i) => cloud.position.x = -8 + i * 7 + Math.sin(t * .014 + i) * 2.5);
      birds.forEach(({ root, left, right }, i) => {
        const angle = t * .052 + i * .08;
        root.position.set(Math.sin(angle) * 12 - 2, 5.4 + Math.sin(angle * 2 + i) * .25 + i * .22, -12 - i * .8);
        root.rotation.y = .15; root.rotation.z = Math.cos(angle) * .06;
        left.rotation.z = Math.sin(t * 5.3 + i * .7) * .46;
        right.rotation.z = -left.rotation.z;
      });
      group.userData.motionTime = t;
      group.userData.motionLayers = ['swaying spatial foliage', 'moving water surface highlights', 'drifting cloud cards', 'flapping coastal birds'];
    },
  };
}
