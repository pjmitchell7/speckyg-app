import { assetUrl } from '../lib/assetUrl';
import {useEffect,useRef,useState} from 'react';
import * as THREE from 'three';
import {createSpeckyG} from './avatar';
import {createReferenceMesh} from './referenceMesh';
import {addCharacterEnvironment} from './characterLighting';
import './likeness.css';

export default function LikenessLab(){
  const host=useRef<HTMLDivElement>(null);
  const [modelKind,setModelKind]=useState<'reference-mesh'|'procedural-rig'>('reference-mesh');
  const [yaw,setYaw]=useState(0);
  const [pose,setPose]=useState<'neutral'|'greet'|'wing'>('neutral');
  const [failed,setFailed]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);
  const poseRef=useRef(pose);poseRef.current=pose;
  const yawRef=useRef(yaw);yawRef.current=yaw;
  useEffect(()=>{
    const node=host.current;if(!node)return;
    let disposed=false;setFailed(null);setLoading(true);
    node.dataset.modelKind=modelKind;node.dataset.modelReady='false';node.dataset.likenessReady='false';
    let renderer:THREE.WebGLRenderer;
    try{renderer=new THREE.WebGLRenderer({antialias:true,alpha:false});}catch{setFailed('WebGL 2 is required to render this study.');setLoading(false);return;}
    renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=THREE.SRGBColorSpace;
    renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
    renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute('aria-label','Actual 3D character reference comparison');
    node.append(renderer.domElement);
    const scene=new THREE.Scene();scene.background=new THREE.Color('#141b16');
    const disposeEnv=addCharacterEnvironment(renderer,scene);
    const hemi=new THREE.HemisphereLight('#e4f0ff','#38402b',.7);scene.add(hemi);
    const key=new THREE.DirectionalLight('#fff0d8',3.4);key.position.set(-3,6,5);key.castShadow=true;key.shadow.mapSize.set(1024,1024);scene.add(key);
    const rim=new THREE.DirectionalLight('#ffdfab',1.2);rim.position.set(3,5,-4);scene.add(rim);
    const fill=new THREE.DirectionalLight('#d4e8fc',.35);fill.position.set(4,1,4);scene.add(fill);
    const reconstruction=modelKind==='reference-mesh'?createReferenceMesh():null;
    const avatar=reconstruction??createSpeckyG();avatar.group.rotation.y=yawRef.current;scene.add(avatar.group);
    let modelReady=!reconstruction;
    const branch=new THREE.Mesh(new THREE.CylinderGeometry(.15,.18,3,20),new THREE.MeshStandardMaterial({color:'#6b4326',roughness:.93}));branch.rotation.z=Math.PI/2-.035;branch.position.set(0,-.13,.045);branch.castShadow=true;branch.receiveShadow=true;scene.add(branch);
    const floor=new THREE.Mesh(new THREE.CircleGeometry(5,48),new THREE.MeshStandardMaterial({color:'#131a14',roughness:.96}));floor.rotation.x=-Math.PI/2;floor.position.y=-.13;floor.receiveShadow=true;scene.add(floor);
    const camera=new THREE.PerspectiveCamera(33,1,.1,40);
    // Refit the actual rotated bounds, including their depth, when the view
    // changes. A sphere fit leaves too much empty space around this tall actor.
    const bounds=new THREE.Box3(),center=new THREE.Vector3(),size=new THREE.Vector3();
    const fit=()=>{if(!modelReady){camera.position.set(0,1.8,9);camera.lookAt(0,1.8,0);return;}bounds.setFromObject(avatar.group);if(bounds.isEmpty())return;bounds.getCenter(center);bounds.getSize(size);const halfVertical=THREE.MathUtils.degToRad(camera.fov/2),halfHorizontal=Math.atan(Math.tan(halfVertical)*camera.aspect);const distance=(Math.max(size.y/(2*Math.tan(halfVertical)),size.x/(2*Math.tan(halfHorizontal)))+size.z/2)*1.09;camera.position.set(center.x,center.y,center.z+distance);camera.lookAt(center);camera.updateProjectionMatrix();};
    const resize=()=>{const w=node.clientWidth,h=node.clientHeight;if(!w||!h)return;camera.aspect=w/h;fit();renderer.setSize(w,h,false);};
    const observer=new ResizeObserver(resize);observer.observe(node);resize();
    if(reconstruction)reconstruction.readyPromise.then(()=>{if(disposed)return;modelReady=true;node.dataset.modelReady='true';fit();setLoading(false);}).catch(()=>{if(disposed)return;node.dataset.modelReady='false';setLoading(false);setFailed('The reconstruction could not load. The procedural rig remains available as a separate study.');});
    else{node.dataset.modelReady='true';setLoading(false);}
    let previous=performance.now(),elapsed=2,lastPose=poseRef.current,lastYaw=yawRef.current;
    const frame=(now:number)=>{const dt=Math.min((now-previous)/1000,.05);previous=now;elapsed+=dt;avatar.group.rotation.y=yawRef.current;if(yawRef.current!==lastYaw){fit();lastYaw=yawRef.current;}if(poseRef.current!==lastPose){if(poseRef.current!=='neutral')avatar.react(poseRef.current);lastPose=poseRef.current;}if(modelReady)avatar.update(dt,poseRef.current==='neutral'?2:elapsed,'idle','warm',0,poseRef.current==='neutral');renderer.render(scene,camera);node.dataset.likenessReady=String(modelReady);};
    const visibility=()=>{renderer.setAnimationLoop(null);if(document.visibilityState!=='hidden'){previous=performance.now();renderer.setAnimationLoop(frame);}};
    renderer.setAnimationLoop(frame);document.addEventListener('visibilitychange',visibility);
    return()=>{disposed=true;observer.disconnect();renderer.setAnimationLoop(null);document.removeEventListener('visibilitychange',visibility);if(reconstruction){scene.remove(avatar.group);reconstruction.dispose();}disposeEnv();const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>(),textures=new Set<THREE.Texture>();scene.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const material of Array.isArray(mesh.material)?mesh.material:[mesh.material]){materials.add(material);for(const value of Object.values(material))if(value instanceof THREE.Texture)textures.add(value);}});geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());renderer.dispose();renderer.domElement.remove();};
  },[modelKind]);
  const selectModel=(kind:'reference-mesh'|'procedural-rig')=>{setPose('neutral');setYaw(kind==='reference-mesh'?0:.36);setModelKind(kind);};
  return <main className="likeness-lab"><header><div><p>REFERENCE FIRST</p><h1>SpeckyG likeness study</h1><span>The supplied image beside an actual render. The user’s approval determines likeness.</span></div><a href={assetUrl('')}>Back to the island</a></header><div className="likeness-pair"><section><h2>Original supplied image</h2><div className="reference-frame"><img src={assetUrl('assets/speckyg-original-reference.png')} alt="Original SpeckyG reference: expressive detailed parrot, tilted police cap, pointing wing and black vest"/></div></section><section><h2>{modelKind==='reference-mesh'?'Image-conditioned 3D — authored deformation rig':'Earlier procedural rig — separate study'}</h2><div className="model-frame" ref={host} data-model-kind={modelKind}>{loading&&<p role="status">Loading actual 3D geometry…</p>}{failed&&<p role="alert">{failed}</p>}</div></section></div><div className="likeness-controls"><span>Choose a study:</span><button aria-pressed={modelKind==='reference-mesh'} onClick={()=>selectModel('reference-mesh')}>Reference mesh</button><button aria-pressed={modelKind==='procedural-rig'} onClick={()=>selectModel('procedural-rig')}>Procedural rig</button></div><div className="likeness-controls"><span>Inspect the actual geometry:</span><button onClick={()=>{setYaw(modelKind==='reference-mesh'?0:.36);setPose('neutral');}}>Still reference pose</button><button onClick={()=>setYaw(0)}>Front</button><button onClick={()=>setYaw(.8)}>Three-quarter</button><button onClick={()=>setYaw(Math.PI)}>Back</button><button disabled={loading||!!failed} onClick={()=>setPose(pose==='greet'?'neutral':'greet')}>{modelKind==='reference-mesh'?'Head and wing greeting':'Greeting pose'}</button>{modelKind==='procedural-rig'&&<button onClick={()=>setPose(pose==='wing'?'neutral':'wing')}>Wing movement</button>}</div><p className="likeness-footnote">{modelKind==='reference-mesh'?'Genuine 3D shape reconstructed from a derived reference image, with that artwork projected onto front-facing surfaces. Side and back views can distort; an authored regional rig moves the head, mandible, eyelids and wings. This is not a recovered anatomical skeleton; hidden anatomy and detailed facial performance remain unfinished. This is not an exact reconstruction or an approved likeness.':'Earlier source-built procedural rig, retained separately for inspection. Its articulated beak and wings do not establish visual likeness to the supplied image. Hidden sides and material fidelity remain unverified.'}</p></main>;
}
