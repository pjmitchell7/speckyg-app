import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { createReferenceMesh } from './referenceMesh';
import { createIslandWorld } from './island';
import type { CharacterReaction, WorldInteraction } from './types';
import type { CharacterState, Mood } from '../../shared/types';
import {addCharacterEnvironment} from './characterLighting';
import {GestureDirector, type PerformanceGesture} from './gestureDirector';

export interface SceneAction { kind: WorldInteraction | CharacterReaction | PerformanceGesture; id: number }
interface Props {
  state: CharacterState; mood: Mood; amplitude: number; reducedMotion: boolean;
  night: boolean; rain: boolean; action: SceneAction | null;
  replyId?: string; replyText?: string; speechCharIndex?: number|null;
  speechStartedAt?: number|null; speechBoundaryAt?: number|null; speechPlaybackId?: number|null;
  onInteract: (kind: SceneAction['kind']) => void;
}

export function IslandScene(props: Props) {
  const host = useRef<HTMLDivElement>(null);
  const current = useRef(props); current.current = props;
  const actionHandler = useRef<(action:SceneAction) => void>(() => {});
  const [failed, setFailed] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [modelError, setModelError] = useState(false);

  useEffect(() => { if (props.action) actionHandler.current(props.action); }, [props.action]);

  useEffect(() => {
    const node = host.current;
    if (!node) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({antialias:true, alpha:true, powerPreference:'high-performance'});
    } catch { setFailed(true); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.02;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label','Interactive 3D SpeckyG island world');
    renderer.domElement.setAttribute('role','img');
    node.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const disposeEnvironment=addCharacterEnvironment(renderer,scene);
    scene.background = null;
    renderer.setClearColor(0x000000,0);
    scene.fog = new THREE.Fog('#a6ddca', 16, 47);
    const camera = new THREE.PerspectiveCamera(43, 1, .1, 100);
    const hemisphere = new THREE.HemisphereLight('#e8f1e6','#3c5948',.85);
    scene.add(hemisphere);
    const sun = new THREE.DirectionalLight('#fff0d8',3);
    sun.position.set(-3,8,5); sun.castShadow=true;
    sun.shadow.mapSize.set(1024,1024);
    Object.assign(sun.shadow.camera,{left:-7,right:7,top:7,bottom:-5,near:.5,far:25});
    sun.shadow.bias=-.001; sun.shadow.normalBias=.025;
    sun.target.position.set(0,1,0); scene.add(sun, sun.target);
    const fill = new THREE.DirectionalLight('#a9efff',.6); fill.position.set(5,3,-4); scene.add(fill);
    const rim=new THREE.DirectionalLight('#fff0cf',.9);rim.position.set(2,5,-4);scene.add(rim);
    const world = createIslandWorld(); scene.add(world.group);
    let mounted=true;
    const avatar = createReferenceMesh(); avatar.group.position.y=.55; scene.add(avatar.group);
    const director = new GestureDirector();
    node.dataset.characterModelReady='false';
    void avatar.readyPromise.then(()=>{if(mounted){node.dataset.characterModelReady='true';node.dataset.characterTriangles=String(avatar.group.userData.triangles);node.dataset.characterRigged=String(!!avatar.group.userData.deformationRig);setModelReady(true);}}).catch(()=>{if(mounted){node.dataset.characterModelReady='false';setModelError(true);}});
    let portrait=false, cameraHomeZ=8, cameraFocusY=2.3;
    function resize() {
      const width=node!.clientWidth, height=node!.clientHeight;
      if (!width || !height) return;
      portrait=width<760;
      camera.aspect=width/height;
      if (portrait) {
        cameraHomeZ=7.2; cameraFocusY=2.1;
        camera.fov=48; camera.position.set(0,2.9,7.2); camera.lookAt(0,2.1,0);
        avatar.group.position.x=0;
      } else {
        cameraHomeZ=8; cameraFocusY=2.3;
        camera.fov=42; camera.position.set(0,3.1,8); camera.lookAt(0,2.3,0);
        avatar.group.position.x=0;
      }
      camera.updateProjectionMatrix();
      const anchor=new THREE.Vector3(0,.88,-.18).project(camera);
      node!.closest<HTMLElement>('.island-app')?.style.setProperty('--perch-y',`${(1-anchor.y)*height/2+12}px`);
      world.setPortrait?.(portrait);
      renderer.setSize(width,height,false);
    }
    const observer=new ResizeObserver(resize); observer.observe(node); resize();
    const raycaster=new THREE.Raycaster(), pointer=new THREE.Vector2();
    function hit(event:PointerEvent) {
      const rect=renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX-rect.left)/rect.width)*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
      raycaster.setFromCamera(pointer,camera);
      const intersections=raycaster.intersectObjects([avatar.group,...world.targets],true);
      for(const intersection of intersections) {
        let object:THREE.Object3D|null=intersection.object;
        while(object) {
          if(object.userData.interaction) return String(object.userData.interaction);
          object=object.parent;
        }
      }
      return null;
    }
    function onPointerMove(event:PointerEvent) {
      renderer.domElement.style.cursor=hit(event)?'pointer':'default';
      avatar.group.userData.gazeX=pointer.x*.45;
      avatar.group.userData.gazeY=pointer.y*.35;
    }
    function onPointerLeave() { avatar.group.userData.gazeX=0; avatar.group.userData.gazeY=0; }
    function onPointerDown(event:PointerEvent) {
      const interaction=hit(event);
      if(interaction==='radio'||interaction==='chime'||interaction==='leaves') current.current.onInteract(interaction);
      else if(interaction==='head'||interaction==='wing'||interaction==='specky') current.current.onInteract(interaction==='wing'?'wing':'head');
    }
    renderer.domElement.addEventListener('pointermove',onPointerMove);
    renderer.domElement.addEventListener('pointerleave',onPointerLeave);
    renderer.domElement.addEventListener('pointerdown',onPointerDown);
    actionHandler.current = action => {
      node!.dataset.interaction=action.kind;
      node!.dataset.interactionId=String(action.id);
      if(action.kind==='radio'||action.kind==='chime'||action.kind==='leaves') {
        world.interact(action.kind);
        if(action.kind==='radio') avatar.react('dance');
      } else if(action.kind==='point'||action.kind==='stretch'||action.kind==='crossed') director.trigger(action.kind);
      else if(action.kind==='wing') director.trigger('stretch');
      else if(action.kind!=='rest') avatar.react(action.kind);
    };
    let lastTime=performance.now(),elapsed=0,lastStats=0,previousNight:boolean|undefined,previousRain:boolean|undefined,lastPoseStats=0;
    function frame(now:number) {
      const p=current.current;
      avatar.group.visible=true;
      node!.dataset.characterPresentation='animated-3d';
      const frameSeconds=Math.max(0,(now-lastTime)/1000);
      const dt=Math.min(frameSeconds,.05); lastTime=now; elapsed+=dt;
      if(p.night!==previousNight || p.rain!==previousRain) {
        world.setAtmosphere(p.night,p.rain);
        hemisphere.intensity=p.night?.55:p.rain?.8:.85;
        hemisphere.color.set(p.night?'#a6c8ff':'#fff4d6');
        sun.color.set(p.night?'#b7cfff':'#ffe1ab');
        sun.intensity=p.night?1.15:p.rain?1.8:3;
        scene.environmentIntensity=p.night?.3:.48;
        scene.fog!.color.set(p.night?'#364c76':p.rain?'#91bcb7':'#a6ddca');
        node!.dataset.theme=p.night?'blue-hour':'sunshine';node!.dataset.rain=String(p.rain);
        previousNight=p.night;previousRain=p.rain;
      }
      const speechNow=performance.now();
      const gesture=director.update(frameSeconds,{state:p.state,mood:p.mood,replyId:p.replyId,text:p.replyText,charIndex:p.speechCharIndex,
        playbackId:p.speechPlaybackId??undefined,
        speechAge:p.speechStartedAt==null?null:Math.max(0,(speechNow-p.speechStartedAt)/1000),
        boundaryAge:p.speechBoundaryAt==null?null:Math.max(0,(speechNow-p.speechBoundaryAt)/1000),
        reducedMotion:p.reducedMotion});
      avatar.setGesture(gesture.kind,gesture.amount);
      avatar.update(dt,elapsed,p.state,p.mood,p.amplitude,p.reducedMotion);
      world.update(dt,elapsed,p.reducedMotion);
      // Give a real two-wing stretch breathing room on narrow screens. Fit the
      // articulated hand endpoints, rather than shrinking the character mesh.
      let framingZ=cameraHomeZ;
      const wingPose=avatar.group.userData.deformation?.wings;
      if(portrait&&gesture.kind==='stretch'&&wingPose){
        const horizontal=Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.86;
        for(const reach of [wingPose.leftWorldReach,wingPose.rightWorldReach]){
          if(Array.isArray(reach)&&reach.length===3&&reach.every(Number.isFinite)) framingZ=Math.max(framingZ,reach[2]+(Math.abs(reach[0])+.42)/horizontal);
        }
      }
      camera.position.z=p.reducedMotion?cameraHomeZ:THREE.MathUtils.lerp(camera.position.z,framingZ,1-Math.exp(-frameSeconds*8));
      camera.lookAt(0,cameraFocusY,0);
      const pose=avatar.group.userData.deformation?.pose;
      if(now-lastPoseStats>100&&pose){
        node!.dataset.characterState=p.state;
        node!.dataset.characterJaw=String(pose.jaw);
        node!.dataset.characterWing=String(pose.wing);
        node!.dataset.characterBlink=String(pose.blink);
        node!.dataset.characterDisplacement=String(avatar.group.userData.deformation.maxDisplacement);
        node!.dataset.characterGesture=gesture.kind;
        node!.dataset.characterGestureAmount=String(gesture.amount);
        node!.dataset.characterGestureSource=gesture.source;
        node!.dataset.cameraDistance=String(camera.position.z);
        lastPoseStats=now;
      }
      renderer.render(scene,camera);
      if(now-lastStats>1000) {
        node!.dataset.drawCalls=String(renderer.info.render.calls);
        node!.dataset.triangles=String(renderer.info.render.triangles);
        lastStats=now;
      }
    }
    function visibility() {
      renderer.setAnimationLoop(null);
      if(document.visibilityState!=='hidden') {lastTime=performance.now();renderer.setAnimationLoop(frame);}
    }
    const lost=(event:Event) => {event.preventDefault();renderer.setAnimationLoop(null);setFailed(true);};
    renderer.domElement.addEventListener('webglcontextlost',lost);
    document.addEventListener('visibilitychange',visibility);
    renderer.setAnimationLoop(frame);
    node.dataset.worldReady='true';
    return () => {
      mounted=false;avatar.dispose();
      actionHandler.current=()=>{};
      observer.disconnect();renderer.setAnimationLoop(null);
      disposeEnvironment();
      document.removeEventListener('visibilitychange',visibility);
      renderer.domElement.removeEventListener('pointermove',onPointerMove);
      renderer.domElement.removeEventListener('pointerleave',onPointerLeave);
      renderer.domElement.removeEventListener('pointerdown',onPointerDown);
      renderer.domElement.removeEventListener('webglcontextlost',lost);
      const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();
      scene.traverse(object=>{
        const mesh=object as THREE.Mesh;
        if(mesh.geometry) geometries.add(mesh.geometry);
        if(mesh.material) for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material]) {
          materials.add(mat);
          for(const value of Object.values(mat)) if(value instanceof THREE.Texture)textures.add(value);
        }
      });
      geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());
      sun.shadow.dispose();
      renderer.dispose();renderer.domElement.remove();delete node.dataset.worldReady;
    };
  },[]);

  return <div ref={host} className="island-canvas" data-world-ready="false">
    {!failed&&(!modelReady||modelError)&&<p className="model-load-status" role="status">{modelError?'Specky’s 3D model could not load. Reload to try again; voice is still available.':'Loading the 3D reconstruction…'}</p>}
    {failed && <div className="world-fallback"><p>The 3D world needs WebGL 2. Try a current browser; voice is still available.</p></div>}
  </div>;
}
