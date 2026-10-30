import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as THREE from 'three';
import {createReconstructionRig} from './referenceRig';
import {repairReferenceAnatomy} from './referenceRepairs';

function actualReconstruction(){
 const raw=readFileSync('public/models/speckyg-reconstruction.glb');
 const jsonLength=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonLength).toString());
 const binStart=20+jsonLength+8;
 const primitive=doc.meshes[0].primitives[0];
 const read=(index:number)=>{const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],components=a.type==='VEC3'?3:a.type==='VEC2'?2:1;const start=binStart+(v.byteOffset??0)+(a.byteOffset??0);const bytes=raw.subarray(start,start+a.count*components*(a.componentType===5126||a.componentType===5125?4:2));const array=a.componentType===5126?new Float32Array(bytes.buffer,bytes.byteOffset,a.count*components).slice():a.componentType===5125?new Uint32Array(bytes.buffer,bytes.byteOffset,a.count).slice():new Uint16Array(bytes.buffer,bytes.byteOffset,a.count).slice();return new THREE.BufferAttribute(array,components);};
 const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',read(primitive.attributes.POSITION));geometry.setAttribute('normal',read(primitive.attributes.NORMAL));geometry.setAttribute('sourceRestPosition',geometry.getAttribute('position').clone());geometry.setAttribute('sourceRestNormal',geometry.getAttribute('normal').clone());geometry.setIndex(read(primitive.indices));
 const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());const root=new THREE.Group();root.add(mesh);const bounds=new THREE.Box3().setFromObject(root);return {root,mesh,bounds};
}

test('real GLB has disconnected mandible vertices, independent moving surfaces and immutable projected rest coordinates',()=>{
 const {root,mesh,bounds}=actualReconstruction(),rig=createReconstructionRig(root,bounds);
 assert(rig.diagnostics.weightedJaw>100);assert(rig.diagnostics.weightedHead>5000);assert(rig.diagnostics.weightedWing>2000);assert(rig.diagnostics.weightedEyes>50);
 const geometry=mesh.geometry,rest=Array.from(geometry.getAttribute('sourceRestPosition').array),zero={headYaw:0,headTilt:0,headNod:0,wing:0,foldedWing:0,jaw:0,blink:0,breath:0};
 rig.apply({...zero,jaw:.29});
 const attr=geometry.getAttribute('position'),mandible=geometry.getAttribute('rigMandible');let jawMoved=0,bodyMoved=0;
 for(let i=0;i<attr.count;i++){const distance=Math.hypot(attr.getX(i)-rest[i*3],attr.getY(i)-rest[i*3+1],attr.getZ(i)-rest[i*3+2]);if(mandible.getX(i))jawMoved=Math.max(jawMoved,distance);else bodyMoved=Math.max(bodyMoved,distance);}
 assert(jawMoved>.02);assert(bodyMoved<1e-6);assert(root.getObjectByName('Recessed oral cavity'));
 assert.deepEqual(Array.from(geometry.getAttribute('sourceRestPosition').array),rest);
 rig.setGesture('point',1);rig.update(.05,2,'idle','warm',0,false);assert(rig.diagnostics.wings.maxDisplacement>.1);
 rig.apply({...zero,blink:1});assert(rig.diagnostics.maxDisplacement>.01);
 assert(Array.from(attr.array).every(Number.isFinite));assert(Array.from(geometry.getAttribute('normal').array).every(Number.isFinite));
 rig.apply(zero);for(let i=0;i<attr.count;i++)assert(Math.abs(attr.getX(i)-rest[i*3])<1e-6);
});

test('actual jointed wings rest low, stretch both sides, cross at separate depths and return without moving vest vertices',()=>{
 const {root,mesh,bounds}=actualReconstruction(),rig=createReconstructionRig(root,bounds);
 const left=root.getObjectByName('Left feathered shoulder bone')!,right=root.getObjectByName('Right feathered shoulder bone')!;
 rig.setGesture('rest',0);rig.update(0,0,'idle','warm',0,false);
 const restLeft=[...rig.diagnostics.wings.leftReach],restRight=[...rig.diagnostics.wings.rightReach];
 assert(restLeft[2]<left.position.z-.20);assert(restRight[2]<right.position.z-.20);
 const bodyRest=Array.from(mesh.geometry.getAttribute('position').array);
 rig.setGesture('stretch',1);rig.update(0,0,'idle','warm',0,false);
 assert(rig.diagnostics.wings.leftReach[1]<restLeft[1]-.17);assert(rig.diagnostics.wings.rightReach[1]>restRight[1]+.17);
 assert.deepEqual(Array.from(mesh.geometry.getAttribute('position').array),bodyRest,'limb pose must not pull the vest');
 rig.setGesture('crossed',1);rig.update(0,0,'idle','warm',0,false);root.updateMatrixWorld(true);
 const crossedLeft=rig.diagnostics.wings.leftReach,crossedRight=rig.diagnostics.wings.rightReach;
 assert(Math.abs(crossedLeft[1]-crossedRight[1])<.025,'forearms must overlap across chest');
 assert(crossedLeft[0]>crossedRight[0]+.025,'near forearm must layer in front');
 assert(crossedLeft[1]>restLeft[1]+.10);assert(crossedRight[1]<restRight[1]-.10);
 assert(rig.diagnostics.pose.headTilt>.14);
 rig.setGesture('point',1);rig.update(0,0,'idle','warm',0,false);root.updateMatrixWorld(true);
 const pointer=root.getObjectsByProperty('name','Curved charcoal finger tip 0').find(object=>object.visible&&object.parent?.visible);
 assert(pointer);assert(rig.diagnostics.wings.leftReach[2]>restLeft[2]+.12);
 assert(root.getObjectsByProperty('name','Original reconstructed feathered palm').length===2);
 for(let step=0;step<=20;step++){rig.setGesture('crossed',step/20);rig.update(.016,0,'idle','warm',0,false);root.updateMatrixWorld(true);root.traverse(object=>{if(object instanceof THREE.Mesh){assert(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite));assert(object.matrixWorld.elements.every(Number.isFinite));}});}
 rig.setGesture('rest',0);rig.update(0,0,'idle','warm',0,false);
 assert.deepEqual(rig.diagnostics.wings.leftReach,restLeft);assert.deepEqual(rig.diagnostics.wings.rightReach,restRight);
 rig.setGesture('stretch',1);rig.update(0,0,'idle','warm',0,true);
 assert.deepEqual(rig.diagnostics.wings.leftReach,restLeft,'reduced motion retains relaxed pose');
 const photoCoordinates=mesh.geometry.getAttribute('sourceRestPosition');assert(Array.from(photoCoordinates.array).every(Number.isFinite));
});

test('speech-linked jaw closes immediately on cancellation; reduced motion preserves necessary speech articulation',()=>{
 const {root,bounds}=actualReconstruction(),rig=createReconstructionRig(root,bounds);
 for(let i=0;i<12;i++)rig.update(.05,2,'speaking','warm',.8,true);
 assert(Math.abs(rig.diagnostics.pose.jaw-.144)<.001);assert(rig.diagnostics.maxDisplacement>.01);assert.equal(rig.diagnostics.pose.headYaw,0);
 rig.update(0,2,'idle','warm',1,false);assert.equal(rig.diagnostics.pose.jaw,0);
 rig.update(.05,5.12,'listening','warm',0,false);assert(rig.diagnostics.pose.blink>.99);assert(rig.diagnostics.pose.headTilt<0);
});


test('bounded anatomy repair replaces fused feet with actual toes and preserves reference projection coordinates',()=>{
 const {root,mesh,bounds}=actualReconstruction(),before=Array.from(mesh.geometry.getAttribute('sourceRestPosition').array);
 repairReferenceAnatomy(root,bounds);
 assert(root.userData.anatomyRepairs.removedFootTriangles>100);
 assert(root.userData.anatomyRepairs.softenedCrestVertices>100);
 assert.deepEqual(Array.from(mesh.geometry.getAttribute('sourceRestPosition').array),before);
 assert(root.getObjectByName('Authored charcoal scaled toes and shanks'));
 assert(root.getObjectByName('Curled dark tapered talons'));
 assert.equal(root.userData.anatomyRepairs.separateCuffs,false);
 const factor=3.7/(bounds.max.z-bounds.min.z),center=bounds.getCenter(new THREE.Vector3());
 const branchStart=new THREE.Vector3(-2.55,.60,.22),branchDirection=new THREE.Vector3(5,.25,-.87),axisLength=branchDirection.length();branchDirection.normalize();
 const foot=root.getObjectByName('Authored charcoal scaled toes and shanks') as THREE.Mesh;
 const footPositions=foot.geometry.getAttribute('position');let minimum=Infinity,maximum=0,contactSamples=0;
 for(let i=0;i<footPositions.count;i++){
  const h=(footPositions.getZ(i)-bounds.min.z)/(bounds.max.z-bounds.min.z);if(h>.10)continue;
  const world=new THREE.Vector3((footPositions.getY(i)-center.y)*factor,.55+(footPositions.getZ(i)-bounds.min.z)*factor,(footPositions.getX(i)-center.x)*factor);
  const along=THREE.MathUtils.clamp(world.clone().sub(branchStart).dot(branchDirection),0,axisLength);
  const distance=world.distanceTo(branchStart.clone().addScaledVector(branchDirection,along));minimum=Math.min(minimum,distance);maximum=Math.max(maximum,distance);contactSamples++;
 }
 assert(contactSamples>1000);assert(minimum>.105,`toe penetration ${minimum}`);assert(maximum<.28,`toe floating ${maximum}`);
 assert(root.userData.anatomyRepairs.toeContactClearance[0]>-.006);
 const rig=createReconstructionRig(root,bounds);rig.update(.05,2,'listening','warm',0,false);
 root.traverse(object=>{if(object instanceof THREE.Mesh)assert(Array.from(object.geometry.getAttribute('position').array).every(Number.isFinite));});
});
