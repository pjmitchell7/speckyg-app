import * as THREE from 'three';

/** Small source-authored fabric/leather height field, without browser-only APIs. */
function surface(kind:'canvas'|'leather') {
  const size=128;
  const color=new Uint8Array(size*size*4),height=new Uint8Array(size*size*4);
  let seed=kind==='canvas'?1709:5711;
  const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647;};
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const warp=Math.cos(x*Math.PI/2),weft=Math.cos(y*Math.PI/2);
    const noise=random()-.5;
    const h=kind==='canvas'?.5+warp*.10+weft*.1+noise*.11:.5+noise*.23+Math.sin(x*.4+Math.sin(y*.22))*.045;
    const value=kind==='canvas'?.91+noise*.09+(warp+weft)*.015:.95+noise*.035;
    const i=(y*size+x)*4;
    color[i]=Math.round(255*value);color[i+1]=Math.round(253*value);color[i+2]=Math.round(248*value);color[i+3]=255;
    height[i]=height[i+1]=height[i+2]=Math.round(h*255);height[i+3]=255;
  }
  const map=new THREE.DataTexture(color,size,size,THREE.RGBAFormat),bumpMap=new THREE.DataTexture(height,size,size,THREE.RGBAFormat);
  map.colorSpace=THREE.SRGBColorSpace;
  for(const texture of [map,bumpMap]){texture.wrapS=texture.wrapT=THREE.RepeatWrapping;texture.repeat.set(kind==='canvas'?7:4,kind==='canvas'?7:4);texture.generateMipmaps=true;texture.minFilter=THREE.LinearMipmapLinearFilter;texture.magFilter=THREE.LinearFilter;texture.needsUpdate=true;}
  return {map,bumpMap};
}

export function createUniformMaterial(color:THREE.ColorRepresentation='#171b1b') {
  return new THREE.MeshStandardMaterial({color,...surface('canvas'),roughness:.91,metalness:0,bumpScale:.0025});
}
export function createCapMaterial(color:THREE.ColorRepresentation='#201d19') {
  return new THREE.MeshPhysicalMaterial({color,...surface('leather'),roughness:.43,metalness:.04,bumpScale:.0016,clearcoat:.22,clearcoatRoughness:.5});
}
