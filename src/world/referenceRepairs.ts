import * as THREE from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Bounded repairs to inferred reconstruction anatomy; the original source asset is untouched. */
export function repairReferenceAnatomy(root:THREE.Group,bounds:THREE.Box3){
  const width=bounds.max.y-bounds.min.y,height=bounds.max.z-bounds.min.z;
  const point=(x:number,h:number,depth:number)=>new THREE.Vector3(depth,bounds.min.y+x*width,bounds.min.z+h*height);
  let removedFootTriangles=0,softenedCrestVertices=0;
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const geometry=object.geometry,position=geometry.getAttribute('position'),rest=geometry.getAttribute('sourceRestPosition');
    if(!rest||!geometry.index)return;
    const indices=geometry.index,kept:number[]=[],neighbors=Array.from({length:position.count},()=>new Set<number>());
    for(let i=0;i<indices.count;i+=3){
      const ids=[indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
      const x=ids.reduce((s,id)=>s+rest.getY(id),0)/3,h=ids.reduce((s,id)=>s+rest.getZ(id),0)/3;
      const qx=(x-bounds.min.y)/width,qh=(h-bounds.min.z)/height;
      // Remove only inferred feet below the feathered shanks; the long left tail stays intact.


      if(qh<.14&&qx>.29+.8*qh&&qx<.98){removedFootTriangles++;continue;}
      kept.push(...ids);for(let a=0;a<3;a++)for(let b=0;b<3;b++)if(a!==b)neighbors[ids[a]].add(ids[b]);
    }
    geometry.setIndex(kept);
    const welded=new Map<string,number[]>();
    for(let i=0;i<position.count;i++){const key=[position.getX(i),position.getY(i),position.getZ(i)].map(v=>v.toFixed(5)).join(':');const list=welded.get(key)??[];list.push(i);welded.set(key,list);}
    for(const ids of welded.values()){if(ids.length<2)continue;const union=new Set<number>();for(const id of ids)for(const neighbor of neighbors[id])union.add(neighbor);for(const id of ids)neighbors[id]=union;}
    // Two light source-space Laplacian passes round reconstruction facets in the fan.
    // Rest projection coordinates stay unchanged, preserving the original feather artwork.
    for(let pass=0;pass<2;pass++){
      const next=new Float32Array(position.array),average=new THREE.Vector3(),current=new THREE.Vector3();
      for(let i=0;i<position.count;i++){
        const x=(rest.getY(i)-bounds.min.y)/width,h=(rest.getZ(i)-bounds.min.z)/height;
        if(x>.43||h<.70||neighbors[i].size<3)continue;
        average.set(0,0,0);for(const id of neighbors[i])average.add(current.fromBufferAttribute(position,id));average.multiplyScalar(1/neighbors[i].size);
        current.fromBufferAttribute(position,i).lerp(average,.28);current.toArray(next,i*3);if(pass===0)softenedCrestVertices++;
      }
      position.array.set(next);
    }
    for(let i=0;i<position.count;i++){
      const x=(rest.getY(i)-bounds.min.y)/width,h=(rest.getZ(i)-bounds.min.z)/height;
      if(h<.14||h>.235)continue;
      const near=Math.min(Math.abs(x-.505),Math.abs(x-.775));
      const weight=(1-THREE.MathUtils.smoothstep(h,.14,.235))*Math.exp(-Math.pow(near/.065,2));
      position.setZ(i,position.getZ(i)-height*.022*weight);
    }
    position.needsUpdate=true;
    // The rig needs repaired rest positions; UV projection remains the unchanged source frame.
    geometry.setAttribute('rigRestPosition',position.clone());
  });
  const scales:THREE.BufferGeometry[]=[],claws:THREE.BufferGeometry[]=[];
  const scaleColor=new THREE.Color('#33362a'),ridgeColor=new THREE.Color('#77725b');
  function tube(points:THREE.Vector3[],radius:number,segments=24,claw=false){
    const path=new THREE.CatmullRomCurve3(points),frames=path.computeFrenetFrames(segments,false);
    const vertices:number[]=[],colors:number[]=[],indices:number[]=[],radial=10;
    for(let ring=0;ring<=segments;ring++){
      const t=ring/segments,center=path.getPoint(t),r=radius*(claw?Math.max(.025,1-t):1-.35*t)*(1+.075*Math.cos(t*Math.PI*26));
      for(let side=0;side<=radial;side++){
        const angle=side/radial*Math.PI*2,offset=frames.normals[ring].clone().multiplyScalar(Math.cos(angle)*r).addScaledVector(frames.binormals[ring],Math.sin(angle)*r);
        vertices.push(center.x+offset.x,center.y+offset.y,center.z+offset.z);
        const band=Math.pow(Math.max(0,Math.cos(t*Math.PI*26+(side%2)*.5)),10)*.55;
        const color=scaleColor.clone().lerp(ridgeColor,claw?.05:band);colors.push(color.r,color.g,color.b);
        if(ring<segments&&side<radial){const a=ring*(radial+1)+side,b=a+radial+1;indices.push(a,b,a+1,b,b+1,a+1);}
      }
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();(claw?claws:scales).push(geometry);
  }
  // Exact cylinder frame from island.ts: (-2.55,.60,.22) -> (2.45,.85,-.65), r=.15.
  const factor=3.7/height,sourceCenter=bounds.getCenter(new THREE.Vector3());
  const worldToSource=(world:THREE.Vector3)=>new THREE.Vector3(sourceCenter.x+world.z/factor,sourceCenter.y+world.x/factor,bounds.min.z+(world.y-.55)/factor);
  const tangent=new THREE.Vector3(5,.25,-.87).normalize();
  const up=new THREE.Vector3(0,1,0).addScaledVector(tangent,-tangent.y).normalize();
  const front=new THREE.Vector3().crossVectors(tangent,up).normalize();
  const contactClearances:number[]=[];
  function cylinderPoint(footX:number,spread:number,angle:number,toeRadius:number){
    const x=footX+spread,t=(x+2.55)/5;
    const centre=new THREE.Vector3(-2.55+5*t,.60+.25*t,.22-.87*t);
    // A slight contact compression makes the lower toe surface bear on the bark.
    const centreRadius=.15+toeRadius*.92;
    contactClearances.push(centreRadius-toeRadius-.15);
    return centre.addScaledVector(up,Math.cos(angle)*centreRadius).addScaledVector(front,Math.sin(angle)*centreRadius);
  }
  for(const center of [.505,.775]){
    const footX=(bounds.min.y+center*width-sourceCenter.y)*factor;
    const padCenter=cylinderPoint(footX,0,-.04,.055);
    const padGeometry=new THREE.SphereGeometry(1,18,12);
    const padPositions=padGeometry.getAttribute('position'),padColors:number[]=[];
    for(let i=0;i<padPositions.count;i++){
      const p=new THREE.Vector3().fromBufferAttribute(padPositions,i);
      const world=padCenter.clone().addScaledVector(tangent,p.x*.145).addScaledVector(up,p.y*.060).addScaledVector(front,p.z*.085);
      const sourcePoint=worldToSource(world);padPositions.setXYZ(i,sourcePoint.x,sourcePoint.y,sourcePoint.z);
      const color=scaleColor.clone().lerp(ridgeColor,Math.max(0,p.y)*.13);padColors.push(color.r,color.g,color.b);
    }
    padGeometry.deleteAttribute('uv');padGeometry.setAttribute('color',new THREE.Float32BufferAttribute(padColors,3));padGeometry.computeVertexNormals();scales.push(padGeometry);
    const sourcePad=worldToSource(padCenter);
    tube([point(center,.158,sourcePad.x),point(center-.004,.123,sourcePad.x),sourcePad],.0145,18);
    for(let digit=0;digit<3;digit++){
      const spread=(digit-1)*.143,radius=.055-(digit===1?0:.003),points:THREE.Vector3[]=[];
      for(let step=0;step<=10;step++){
        const t=step/10,angle=-.20+t*1.91,localRadius=radius*(1-.35*t);
        points.push(worldToSource(cylinderPoint(footX,spread*(.48+.52*t),angle,localRadius)));
      }
      tube(points,radius/factor,32);
      const clawsPath:THREE.Vector3[]=[];
      for(let step=0;step<=6;step++){
        const t=step/6;clawsPath.push(worldToSource(cylinderPoint(footX,spread,1.71+t*.43,.030*(1-t))));
      }
      tube(clawsPath,.030/factor,16,true);
    }
    const rear:THREE.Vector3[]=[];
    for(let step=0;step<=8;step++){const t=step/8;rear.push(worldToSource(cylinderPoint(footX,-.10*t,-.25-t*1.55,.043*(1-.35*t))));}
    tube(rear,.043/factor,24);
    tube([rear.at(-1)!,worldToSource(cylinderPoint(footX,-.1,-1.98,.018)),worldToSource(cylinderPoint(footX,-.1,-2.17,0))],.024/factor,12,true);
  }
  for(const [pieces,name,roughness] of [[scales,'Authored charcoal scaled toes and shanks',.86],[claws,'Curled dark tapered talons',.46]] as const){
    const geometry=mergeGeometries([...pieces],false)!;
    geometry.setAttribute('sourceRestPosition',geometry.getAttribute('position').clone());geometry.setAttribute('sourceRestNormal',geometry.getAttribute('normal').clone());
    const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({vertexColors:true,roughness}));mesh.name=name;mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.authoredFootRepair=true;root.add(mesh);pieces.forEach(piece=>piece.dispose());
  }
  root.userData.anatomyRepairs={removedFootTriangles,softenedCrestVertices,authoredFeet:true,sourceUntouched:true,perchRadius:.15,toeContactClearance:[Math.min(...contactClearances),Math.max(...contactClearances)],separateCuffs:false};
}
