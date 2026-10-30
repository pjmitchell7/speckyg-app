import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createFeatherGroom, createFeatherMaterial } from './featherSurface';
import { createUniformMaterial, createCapMaterial } from './uniformSurface';
import type { AvatarRig, CharacterReaction } from './types';

/** Reference-led, dimensional SpeckyG sculpt. No portrait plane or borrowed character assets. */
export function createSpeckyG(): AvatarRig {
  const group=new THREE.Group();group.name='SpeckyG';
  const mat={
    yellow:createFeatherMaterial('#e6b22c'),golden:createFeatherMaterial('#ce9425'),light:createFeatherMaterial('#edbd37'),
    green:createFeatherMaterial('#58812d'),deepGreen:createFeatherMaterial('#315b27'),red:createFeatherMaterial('#b94124'),orange:createFeatherMaterial('#d7792b'),
    cloth:createUniformMaterial('#171916'),cap:createCapMaterial('#201d19'),edge:new THREE.MeshStandardMaterial({color:'#303126',roughness:.79}),
    leather:createCapMaterial('#0a0d0a'),beak:new THREE.MeshStandardMaterial({color:'#141c18',roughness:.55,metalness:.03}),
    black:new THREE.MeshStandardMaterial({color:'#070d0b',roughness:.58}),white:new THREE.MeshStandardMaterial({color:'#f2e7cb',roughness:.28}),
    iris:new THREE.MeshStandardMaterial({color:'#8b3d1c',roughness:.32}),irisRim:new THREE.MeshStandardMaterial({color:'#432619',roughness:.46}),
    gold:new THREE.MeshStandardMaterial({color:'#c69a3e',roughness:.31,metalness:.82}),goldDark:new THREE.MeshStandardMaterial({color:'#7d602d',roughness:.42,metalness:.67}),
    claws:new THREE.MeshStandardMaterial({color:'#0c120d',roughness:.46}),feet:new THREE.MeshStandardMaterial({color:'#272b1d',roughness:.80}),thread:new THREE.MeshStandardMaterial({color:'#d4cdb0',roughness:.89}),
  };
  mat.leather.roughness=.58;mat.leather.clearcoat=.08;
  type Material=keyof typeof mat;
  const batches=new Map<THREE.Group,Map<string,THREE.BufferGeometry[]>>();const transform=new THREE.Object3D();
  function add(parent:THREE.Group,geometry:THREE.BufferGeometry,material:Material,position=[0,0,0],scale=[1,1,1],rotation=[0,0,0],interaction=''){
    transform.position.set(...position as [number,number,number]);transform.scale.set(...scale as [number,number,number]);transform.rotation.set(...rotation as [number,number,number]);transform.updateMatrix();geometry.applyMatrix4(transform.matrix);
    let perParent=batches.get(parent);if(!perParent){perParent=new Map();batches.set(parent,perParent);}const key=`${material}:${interaction}`;const list=perParent.get(key)??[];list.push(geometry);perParent.set(key,list);
  }
  const sphere=()=>new THREE.SphereGeometry(1,24,18);
  function roundedBox(w:number,h:number,d:number,r=.025){
    const s=new THREE.Shape();s.moveTo(-w/2+r,-h/2);s.lineTo(w/2-r,-h/2);s.quadraticCurveTo(w/2,-h/2,w/2,-h/2+r);s.lineTo(w/2,h/2-r);s.quadraticCurveTo(w/2,h/2,w/2-r,h/2);s.lineTo(-w/2+r,h/2);s.quadraticCurveTo(-w/2,h/2,-w/2,h/2-r);s.lineTo(-w/2,-h/2+r);s.quadraticCurveTo(-w/2,-h/2,-w/2+r,-h/2);
    const g=new THREE.ExtrudeGeometry(s,{depth:d,bevelEnabled:true,bevelSize:.012,bevelThickness:.012,bevelSegments:2,curveSegments:6});g.translate(0,0,-d/2);return g;
  }
  function tube(points:number[][],radius:number,segments=14,sides=8){return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number]))),segments,radius,sides,false);}
  function taperedTube(points:number[][],radii:number[],steps=16,sides=9){
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p as [number,number,number])));const frames=curve.computeFrenetFrames(steps,false);const pos:number[]=[],uv:number[]=[],indices:number[]=[];
    for(let i=0;i<=steps;i++){const t=i/steps,p=curve.getPoint(t),r=t*(radii.length-1),j=Math.min(radii.length-2,Math.floor(r));const radius=THREE.MathUtils.lerp(radii[j],radii[j+1],r-j);
      for(let k=0;k<sides;k++){const angle=k/sides*Math.PI*2;const point=p.clone().addScaledVector(frames.normals[i],Math.cos(angle)*radius).addScaledVector(frames.binormals[i],Math.sin(angle)*radius);pos.push(...point.toArray());uv.push(k/sides,t);if(i<steps){const a=i*sides+k,b=i*sides+(k+1)%sides,c=(i+1)*sides+k,d=(i+1)*sides+(k+1)%sides;indices.push(a,b,c,b,d,c);}}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  /** Closed, cambered feather volume with a slender rachis, not a flat cutout. */
  function flightFeather(length:number,width:number,bend=.10){
    const pos:number[]=[],uv:number[]=[],indices:number[]=[];const steps=15,sides=8;
    for(let i=0;i<=steps;i++){const t=i/steps,w=Math.max(.001,width*Math.pow(Math.sin(t*Math.PI),.65)*(1-.22*t)),thickness=Math.max(.001,w*.13);const centerX=Math.sin(t*Math.PI)*width*.18;
      for(let k=0;k<sides;k++){const angle=k/sides*Math.PI*2;pos.push(centerX+Math.cos(angle)*w,-t*length,Math.sin(t*Math.PI)*bend+Math.sin(angle)*thickness);uv.push(k/sides,t);if(i<steps){const a=i*sides+k,b=i*sides+(k+1)%sides,c=(i+1)*sides+k,d=(i+1)*sides+(k+1)%sides;indices.push(a,b,c,b,d,c);}}
    }const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
  }
  function groom(parent:THREE.Group,radii:[number,number,number],position:[number,number,number],count:number,length:number,width:number,seed:number,extra:Partial<Parameters<typeof createFeatherGroom>[0]>={}){
    const g=createFeatherGroom({radii,count,length,width,seed,color:'#dfa72c',rootColor:'#a5701d',tipColor:'#edc045',...extra});g.position.set(...position);parent.add(g);return g;
  }
  // A curved skin patch follows the ocular globe. Its lower contour bends and slopes;
  // blinking moves the contour over the pupil instead of sliding a flat yellow slab.
  function shapeUpperLid(geometry:THREE.BufferGeometry,blink:number,scale:number,near:boolean){
    const positions=geometry.getAttribute('position');let vertex=0;const columns=24,rows=10;
    for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++){
      const u=column/columns*2-1,v=row/rows,arc=Math.sqrt(Math.max(0,1-u*u));
      const rest=(near?.055:.075)-(near?.045:-.025)*u;
      const edge=THREE.MathUtils.lerp(rest,-.275,blink)*arc;
      const y=THREE.MathUtils.lerp(edge,.275*arc,v)*scale,x=u*.258*scale;
      const z=.045+.17*Math.sqrt(Math.max(.002,1-Math.pow(x/(.27*scale),2)-Math.pow(y/(.285*scale),2)));
      positions.setXYZ(vertex++,x,y,z);
    }
    positions.needsUpdate=true;geometry.computeVertexNormals();
  }
  function upperLidGeometry(scale:number,near:boolean){
    const columns=24,rows=10,indices:number[]=[],uv:number[]=[];const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array((columns+1)*(rows+1)*3),3));for(let row=0;row<=rows;row++)for(let column=0;column<=columns;column++)uv.push(column/columns,row/rows);geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));
    for(let row=0;row<rows;row++)for(let column=0;column<columns;column++){const a=row*(columns+1)+column,b=a+1,c=a+columns+1,d=c+1;indices.push(a,b,c,b,d,c);}geometry.setIndex(indices);shapeUpperLid(geometry,0,scale,near);return geometry;
  }
  const body=new THREE.Group();body.name='body';group.add(body);
  const bodyOutline=[[.01,.40],[.32,.46],[.52,.75],[.61,1.13],[.59,1.52],[.46,1.83],[.24,1.97],[.01,1.99]].map(p=>new THREE.Vector2(...p as[number,number]));
  add(body,new THREE.LatheGeometry(new THREE.SplineCurve(bodyOutline).getPoints(34),36),'yellow',[0,0,0],[1,1,.82]);
  groom(body,[.59,.75,.45],[0,1.20,0],650,.10,.018,201,{exclude:(p)=>p.z>.08&&p.y>-.50});
  // Long red, orange and green tail flights arc down and to the viewer's left.
  for(let i=0;i<9;i++){
    const angle=-.56+i*.055;
    add(body,flightFeather(1.39+Math.sin(i*.6)*.15,.12,.18),i%3===0?'red':i%3===1?'orange':'green',[-.16+i*.025,.85,-.28],[1,1,1],[.50,0,angle]);
  }
  const vest=new THREE.Group();vest.name='fitted-canvas-vest';vest.position.z=.14;body.add(vest);
  // Fitted canvas vest: broad torso, narrow sewn details rather than a toy breastplate.
  add(vest,sphere(),'cloth',[0,1.25,.04],[.61,.66,.45]);
  add(vest,roundedBox(.032,.64,.022),'edge',[0,1.30,.493]);
  for(let i=0;i<20;i++)add(vest,roundedBox(.027,.012,.012,.003),'goldDark',[i%2?.012:-.012,1.02+i*.026,.512]);
  add(vest,roundedBox(.045,.077,.022,.009),'goldDark',[.012,1.22,.53]);
  for(const side of [-1,1]){
    add(vest,roundedBox(.34,.28,.10),'cloth',[side*.28,.91,.46],[1,1,1],[0,side*.08,side*.025]);
    add(vest,roundedBox(.35,.072,.11),'edge',[side*.28,1.045,.48],[1,1,1],[0,side*.08,side*.025]);
    add(vest,roundedBox(.105,.46,.056),'cloth',[side*.40,1.68,.28],[1,1,1],[.16,side*.17,side*.19]);
    add(vest,tube([[side*.49,1.73,.23],[side*.49,1.40,.34],[side*.48,1.14,.35]],.009),'edge');
    for(let i=0;i<10;i++)add(vest,roundedBox(.011,.015,.006,.002),'thread',[side*.44,1.23+i*.043,.40]);
  }
  // Source's white SPEC lettering, drawn as raised stitched paths in geometry.
  const glyphs:number[][][]=[[[.07,.09],[.01,.09],[0,.05],[.065,.035],[.065,0],[0,0]],[[0,0],[0,.09],[.06,.09],[.07,.065],[.06,.045],[0,.045]],[[.07,.09],[0,.09],[0,0],[.07,0]],[[.07,.085],[.015,.09],[0,.07],[0,.02],[.015,0],[.07,.005]]];
  for(let i=0;i<4;i++){const p=glyphs[i].map(v=>[-.43+i*.08+v[0],1.41+v[1],.492]);add(vest,tube(p,.008,12,6),'thread');if(i===2)add(vest,tube([[-.27,1.455,.492],[-.22,1.455,.492]],.008,3,6),'thread');}
  // Jamaican shield patch with an embroidered gold boundary.
  const flagShape=new THREE.Shape();flagShape.moveTo(-.13,.16);flagShape.lineTo(.13,.16);flagShape.lineTo(.12,-.055);flagShape.quadraticCurveTo(.08,-.15,0,-.20);flagShape.quadraticCurveTo(-.08,-.15,-.12,-.055);flagShape.closePath();
  const flag=new THREE.Group();flag.name='Jamaican-shield';flag.position.set(.29,1.49,.485);flag.rotation.y=.08;vest.add(flag);
  add(flag,new THREE.ExtrudeGeometry(flagShape,{depth:.016,bevelEnabled:true,bevelThickness:.005,bevelSize:.006,bevelSegments:2}),'goldDark');
  add(flag,new THREE.ShapeGeometry(flagShape),'deepGreen',[0,0,.027],[.88,.88,.88]);
  const tri=(p:number[][])=>{const s=new THREE.Shape();s.moveTo(...p[0] as[number,number]);p.slice(1).forEach(v=>s.lineTo(...v as[number,number]));s.closePath();return new THREE.ShapeGeometry(s);};
  add(flag,tri([[-.108,.11],[-.02,-.015],[-.09,-.12]]),'black',[0,0,.031]);add(flag,tri([[.108,.11],[.02,-.015],[.09,-.12]]),'black',[0,0,.031]);
  add(flag,tube([[-.108,.12],[0,-.015],[.08,-.14]],.012,10,6),'gold');add(flag,tube([[.108,.12],[0,-.015],[-.08,-.14]],.012,10,6),'gold');
  // Fine chain naturally drapes across the vest. Links alternate planes and remain individual volumes.
  for(let i=0;i<34;i++){
    const t=i/33,x=(t-.5)*.69,y=1.94-.77*Math.pow(Math.sin(t*Math.PI),.85),z=.40+.18*Math.sin(t*Math.PI);
    add(vest,new THREE.TorusGeometry(.025,.006,6,12),'gold',[x,y,z],[1,.83,1],[0,i%2?.80:0,0]);
  }
  const whistle=new THREE.Group();whistle.name='whistle';whistle.position.set(.035,1.11,.61);whistle.rotation.z=-.08;vest.add(whistle);
  add(whistle,new THREE.TorusGeometry(.042,.009,6,14),'gold',[0,.07,0]);add(whistle,new THREE.CylinderGeometry(.053,.055,.13,16),'gold',[0,-.03,0],[1,1,1],[Math.PI/2,0,0]);
  add(whistle,roundedBox(.067,.19,.074,.008),'gold',[.026,-.14,.018],[1,1,1],[.1,0,0]);add(whistle,roundedBox(.042,.024,.007,.003),'black',[.026,-.19,.06]);
  // Substantial feathered thighs and scaly gripping feet.
  for(const side of [-1,1]){
    add(body,sphere(),'golden',[side*.25,.46,.03],[.19,.30,.19]);groom(body,[.18,.25,.18],[side*.25,.49,.04],250,.085,.018,side<0?301:302);
    add(body,taperedTube([[side*.25,.32,.03],[side*.28,.19,.06],[side*.30,.10,.10]],[.094,.093,.103]),'feet');
    for(let i=0;i<5;i++)add(body,new THREE.TorusGeometry(.094,.011,5,12),'edge',[side*.28,.13+i*.033,.07],[1,1,1],[Math.PI/2,0,0]);
    for(let toe=-1;toe<=1;toe++){
      const x=side*.30+toe*.10;
      add(body,taperedTube([[side*.30,.12,.08],[x,.065,.17],[x+toe*.045,-.02,.25],[x+toe*.045,-.12,.27]],[.060,.057,.044,.025],16,10),'feet');
      add(body,taperedTube([[x+toe*.045,-.095,.26],[x+toe*.045,-.18,.29],[x+toe*.038,-.245,.20]],[.043,.030,.002],12,9),'claws');
      for(let scale=0;scale<4;scale++)add(body,sphere(),'edge',[x,.095-scale*.026,.14+scale*.031],[.047,.012,.025]);
    }
    add(body,taperedTube([[side*.27,.11,.08],[side*.32,.09,-.08],[side*.35,.04,-.18]],[.043,.036,.004]),'claws');
  }
  const wings:THREE.Group[]=[];
  for(const side of [-1,1]){
    const wing=new THREE.Group();wing.name=side<0?'wing-left':'wing-right';wing.position.set(side*.54,1.76,.01);body.add(wing);wings.push(wing);
    add(wing,sphere(),'yellow',[side*.06,-.33,0],[.24,.51,.25],[.08,0,side*.12],'wing');
    groom(wing,[.23,.45,.24],[side*.06,-.27,.02],480,.11,.020,side<0?401:402,{interaction:'wing',flow:[side*.18,-1,.08]});
    for(let i=0;i<7;i++){
      add(wing,flightFeather(.75-i*.025,.085,.09),i<2?'red':i<4?'orange':'green',[side*(-.045+i*.055),-.30+i*.03,.055],[1,1,1],[.12,0,side*(-.10+i*.07)],'wing');
      add(wing,flightFeather(.47-i*.02,.075,.065),i%2?'green':'deepGreen',[side*(-.025+i*.05),-.13+i*.015,.12],[1,1,1],[.12,0,side*(-.12+i*.08)],'wing');
    }
    if(side<0){
      // The source gesture is the rest pose: a feathered forward hand and raised index claw.
      add(wing,sphere(),'yellow',[-.10,-.30,.46],[.23,.28,.18],[0,.08,-.29],'wing');
      groom(wing,[.20,.28,.18],[-.10,-.29,.46],390,.065,.014,403,{interaction:'wing',flow:[.12,-1,0],exclude:p=>p.z>.10});
      add(wing,taperedTube([[-.19,-.15,.47],[-.22,-.015,.54],[-.23,.10,.59]],[.068,.061,.048],18,11),'yellow',[0,0,0],[1,1,1],[0,0,0],'wing');
      add(wing,taperedTube([[-.23,.075,.59],[-.26,.23,.65],[-.20,.31,.73]],[.054,.041,.002],16,11),'claws',[0,0,0],[1,1,1],[0,0,0],'wing');
      groom(wing,[.064,.13,.065],[-.21,-.02,.54],180,.045,.009,404,{interaction:'wing',flow:[0,1,.12]});
      // A separate foreshortened index projects at the viewer beside the upward thumb.
      add(wing,taperedTube([[-.11,-.14,.49],[.035,-.035,.69],[.10,.02,.84]],[.095,.08,.058],18,11),'yellow',[0,0,0],[1,1,1],[0,0,0],'wing');
      add(wing,taperedTube([[.09,.01,.81],[.15,.09,.96],[.18,.15,.96]],[.062,.042,.002],16,11),'claws',[0,0,0],[1,1,1],[0,0,0],'wing');
      groom(wing,[.10,.085,.17],[.035,-.055,.70],170,.07,.017,405,{interaction:'wing',flow:[.30,.30,1]});
      for(let i=0;i<2;i++){
        const y=-.33-i*.17;
        add(wing,taperedTube([[-.23,y+.025,.49],[-.065,y-.035,.64],[.075,y+.01,.69],[.10,y+.06,.65]],[.075,.070,.056,.037],17,10),'yellow',[0,0,0],[1,1,1],[0,0,-.10],'wing');
        add(wing,taperedTube([[.055,y+.015,.69],[.16,y+.055,.79],[.21,y+.12,.75]],[.049,.035,.002],13,9),'claws',[0,0,0],[1,1,1],[0,0,0],'wing');
        groom(wing,[.15,.055,.075],[-.065,y-.01,.62],145,.050,.011,410+i,{interaction:'wing',flow:[1,-.10,.1]});
      }
      add(wing,taperedTube([[-.17,-.42,.52],[-.28,-.32,.64],[-.26,-.24,.71]],[.075,.07,.025],13,10),'yellow',[0,0,0],[1,1,1],[0,0,0],'wing');
    }
  }
  // Large reference-proportioned fluffy head overlaps the shoulders and throat.
  const head=new THREE.Group();head.name='head';head.position.set(0,2.55,.045);head.rotation.z=-.035;body.add(head);
  add(head,sphere(),'yellow',[0,0,0],[.70,.72,.57],[0,0,0],'head');
  const eyeOpening=(p:THREE.Vector3)=>{
    const near=Math.pow((p.x+.40)/.29,2)+Math.pow((p.y-.17)/.29,2)<1&&p.z>.34;
    const far=Math.pow((p.x-.39)/.24,2)+Math.pow((p.y-.19)/.25,2)<1&&p.z>.32;
    const bill=Math.abs(p.x-.04)<.29&&p.y<.42&&p.y>-.50&&p.z>.43;
    return near||far||bill||p.y>.49;
  };
  groom(head,[.70,.72,.57],[0,0,0],1800,.085,.015,501,{interaction:'head',exclude:eyeOpening,flow:[-.08,-1,0]});
  for(const side of [-1,1]){
    add(head,sphere(),'green',[side*.57,.10,-.14],[.16,.44,.34],[0,0,side*.10],'head');
    groom(head,[.15,.40,.32],[side*.58,.09,-.13],330,.075,.014,side<0?511:512,{interaction:'head',color:'#5d872b',rootColor:'#375824',tipColor:'#8aa842',flow:[side*.15,-1,-.06]});
    // Cheek silhouette is made from overlapping pointed contour feathers, not
    // additional spherical pouches that turn the face into a rounded beard.
    for(let layer=0;layer<2;layer++)for(let i=0;i<7;i++){
      const length=.18+i*.012+(layer?-.02:0);
      add(head,flightFeather(length,.055,.028),i%3===0?'golden':'yellow',[side*(.43+i*.033),-.10-i*.050+layer*.04,.43-i*.025+layer*.025],[1,1,1],[.12,side*.15,side*(.42+i*.055)],'head');
    }
  }
  for(let row=0;row<3;row++)for(let feather=0;feather<9;feather++){
    const x=(feather-4)*.075;
    add(head,flightFeather(.20+row*.012,.052,.022),feather%4===0?'golden':'yellow',[x,-.35-row*.09,.47-Math.abs(x)*.34-row*.04],[1,1,1],[.12,0,x*.8],'head');
  }
  // Large multilayered colored crest originates behind the cap and fans up-left.
  for(let i=0;i<11;i++){
    const length=.77+i*.035,angle=-1.60-i*.115;
    add(head,flightFeather(length,.12+i*.003,.11),i<3?'red':i<5?'orange':i<8?'green':'light',[-.43+i*.006,.31+i*.015,-.30-i*.013],[1,1,1],[-.24+i*.025,.16,angle],'head');
    const shaft=tube([[0,0,0],[.01,-length*.5,.11],[0,-length*.91,.025]],.007,10,5);
    add(head,shaft,i<5?'golden':i<8?'deepGreen':'golden',[-.43+i*.006,.31+i*.015,-.29-i*.013],[1,1,1],[-.24+i*.025,.16,angle],'head');
  }
  type Eye={pivot:THREE.Group;iris:THREE.Group;upper:THREE.Mesh;lower:THREE.Mesh;near:boolean};const eyes:Eye[]=[];
  for(const near of [true,false]){
    const eye=new THREE.Group();eye.name=near?'eye-left':'eye-right';eye.position.set(near?-.405:.405,near?.14:.29,near?.435:.365);eye.rotation.set(0,near?-.20:.51,near?-.13:.06);head.add(eye);
    const scale=near?1:.65;
    add(eye,sphere(),'golden',[0,0,-.01],[.273*scale,.28*scale,.098],[0,0,0],'head');
    add(eye,sphere(),'white',[0,-.012,.035],[.242*scale,.249*scale,.102],[0,0,0],'head');
    const iris=new THREE.Group();iris.name='gaze';iris.position.set(near?.025:-.025,-.020,.133);eye.add(iris);
    add(iris,sphere(),'irisRim',[0,0,0],[.159*scale,.174*scale,.028],[0,0,0],'head');
    add(iris,sphere(),'iris',[0,0,.015],[.145*scale,.160*scale,.029],[0,0,0],'head');
    for(let i=0;i<22;i++){const angle=i/22*Math.PI*2;const curve=[[Math.cos(angle)*.095*scale,Math.sin(angle)*.10*scale,.044],[Math.cos(angle)*.137*scale,Math.sin(angle)*.15*scale,.035]];add(iris,tube(curve,.0028,3,4),'goldDark',[0,0,0],[1,1,1],[0,0,0],'head');}
    add(iris,sphere(),'black',[0,.002,.039],[.081*scale,.103*scale,.021],[0,0,0],'head');
    add(iris,sphere(),'white',[-.035,.059,.06],[.029,.031,.009],[0,0,0],'head');add(iris,sphere(),'white',[.035,-.044,.057],[.010,.012,.006],[0,0,0],'head');
    const upper=new THREE.Mesh(upperLidGeometry(scale,near),mat.golden);upper.name='upper-eyelid';upper.userData.interaction='head';eye.add(upper);
    const lower=new THREE.Mesh(new THREE.SphereGeometry(1,26,12,0,Math.PI*2,Math.PI/2,Math.PI/2),mat.yellow);lower.name='lower-eyelid';lower.scale.set(.254*scale,.028,.151);lower.position.set(0,-.242*scale,.057);lower.userData.interaction='head';lower.visible=false;eye.add(lower);
    const browPoints=near?[[-.255,.19,.035],[-.17,.24,.035],[-.015,.22,.045],[.22,.16,.04]]:[[-.19,.17,.035],[-.09,.22,.045],[.08,.21,.045],[.19,.15,.035]];
    add(eye,taperedTube(browPoints,[.019,.028,.022,.004],21,8),'golden',[0,0,-.015],[1,1,1],[0,0,0],'head');
    eyes.push({pivot:eye,iris,upper,lower,near});
  }
  // Heavy asymmetric bill: broad cere, long convex upper arc and sharp down-curved hook.
  const sections=[[.005,.47,.005,.47],[.13,.40,.12,.53],[.26,.27,.19,.62],[.35,.075,.265,.69],[.33,-.075,.265,.77],[.25,-.19,.19,.87],[.14,-.31,.12,.91],[.004,-.43,.003,.85]];
  const widthCurve=new THREE.CatmullRomCurve3(sections.map(p=>new THREE.Vector3(p[0],p[1],p[3]))),depthCurve=new THREE.CatmullRomCurve3(sections.map(p=>new THREE.Vector3(p[2],p[1],p[3])));
  const pos:number[]=[],uv:number[]=[],indices:number[]=[];const rings=46,sides=42;
  for(let row=0;row<=rings;row++){const t=row/rings,w=widthCurve.getPoint(t),d=depthCurve.getPoint(t);for(let k=0;k<sides;k++){const a=k/sides*Math.PI*2;pos.push(.045+.10*t*t+Math.max(.003,w.x)*Math.cos(a),w.y,w.z+Math.max(.003,d.x)*Math.sin(a));uv.push(k/sides,t);if(row<rings){const p=row*sides+k,q=row*sides+(k+1)%sides,r=(row+1)*sides+k,s=(row+1)*sides+(k+1)%sides;indices.push(p,q,r,q,s,r);}}}
  const bill=new THREE.BufferGeometry();bill.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));bill.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));bill.setIndex(indices);bill.computeVertexNormals();add(head,bill,'beak',[0,0,0],[1,1,1],[0,0,0],'head');
  add(head,sphere(),'black',[-.075,.305,.775],[.038,.052,.014],[0,-.38,-.22],'head');add(head,sphere(),'black',[.175,.305,.76],[.027,.045,.012],[0,.45,.18],'head');
  const jaw=new THREE.Group();jaw.name='lower-beak-hinge';jaw.position.set(.005,-.305,.55);head.add(jaw);
  add(jaw,sphere(),'beak',[-.085,.018,.035],[.245,.145,.18],[-.23,0,-.10],'head');add(jaw,sphere(),'black',[-.085,.084,.055],[.22,.018,.16],[0,0,0],'head');
  add(head,sphere(),'black',[-.045,-.225,.69],[.225,.018,.16],[0,0,0],'head');
  add(head,tube([[-.25,-.16,.70],[-.17,-.235,.81],[-.02,-.245,.86],[.12,-.20,.86]],.012,20,7),'black',[0,0,0],[1,1,1],[0,0,0],'head');
  // Peaked police cap with a shaped crown, thick band and cambered projecting visor.
  const cap=new THREE.Group();cap.name='police-cap';cap.position.set(-.025,.61,-.10);cap.rotation.set(.08,-.03,.22);head.add(cap);
  const crownPoints=[[.01,.04],[.65,.03],[.73,.15],[.79,.29],[.75,.39],[.58,.48],[.30,.50],[.01,.50]].map(p=>new THREE.Vector2(...p as[number,number]));
  const crown=new THREE.LatheGeometry(new THREE.SplineCurve(crownPoints).getPoints(28),42);const crownVertices=crown.getAttribute('position');
  for(let vertex=0;vertex<crownVertices.count;vertex++){const x=crownVertices.getX(vertex),y=crownVertices.getY(vertex),z=crownVertices.getZ(vertex);crownVertices.setXYZ(vertex,x+.13*Math.pow(Math.max(0,y/.5),2),y*1.22+.10*z+.045*x,z);}crown.computeVertexNormals();
  add(cap,crown,'cap',[0,0,0],[1,1,.78],[0,0,0],'head');
  add(cap,new THREE.CylinderGeometry(.677,.68,.18,42),'leather',[0,.015,.005],[1,1,.81],[0,0,0],'head');
  const brimShape=new THREE.Shape();brimShape.moveTo(-.62,.30);brimShape.lineTo(.62,.30);brimShape.bezierCurveTo(.78,.59,.48,.84,0,.86);brimShape.bezierCurveTo(-.48,.84,-.78,.59,-.62,.30);brimShape.closePath();
  const brim=new THREE.ExtrudeGeometry(brimShape,{depth:.026,bevelEnabled:true,bevelThickness:.005,bevelSize:.006,bevelSegments:3,curveSegments:18});brim.rotateX(Math.PI/2);
  const brimVertices=brim.getAttribute('position');for(let i=0;i<brimVertices.count;i++){const x=brimVertices.getX(i),z=brimVertices.getZ(i);brimVertices.setY(i,brimVertices.getY(i)-.025+.16*Math.pow(x/.68,2)-.13*Math.pow(z-.30,2));}brim.computeVertexNormals();add(cap,brim,'leather',[0,0,0],[1,1,1],[0,0,0],'head');
  add(cap,tube([[-.60,.06,.31],[-.47,.05,.49],[0,.045,.565],[.47,.05,.49],[.60,.06,.31]],.012,30,7),'goldDark',[0,0,0],[1,1,1],[0,0,0],'head');
  for(const side of [-1,1])add(cap,sphere(),'gold',[side*.60,.06,.31],[.027,.027,.016],[0,side*.7,0],'head');
  const badge=new THREE.Group();badge.name='embossed-police-badge';badge.position.set(0,.32,.592);badge.rotation.x=-.13;cap.add(badge);
  const shield=new THREE.Shape();shield.moveTo(-.16,.15);shield.quadraticCurveTo(-.09,.13,-.095,.205);shield.lineTo(-.04,.16);shield.lineTo(0,.23);shield.lineTo(.04,.16);shield.lineTo(.095,.205);shield.quadraticCurveTo(.09,.13,.16,.15);shield.lineTo(.145,-.075);shield.quadraticCurveTo(.105,-.18,0,-.22);shield.quadraticCurveTo(-.105,-.18,-.145,-.075);shield.closePath();
  add(badge,new THREE.ExtrudeGeometry(shield,{depth:.023,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:3,curveSegments:8}),'gold');add(badge,new THREE.ShapeGeometry(shield),'goldDark',[0,-.012,.038],[.76,.76,1]);
  add(badge,new THREE.TorusGeometry(.093,.009,7,28),'gold',[0,-.025,.047],[1,1.05,1]);
  const star=new THREE.Shape();for(let i=0;i<10;i++){const a=i*Math.PI/5+Math.PI/2,r=i%2?.033:.075;i?star.lineTo(Math.cos(a)*r,Math.sin(a)*r):star.moveTo(Math.cos(a)*r,Math.sin(a)*r);}star.closePath();add(badge,new THREE.ExtrudeGeometry(star,{depth:.013,bevelEnabled:true,bevelThickness:.003,bevelSize:.003,bevelSegments:1}),'gold',[0,-.025,.049]);
  for(const side of [-1,1])for(let leaf=0;leaf<5;leaf++)add(badge,sphere(),'gold',[side*(.102+Math.sin(leaf*.6)*.015),-.10+leaf*.043,.043],[.018,.034,.006],[0,0,side*-.48]);
  // Merge static detail by material within each articulated part.
  for(const[parent,collection]of batches)for(const[key,geometries]of collection){const[material,interaction]=key.split(':');const compatible=geometries.map(g=>g.index?g.toNonIndexed():g);const merged=mergeGeometries(compatible,false);if(!merged)throw new Error('SpeckyG geometry merge failed');const mesh=new THREE.Mesh(merged,mat[material as Material]);mesh.name=`${parent.name}-${material}`;if(interaction)mesh.userData.interaction=interaction;parent.add(mesh);for(const g of new Set([...geometries,...compatible]))g.dispose();}
  group.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  let reaction:CharacterReaction|null=null,reactionTime=0,jawLevel=0;const smooth=(a:number,b:number,dt:number,s=10)=>THREE.MathUtils.lerp(a,b,1-Math.exp(-s*dt));
  return{group,react(kind){reaction=kind;reactionTime=0;},update(dt,time,state,mood,amplitude,reduced){
    dt=Math.min(Math.max(dt,0),.08);reactionTime+=dt;const gentle=mood==='gentle'||mood==='thoughtful',active=!reduced&&!gentle;const strength=reaction&&reactionTime<2.2?Math.sin(Math.min(1,reactionTime/.24)*Math.PI/2)*Math.min(1,(2.2-reactionTime)/.4):0;if(reactionTime>=2.2)reaction=null;
    body.position.y=active?Math.sin(time*1.55)*.008:0;body.rotation.z=active&&reaction==='dance'?Math.sin(reactionTime*6)*.035*strength:0;
    const gazeX=THREE.MathUtils.clamp(Number(group.userData.gazeX)||0,-1,1),gazeY=THREE.MathUtils.clamp(Number(group.userData.gazeY)||0,-1,1);
    head.rotation.z=smooth(head.rotation.z,-.035+(state==='listening'?-.035:0)+(active&&reaction==='head'?-.11*strength:0),dt,5);
    head.rotation.y=smooth(head.rotation.y,(reduced?0:gazeX*.045)+(active&&reaction==='head'?.09*strength:0),dt,5);head.rotation.x=smooth(head.rotation.x,state==='thinking'?.035:reduced?0:-gazeY*.018,dt,5);
    const phase=time%4.9,blink=phase<.17?Math.sin(phase/.17*Math.PI):0;
    for(const eye of eyes){shapeUpperLid(eye.upper.geometry,blink,eye.near?1:.65,eye.near);eye.lower.visible=false;eye.iris.position.x=smooth(eye.iris.position.x,(eye.near?.025:-.025)+(reduced?0:gazeX*.021),dt,7);eye.iris.position.y=smooth(eye.iris.position.y,-.020+(reduced?0:gazeY*.015),dt,7);}
    jawLevel=state==='speaking'?smooth(jawLevel,THREE.MathUtils.clamp(amplitude,0,1),dt,25):0;jaw.rotation.x=jawLevel*.38;
    for(let i=0;i<wings.length;i++){let lift=0;if(active&&reaction==='greet'&&i===0)lift=(.17+Math.sin(reactionTime*8)*.045)*strength;if(active&&reaction==='wing')lift=.23*strength;if(active&&reaction==='dance')lift=(.09+Math.sin(reactionTime*6+i)*.06)*strength;wings[i].rotation.z=smooth(wings[i].rotation.z,(i===0?-1:1)*lift,dt,8);wings[i].rotation.x=smooth(wings[i].rotation.x,lift*.15,dt,8);}
    whistle.rotation.z=-.08+(active?Math.sin(time*1.55)*.012:0);
  }};
}
