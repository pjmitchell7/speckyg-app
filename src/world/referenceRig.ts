import * as THREE from 'three';
import type {CharacterState, Mood} from '../../shared/types';
import type {CharacterReaction} from './types';

export interface ReconstructionPose {headYaw:number;headTilt:number;headNod:number;wing:number;foldedWing:number;jaw:number;blink:number;breath:number}
const smooth=(a:number,b:number,x:number)=>THREE.MathUtils.smoothstep(x,a,b);
const ellipse=(x:number,y:number,cx:number,cy:number,rx:number,ry:number)=>Math.sqrt(((x-cx)/rx)**2+((y-cy)/ry)**2);

/** Duplicate only seam vertices so lower mandible motion opens a real geometric gap. */
function disconnectMandible(geometry:THREE.BufferGeometry,bounds:THREE.Box3){
  const rest=geometry.getAttribute('sourceRestPosition');
  const indices=geometry.index,triangleCount=(indices?.count??rest.count)/3;
  const width=bounds.max.y-bounds.min.y,height=bounds.max.z-bounds.min.z;
  type Vertex={a:number;b:number;t:number;distance:number};
  const mapping=new Map<string,number>(),records:Vertex[]=[],jaw:number[]=[],out:number[]=[];
  const distance=(id:number)=>Math.max(ellipse((rest.getY(id)-bounds.min.y)/width,(rest.getZ(id)-bounds.min.z)/height,.688,.625,.073,.032)-1,(.14-rest.getX(id))*20);
  const put=(v:Vertex,isJaw:boolean)=>{
    const key=`${v.a}:${v.b}:${v.t.toFixed(7)}:${isJaw?1:0}`;
    let index=mapping.get(key);if(index===undefined){index=records.length;mapping.set(key,index);records.push(v);jaw.push(isJaw?1:0);}return index;
  };
  for(let triangle=0;triangle<triangleCount;triangle++){
    const vertices=[0,1,2].map(offset=>{const id=indices?indices.getX(triangle*3+offset):triangle*3+offset;return {a:id,b:id,t:0,distance:distance(id)};});
    for(const isJaw of [false,true]){
      const polygon:Vertex[]=[];
      for(let edge=0;edge<3;edge++){
        const a=vertices[edge],b=vertices[(edge+1)%3],aInside=isJaw?a.distance<=0:a.distance>=0,bInside=isJaw?b.distance<=0:b.distance>=0;
        if(aInside)polygon.push(a);
        if(aInside!==bInside){let from=a.a,to=b.a,t=a.distance/(a.distance-b.distance);if(from>to){[from,to]=[to,from];t=1-t;}polygon.push({a:from,b:to,t,distance:0});}
      }
      for(let i=1;i+1<polygon.length;i++)out.push(put(polygon[0],isJaw),put(polygon[i],isJaw),put(polygon[i+1],isJaw));
    }
  }
  for(const [name,attribute] of Object.entries(geometry.attributes)){
    const data=new Float32Array(records.length*attribute.itemSize);
    records.forEach((v,i)=>{for(let axis=0;axis<attribute.itemSize;axis++)data[i*attribute.itemSize+axis]=THREE.MathUtils.lerp(attribute.array[v.a*attribute.itemSize+axis],attribute.array[v.b*attribute.itemSize+axis],v.t);});
    geometry.setAttribute(name,new THREE.BufferAttribute(data,attribute.itemSize,attribute.normalized));
  }
  geometry.setAttribute('rigMandible',new THREE.Float32BufferAttribute(jaw,1));geometry.setIndex(out);
}

/** Authored regional deformation, not a recovered anatomical skeleton. Rest UVs never change. */
export function createReconstructionRig(root:THREE.Group,bounds:THREE.Box3){
  const height=bounds.max.z-bounds.min.z,width=bounds.max.y-bounds.min.y;
  const source=(x:number,h:number,depth=0)=>new THREE.Vector3(depth,bounds.min.y+x*width,bounds.min.z+h*height);
  const neck=source(.60,.535,.025),leftShoulder=source(.46,.55,.015),rightShoulder=source(.84,.55,-.015),hinge=source(.625,.66,.20);
  // A dark recessed oral volume becomes visible through the disconnected jaw seam.
  // It is actual shaded geometry, rather than painting a black opening onto the photograph.
  const cavityGeometry=new THREE.SphereGeometry(1,20,12);
  cavityGeometry.scale(.030,width*.083,height*.062);
  const oralCenter=source(.688,.630,.108);cavityGeometry.translate(oralCenter.x,oralCenter.y,oralCenter.z);
  cavityGeometry.setAttribute('sourceRestPosition',cavityGeometry.getAttribute('position').clone());
  cavityGeometry.setAttribute('sourceRestNormal',cavityGeometry.getAttribute('normal').clone());
  const cavity=new THREE.Mesh(cavityGeometry,new THREE.MeshStandardMaterial({color:'#100a08',roughness:1}));
  cavity.name='Recessed oral cavity';cavity.userData.oralCavity=true;root.add(cavity);
  const parts:{mesh:THREE.Mesh;position:THREE.BufferAttribute;normal:THREE.BufferAttribute;rest:Float32Array;normals:Float32Array;inverse:THREE.Matrix4;normalInverse:THREE.Matrix3;weights:Float32Array}[]=[];
  root.updateMatrixWorld(true);
  let weightedHead=0,weightedJaw=0,weightedWing=0,weightedEyes=0;
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh))return;
    const geometry=object.geometry;
    if(geometry.getAttribute('sourceRestPosition'))disconnectMandible(geometry,bounds);
    const rest=geometry.getAttribute('sourceRestPosition'),normals=geometry.getAttribute('sourceRestNormal');
    if(!rest||!normals)return;
    const weights=new Float32Array(rest.count*6);
    for(let i=0;i<rest.count;i++){
      const x=(rest.getY(i)-bounds.min.y)/width,h=(rest.getZ(i)-bounds.min.z)/height;
      const head=smooth(.515,.645,h);
      // The photographed lower mandible occupies this curved region below the hooked upper bill.
      const jaw=object.userData.oralCavity?0:geometry.getAttribute('rigMandible').getX(i);
      const wing=(1-smooth(.45,.57,x))*smooth(.19,.32,h)*(1-smooth(.55,.59,h));
      const folded=smooth(.79,.89,x)*smooth(.18,.3,h)*(1-smooth(.55,.60,h));
      const eye=(1-smooth(.84,1.14,ellipse(x,h,.541,.724,.079,.042)))*smooth(.07,.16,rest.getX(i));
      const farEye=(1-smooth(.8,1.14,ellipse(x,h,.79,.746,.027,.027)))*smooth(.06,.14,rest.getX(i));
      weights.set([head,jaw,wing,folded,eye,farEye],i*6);
      if(head>.5)weightedHead++;if(jaw>.5)weightedJaw++;if(wing>.5)weightedWing++;if(eye+farEye>.5)weightedEyes++;
    }
    geometry.getAttribute('position').setUsage(THREE.DynamicDrawUsage);
    geometry.getAttribute('normal').setUsage(THREE.DynamicDrawUsage);
    parts.push({mesh:object,position:geometry.getAttribute('position') as THREE.BufferAttribute,normal:geometry.getAttribute('normal') as THREE.BufferAttribute,rest:new Float32Array((geometry.getAttribute('rigRestPosition')??rest).array),normals:new Float32Array(normals.array),inverse:object.matrixWorld.clone().invert(),normalInverse:new THREE.Matrix3().getNormalMatrix(object.matrixWorld.clone().invert()),weights});
    object.frustumCulled=false;
  });
  const point=new THREE.Vector3(),normal=new THREE.Vector3(),axisX=new THREE.Vector3(1,0,0),axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
  const pose:ReconstructionPose={headYaw:0,headTilt:0,headNod:0,wing:0,foldedWing:0,jaw:0,blink:0,breath:0};
  let reaction:CharacterReaction|null=null,reactionClock=10,smoothedJaw=0;
  const diagnostics={weightedHead,weightedJaw,weightedWing,weightedEyes,vertices:parts.reduce((n,p)=>n+p.position.count,0),maxDisplacement:0,pose};
  function apply(next:ReconstructionPose){
    Object.assign(pose,next);let maxDisplacement=0;
    for(const part of parts){
      for(let i=0;i<part.position.count;i++){
        const k=i*3,w=i*6;point.fromArray(part.rest,k);normal.fromArray(part.normals,k);
        const head=part.weights[w],jaw=part.weights[w+1],wing=part.weights[w+2],folded=part.weights[w+3];
        const x=(point.y-bounds.min.y)/width,h=(point.z-bounds.min.z)/height;
        // Both eye surfaces close toward a shared line. The shader supplies the feathered lid colour.
        const eye=part.weights[w+4],far=part.weights[w+5];
        point.z+=(bounds.min.z+.724*height-point.z)*next.blink*eye*.89;
        point.z+=(bounds.min.z+.746*height-point.z)*next.blink*far*.89;
        if(jaw>0){point.sub(hinge).applyAxisAngle(axisY,next.jaw*jaw).add(hinge);point.z-=next.jaw*jaw*.047;normal.applyAxisAngle(axisY,next.jaw*jaw);}
        if(wing>0){point.sub(leftShoulder).applyAxisAngle(axisX,next.wing*wing).applyAxisAngle(axisZ,-next.wing*wing*.45).add(leftShoulder);normal.applyAxisAngle(axisX,next.wing*wing).applyAxisAngle(axisZ,-next.wing*wing*.45);}
        if(folded>0){point.sub(rightShoulder).applyAxisAngle(axisX,next.foldedWing*folded).add(rightShoulder);normal.applyAxisAngle(axisX,next.foldedWing*folded);}
        point.sub(neck).applyAxisAngle(axisZ,next.headYaw*head).applyAxisAngle(axisY,next.headNod*head).applyAxisAngle(axisX,next.headTilt*head).add(neck);
        normal.applyAxisAngle(axisZ,next.headYaw*head).applyAxisAngle(axisY,next.headNod*head).applyAxisAngle(axisX,next.headTilt*head);
        const chest=(1-head)*smooth(.19,.34,h)*(1-smooth(.8,.94,x));point.x+=next.breath*chest;
        maxDisplacement=Math.max(maxDisplacement,Math.hypot(point.x-part.rest[k],point.y-part.rest[k+1],point.z-part.rest[k+2]));
        point.applyMatrix4(part.inverse);normal.applyMatrix3(part.normalInverse).normalize();
        part.position.setXYZ(i,point.x,point.y,point.z);part.normal.setXYZ(i,normal.x,normal.y,normal.z);
      }
      part.position.needsUpdate=true;part.normal.needsUpdate=true;
    }
    diagnostics.maxDisplacement=maxDisplacement;
  }
  return {diagnostics,apply,
    react(kind:CharacterReaction){reaction=kind;reactionClock=0;},
    update(dt:number,elapsed:number,state:CharacterState,mood:Mood,amplitude:number,reduced:boolean,gazeX=0,gazeY=0){
      reactionClock+=Math.min(Math.max(dt,0),.08);
      const t=elapsed,quiet=mood==='gentle'||mood==='thoughtful',motion=reduced?0:quiet?.5:1;
      const envelope=reactionClock<2.2?Math.sin(Math.PI*reactionClock/2.2):0;
      // A state transition closes the jaw immediately, independently of interpolation.
      const target=state==='speaking'?THREE.MathUtils.clamp(amplitude,0,1)*.18:0;
      smoothedJaw=state==='speaking'?THREE.MathUtils.lerp(smoothedJaw,target,1-Math.exp(-Math.max(dt,0)*30)):0;
      const blinkCycle=t%5.3,blink=!reduced&&blinkCycle>4.94?Math.sin(Math.PI*(blinkCycle-4.94)/.36)**2:0;
      apply({
        headYaw:motion*(Math.sin(t*.41)*.035+THREE.MathUtils.clamp(gazeX,-1,1)*.09),
        headTilt:motion*(Math.sin(t*.57)*.025+(state==='listening'?-.065:0)+(reaction==='head'?envelope*.12:0)),
        headNod:motion*(Math.sin(t*.73)*.014+THREE.MathUtils.clamp(gazeY,-1,1)*.045+(state==='speaking'?Math.sin(t*3)*amplitude*.025:0)),
        wing:motion*(Math.sin(t*.83)*.018+(reaction==='greet'?envelope*(.15+Math.sin(reactionClock*10)*.055):reaction==='wing'?envelope*.23:reaction==='dance'?envelope*Math.sin(t*5)*.16:0)),
        foldedWing:motion*Math.sin(t*.83+.7)*.018,jaw:smoothedJaw,blink,breath:motion*Math.sin(t*1.8)*.0018,
      });
    },
  };
}
