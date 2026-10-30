import type * as THREE from 'three';
import type { CharacterState, Mood } from '../../shared/types';
export type WorldInteraction = 'radio' | 'chime' | 'leaves';
export type CharacterReaction = 'greet' | 'wing' | 'head' | 'dance';
export interface AvatarRig {
  group: THREE.Group;
  update(dt:number, elapsed:number, state:CharacterState, mood:Mood, amplitude:number, reducedMotion:boolean):void;
  react(reaction:CharacterReaction):void;
}
export interface IslandWorld {
  group: THREE.Group;
  targets: THREE.Object3D[];
  update(dt:number, elapsed:number, reducedMotion:boolean):void;
  interact(kind:WorldInteraction):void;
  setAtmosphere(night:boolean, rain:boolean):void;
  setPortrait?(portrait:boolean):void;
}
