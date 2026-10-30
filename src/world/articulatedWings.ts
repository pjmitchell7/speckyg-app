import * as THREE from 'three';
import {createUniformMaterial} from './uniformSurface';
import {createFeatherMaterial,createFeatherGroom} from './featherSurface';
import type {PerformanceGesture} from './gestureDirector';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';

/** Replaces only fused wing regions. The face, uniform print and source asset remain intact. */
export function createArticulatedWings(root:THREE.Group,bounds:THREE.Box3,sourceTexture?:THREE.Texture){
  const width=bounds.max.y-bounds.min.y,height=bounds.max.z-bounds.min.z;
  const source=(x:number,h:number,d:number)=>new THREE.Vector3(d,bounds.min.y+x*width,bounds.min.z+h*height);
  let removedTriangles=0;
  let palmGeometry:THREE.BufferGeometry|undefined,palmMaterial:THREE.Material|THREE.Material[]|undefined;
  const sourceMeshes:THREE.Mesh[]=[];
  root.traverse(object=>{if(object instanceof THREE.Mesh&&!object.userData.authoredFootRepair&&object.geometry.getAttribute('sourceRestPosition'))sourceMeshes.push(object);});
  for(const object of sourceMeshes){
    const geometry=object.geometry,rest=geometry.getAttribute('sourceRestPosition'),indices=geometry.index;if(!indices)continue;
    const kept:number[]=[],palm:number[]=[],originalEdges=new Map<string,number>();
    const key=(a:number,b:number)=>a<b?`${a}:${b}`:`${b}:${a}`;
    for(let i=0;i<indices.count;i+=3)for(let edge=0;edge<3;edge++){const k=key(indices.getX(i+edge),indices.getX(i+(edge+1)%3));originalEdges.set(k,(originalEdges.get(k)??0)+1);}
    for(let i=0;i<indices.count;i+=3){
      const ids=[indices.getX(i),indices.getX(i+1),indices.getX(i+2)];
      const x=ids.reduce((sum,id)=>sum+(rest.getY(id)-bounds.min.y)/width,0)/3,h=ids.reduce((sum,id)=>sum+(rest.getZ(id)-bounds.min.z)/height,0)/3,depth=ids.reduce((sum,id)=>sum+rest.getX(id),0)/3;
      if(depth>.24&&x>.27&&x<.565&&h>.295&&h<.59)palm.push(...ids);
      const chestPrint=x>.535&&x<.70&&h>.40&&h<.465;
      if(!chestPrint&&((h>.19&&h<.565&&x<.535)||(h>.355&&h<.565&&x<.595&&depth>.11)||(h>.195&&h<.565&&x>.855))){removedTriangles++;continue;}
      kept.push(...ids);
    }
    geometry.setIndex(kept);
    const keptEdges=new Map<string,number>();for(let i=0;i<kept.length;i+=3)for(let edge=0;edge<3;edge++){const k=key(kept[i+edge],kept[i+(edge+1)%3]);keptEdges.set(k,(keptEdges.get(k)??0)+1);}
    const boundary=new Map<number,number[]>();for(const [edge,count] of keptEdges){if(count!==1||originalEdges.get(edge)!==2)continue;const [a,b]=edge.split(':').map(Number);boundary.set(a,[...(boundary.get(a)??[]),b]);boundary.set(b,[...(boundary.get(b)??[]),a]);}
    const visited=new Set<number>(),positions=geometry.getAttribute('position'),capMaterial=createUniformMaterial('#151a12');capMaterial.side=THREE.DoubleSide;
    for(const start of boundary.keys()){
      if(visited.has(start))continue;const queue=[start],ids:number[]=[];while(queue.length){const id=queue.pop()!;if(visited.has(id))continue;visited.add(id);ids.push(id);queue.push(...(boundary.get(id)??[]));}
      if(ids.length<3)continue;const centroid=new THREE.Vector3();for(const id of ids)centroid.add(new THREE.Vector3().fromBufferAttribute(positions,id));centroid.divideScalar(ids.length);
      const capPositions:number[]=[],capIndices:number[]=[];for(const id of ids){for(const other of boundary.get(id)??[]){if(id>other)continue;const a=new THREE.Vector3().fromBufferAttribute(positions,id),b=new THREE.Vector3().fromBufferAttribute(positions,other);a.sub(centroid).multiplyScalar(1.008).add(centroid);b.sub(centroid).multiplyScalar(1.008).add(centroid);const first=capPositions.length/3;capPositions.push(...centroid.toArray(),...a.toArray(),...b.toArray());capIndices.push(first,first+1,first+2);}}
      const capGeometry=new THREE.BufferGeometry();capGeometry.setAttribute('position',new THREE.Float32BufferAttribute(capPositions,3));capGeometry.setIndex(capIndices);capGeometry.computeVertexNormals();
      const cap=new THREE.Mesh(capGeometry,capMaterial);cap.name='Closed reconstructed sleeve seam';cap.matrix.copy(object.matrix);cap.matrixAutoUpdate=false;object.parent!.add(cap);
    }
    if(palm.length&&!palmGeometry){
      const compact=new THREE.BufferGeometry(),lookup=new Map<number,number>(),sourceIds:number[]=[],out:number[]=[];
      for(const id of palm){let mapped=lookup.get(id);if(mapped===undefined){mapped=sourceIds.length;lookup.set(id,mapped);sourceIds.push(id);}out.push(mapped);}
      for(const [name,attribute] of Object.entries(geometry.attributes)){const values=new Float32Array(sourceIds.length*attribute.itemSize);sourceIds.forEach((id,n)=>{for(let k=0;k<attribute.itemSize;k++)values[n*attribute.itemSize+k]=attribute.array[id*attribute.itemSize+k];});compact.setAttribute(name,new THREE.BufferAttribute(values,attribute.itemSize,attribute.normalized));}
      compact.setIndex(out);compact.computeBoundingBox();const center=compact.boundingBox!.getCenter(new THREE.Vector3()),position=compact.getAttribute('position');for(let i=0;i<position.count;i++)position.setXYZ(i,position.getX(i)-center.x,position.getY(i)-center.y,position.getZ(i)-center.z);
      palmGeometry=compact;palmMaterial=object.material;
    }
  }
  const vestGeometry=new THREE.SphereGeometry(1,40,28);vestGeometry.scale(.112,width*.235,height*.21);const vestCenter=source(.635,.38,.025);vestGeometry.translate(vestCenter.x,vestCenter.y,vestCenter.z);
  const vest=new THREE.Mesh(vestGeometry,createUniformMaterial('#111610'));vest.name='Closed dark fabric under articulated sleeves';vest.userData.authoredWingBacking=true;vest.castShadow=true;root.add(vest);
  // Quiet tailoring gives the newly exposed side panels the same uniform purpose.
  const seamMaterial=new THREE.MeshStandardMaterial({color:'#25291e',roughness:.96});
  for(const side of [-1,1]){
    const q=side<0?.495:.80,center=source(q,.315,.112),pocket=new THREE.Mesh(new THREE.BoxGeometry(.004,width*.090,height*.065),createUniformMaterial('#101510'));pocket.position.copy(center);pocket.name='Side vest utility pocket';root.add(pocket);
    const seam=new THREE.CatmullRomCurve3([source(q-.045,.348,.119),source(q,.350,.121),source(q+.045,.348,.119)]);const line=new THREE.Mesh(new THREE.TubeGeometry(seam,14,.0012,5,false),seamMaterial);line.name='Subtle stitched pocket opening';root.add(line);
    const sleeveSeam=new THREE.CatmullRomCurve3([source(side<0?.49:.80,.51,.11),source(side<0?.47:.82,.43,.128),source(side<0?.48:.815,.37,.13)]);const edge=new THREE.Mesh(new THREE.TubeGeometry(sleeveSeam,18,.0020,6,false),seamMaterial);edge.name='Stitched vest armhole';root.add(edge);
  }
  const yellow=createFeatherMaterial('#cfa12e'),green=createFeatherMaterial('#cfa93d'),dark=new THREE.MeshStandardMaterial({color:'#171b13',roughness:.51});
  const feather=createFeatherMaterial('#ffffff');feather.vertexColors=true;
  let photoGrain:THREE.Texture|undefined;
  function photoDetail(material:THREE.MeshStandardMaterial){
    if(!sourceTexture)return;
    if(!photoGrain){const image=sourceTexture.image as {width:number;height:number};photoGrain=sourceTexture.clone();photoGrain.repeat.set(.075*984/image.width,.115*1561/image.height);photoGrain.offset.set(.33*984/image.width,1-1573/image.height+.34*1561/image.height);photoGrain.needsUpdate=true;}
    material.map?.dispose();material.map=photoGrain;
    material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#ifdef USE_MAP
      vec4 photoGrain=texture2D(map,vMapUv);
      float featherDetail=clamp(dot(photoGrain.rgb,vec3(.2126,.7152,.0722)),.2,.9);
      diffuseColor.rgb*=.82+.34*featherDetail;
      #endif`);};material.customProgramCacheKey=()=> 'speckyg-wing-photo-grain-v1';material.needsUpdate=true;
  }
  photoDetail(yellow);photoDetail(green);photoDetail(feather);
  // Inferred closed feathered surfaces under the removed fused sleeve/hand regions.
  for(const [x,h,rx,rz] of [[.48,.57,.145,.040],[.565,.200,.23,.075]]){
    const geometry=new THREE.SphereGeometry(1,28,22),center=source(x,h,-.018);geometry.scale(.070,width*rx,height*rz);geometry.translate(center.x,center.y,center.z);
    const patch=new THREE.Mesh(geometry,yellow);patch.name=h>.4?'Feathered neck sleeve closure':'Feathered lower vest closure';patch.castShadow=true;root.add(patch);
    const groom=createFeatherGroom({radii:[.072,width*rx,height*rz],count:h>.4?130:400,length:height*.023,width:width*.009,rootColor:'#9e7f1b',color:'#d3ab35',tipColor:'#ebc44c',flow:[0,0,-1],seed:h>.4?763:1487});groom.position.copy(center);root.add(groom);
  }
  const sides:{sign:number;upper:THREE.Group;forearm:THREE.Group;hand:THREE.Group;finger:THREE.Group;fan:THREE.Group;palm:THREE.Group;shoulder:THREE.Vector3}[]=[];
  function mesh(parent:THREE.Object3D,geometry:THREE.BufferGeometry,material:THREE.Material,name:string){const object=new THREE.Mesh(geometry,material);object.name=name;object.castShadow=true;object.receiveShadow=true;object.userData.interaction='wing';parent.add(object);return object;}
  function volume(parent:THREE.Object3D,center:THREE.Vector3,radii:THREE.Vector3,material:THREE.Material,name:string){const geometry=new THREE.SphereGeometry(1,24,18);geometry.scale(radii.x,radii.y,radii.z);geometry.translate(center.x,center.y,center.z);return mesh(parent,geometry,material,name);}
  function flightFeather(parent:THREE.Object3D,length:number,breadth:number,base:THREE.Vector3,angle:number,index:number,covert?:'green'|'gold'){
    const geometry=new THREE.SphereGeometry(1,10,14),position=geometry.getAttribute('position'),colors:number[]=[];
    const rootColor=new THREE.Color(covert==='gold'?'#b18b24':index%3===0?'#376d2b':'#6a922d'),gold=new THREE.Color('#e2bd41'),orange=new THREE.Color(covert?'#e8bf45':index%2===0?'#dd682a':'#c54125');
    for(let i=0;i<position.count;i++){const z=position.getZ(i),t=(1-z)/2,taper=1-.58*t*t;position.setXYZ(i,position.getX(i)*.009*taper,position.getY(i)*breadth*taper,-t*length);const color=t<.5?rootColor.clone().lerp(gold,t*1.7):gold.clone().lerp(orange,Math.min(1,(t-.5)*2.15));colors.push(color.r,color.g,color.b);}
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.computeVertexNormals();
    const vane=mesh(parent,geometry,feather,`Layered green gold orange flight feather ${index}`);vane.position.copy(base);vane.rotation.x=angle;return vane;
  }
  function mergeFeathers(parent:THREE.Group,name:string){const originals=[...parent.children] as THREE.Mesh[],pieces=originals.map(object=>{object.updateMatrix();const piece=object.geometry.clone().applyMatrix4(object.matrix);object.geometry.dispose();parent.remove(object);return piece;});const merged=mergeGeometries(pieces,false)!;mesh(parent,merged,feather,name);pieces.forEach(piece=>piece.dispose());}
  for(const sign of [-1,1]){
    const upper=new THREE.Group(),forearm=new THREE.Group(),hand=new THREE.Group(),fan=new THREE.Group(),finger=new THREE.Group(),palm=new THREE.Group();
    upper.name=sign<0?'Left feathered shoulder bone':'Right feathered shoulder bone';upper.userData.interaction='wing';root.add(upper);
    const shoulder=source(sign<0?.465:.855,.545,.085);upper.position.copy(shoulder);
    forearm.position.set(0,sign*width*.025,-height*.135);upper.add(forearm);hand.position.set(.012,0,-height*.10);forearm.add(hand);hand.add(finger);forearm.add(fan);
    volume(upper,new THREE.Vector3(0,sign*.011,-height*.065),new THREE.Vector3(.046,width*.069,height*.083),green,'Golden feathered upper wing coverts');
    volume(forearm,new THREE.Vector3(.015,0,-height*.054),new THREE.Vector3(.040,width*.065,height*.073),yellow,'Gold feathered forearm');
    const palmBacking=volume(hand,new THREE.Vector3(.015,0,-height*.035),new THREE.Vector3(.039,width*.060,height*.047),yellow,'Feathered palm');
    if(palmGeometry&&palmMaterial){const originalPalm=new THREE.Mesh(palmGeometry,palmMaterial);originalPalm.name='Original reconstructed feathered palm';originalPalm.userData.authoredPointerPalm=true;originalPalm.userData.interaction='wing';originalPalm.castShadow=true;originalPalm.scale.set(.7,sign<0?.7:-.7,.7);palm.add(originalPalm);palm.position.set(.025,0,-height*.046);hand.add(palm);palmBacking.scale.set(.88,.88,.88);}
    for(let row=0;row<2;row++)for(let n=0;n<7;n++){const length=height*(.215+.023*Math.sin(n*.65)+row*.012),base=new THREE.Vector3(-.019-row*.007,sign*(.012+n*width*.012),-height*(.066+row*.023));flightFeather(fan,length,width*(.030-row*.003),base,sign*(-.14+n*.08),n+row*7);}
    mergeFeathers(fan,'Merged layered green gold orange flight feathers');
    (fan.children[0] as THREE.Mesh).geometry.translate(-forearm.position.x,-forearm.position.y,-forearm.position.z);
    for(const [bone,colour] of [[upper,'gold'],[forearm,'gold']] as const){const coverts=new THREE.Group();bone.add(coverts);for(let row=0;row<3;row++)for(let n=0;n<5;n++){const base=new THREE.Vector3(.045+Math.sin(n)*.002,(n-2)*width*.025,-height*(.015+row*.030)),length=height*(.073+.009*Math.sin(n+row*1.7));flightFeather(coverts,length,width*.034,base,(n-2)*.035,n+row*5,colour);}mergeFeathers(coverts,'Overlapping broad wing coverts');}
    for(const [parent,center,radii,count,seed,color] of [[upper,new THREE.Vector3(.008,sign*.010,-height*.065),new THREE.Vector3(.048,width*.071,height*.085),440,sign<0?241:548,'#d5b746'],[forearm,new THREE.Vector3(.020,0,-height*.056),new THREE.Vector3(.041,width*.067,height*.075),360,sign<0?814:997,'#d5a62f']] as const){
      const groom=createFeatherGroom({radii:[radii.x,radii.y,radii.z],count,length:height*.031,width:width*.010,rootColor:parent===upper?'#a18b2a':'#a5831b',color,tipColor:parent===upper?'#eccb59':'#eac044',flow:[0,0,-1],seed});groom.position.copy(center);parent.add(groom);
    }
    for(let digit=0;digit<4;digit++){
      if(palmGeometry&&digit>0)continue;
      const owner=digit===0?finger:hand,dx=.038+(digit%2)*.006,dy=sign*(digit-1.5)*width*.024,radius=height*(digit===0?.014:.012),length=height*(digit===0?.064:.040);
      const shaft=new THREE.CapsuleGeometry(radius,length,5,12);shaft.rotateX(Math.PI/2);shaft.translate(dx,dy,-height*.061-length*.32);const digitMesh=mesh(owner,shaft,yellow,`Curled feather digit ${digit}`);digitMesh.rotation.y=(digit-1.5)*.085;
      const nailBase=-height*.061-length*.82-radius*.4;
      const curve=new THREE.CatmullRomCurve3([new THREE.Vector3(dx,dy,nailBase),new THREE.Vector3(dx+.008,dy,nailBase-radius*.85),new THREE.Vector3(dx+.022,dy,nailBase-radius*1.9)]);
      const tipGeometry=new THREE.TubeGeometry(curve,10,radius*.9,10,false),tipPositions=tipGeometry.getAttribute('position');
      for(let i=0;i<tipPositions.count;i++){const ring=Math.floor(i/11),t=ring/10,center=curve.getPointAt(t);const p=new THREE.Vector3().fromBufferAttribute(tipPositions,i).sub(center).multiplyScalar(1-t*.9).add(center);tipPositions.setXYZ(i,p.x,p.y,p.z);}tipGeometry.computeVertexNormals();mesh(owner,tipGeometry,dark,`Curved charcoal finger tip ${digit}`);
    }
    sides.push({sign,upper,forearm,hand,finger,fan,palm,shoulder});
  }
  let geometryVertices=0;for(const side of sides)side.upper.traverse(object=>{if(object instanceof THREE.Mesh)geometryVertices+=object.geometry.getAttribute('position').count;});
  const restReach:THREE.Vector3[]=[];
  const diagnostics={removedTriangles,geometryVertices,authoredJointedWings:true,leftReach:[0,0,0],rightReach:[0,0,0],leftWorldReach:[0,0,0],rightWorldReach:[0,0,0],maxDisplacement:0};
  function update(kind:PerformanceGesture,amount:number){
    const a=kind==='rest'?0:THREE.MathUtils.clamp(amount,0,1);
    diagnostics.maxDisplacement=0;
    for(const [index,side] of sides.entries()){
      const {sign,upper,forearm,hand,finger,fan,palm,shoulder}=side;let shoulderAngle=0,elbowAngle=0,depthAngle=0,handAngle=0,depth=0;
      if(kind==='point'&&sign<0){shoulderAngle=-.33;elbowAngle=2.63;depthAngle=-.75;handAngle=.22;}
      else if(kind==='stretch'){shoulderAngle=sign*.98;elbowAngle=sign*.11;depthAngle=-.08;handAngle=sign*.1;}
      else if(kind==='crossed'){shoulderAngle=0;elbowAngle=-sign*1.73;depthAngle=-.35;handAngle=sign*.15;depth=sign<0?.085:.045;}
      upper.position.copy(shoulder);upper.position.x+=depth*a;if(kind==='crossed'&&sign<0)upper.position.z+=height*.025*a;upper.rotation.x=shoulderAngle*a;forearm.rotation.set(elbowAngle*a,depthAngle*a,0);hand.rotation.x=handAngle*a;forearm.scale.z=kind==='crossed'?1+a*.48:1;
      finger.rotation.x=kind==='point'&&sign<0?a*.35:0;finger.position.z=kind==='point'&&sign<0?-height*.034*a:0;fan.rotation.x=kind==='stretch'?sign*a*.32:kind==='point'&&sign<0?-a*2.1:0;upper.updateMatrixWorld(true);
      palm.rotation.x=Math.PI+(kind==='point'&&sign<0?.62*a:0);finger.visible=!palmGeometry||(kind==='point'&&sign<0&&a>.02);
      const reach=new THREE.Vector3();hand.getWorldPosition(reach);(sign<0?diagnostics.leftWorldReach:diagnostics.rightWorldReach).splice(0,3,reach.x,reach.y,reach.z);root.worldToLocal(reach);if(!restReach[index])restReach[index]=reach.clone();diagnostics.maxDisplacement=Math.max(diagnostics.maxDisplacement,reach.distanceTo(restReach[index]));(sign<0?diagnostics.leftReach:diagnostics.rightReach).splice(0,3,reach.x,reach.y,reach.z);
    }
  }
  update('rest',0);root.userData.articulatedWings=diagnostics;return {update,diagnostics};
}
