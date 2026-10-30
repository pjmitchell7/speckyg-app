import {test} from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {createSpeckyG} from '../world/avatar';

test('speaking uses audible amplitude; cancellation closes the actual hinged beak immediately',()=>{
  const rig=createSpeckyG();
  const hinge=rig.group.getObjectByName('lower-beak-hinge');
  assert.ok(hinge,'Speech needs a separate lower-beak hinge.');
  rig.update(.05,1,'thinking','curious',1,false);
  assert.equal(hinge.rotation.x,0,'Unplayed audio must not drive speech motion.');
  rig.update(.05,1.1,'speaking','warm',.9,false);
  assert.ok(hinge.rotation.x>.1,'Actual playback amplitude must open the beak.');
  rig.update(.001,1.101,'idle','warm',1,false);
  assert.equal(hinge.rotation.x,0,'Stop must close the jaw without an old smoothing tail.');
  const geometries=new Set<THREE.BufferGeometry>(),materials=new Set<THREE.Material>();
  rig.group.traverse(object=>{const mesh=object as THREE.Mesh;if(mesh.geometry)geometries.add(mesh.geometry);if(mesh.material)for(const mat of Array.isArray(mesh.material)?mesh.material:[mesh.material])materials.add(mat);});
  geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());
});
