import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

/** A neutral broad reflection source, created locally without downloaded HDR assets. */
export function addCharacterEnvironment(renderer:THREE.WebGLRenderer,scene:THREE.Scene) {
  const generator=new THREE.PMREMGenerator(renderer);
  const room=new RoomEnvironment();
  const target=generator.fromScene(room,.035,.1,100,{size:128});
  scene.environment=target.texture;
  scene.environmentIntensity=.48;
  room.dispose(); generator.dispose();
  return ()=>{scene.environment=null;target.dispose();};
}
