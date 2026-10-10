/* Independent vanilla layout/alpha checks of the delivered PNGs. No game startup. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const sharp=require(process.env.CORMY_SHARP||'sharp'),root=path.resolve(__dirname,'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function island(u,v,w,h,d){return [[u+d,v,w,d],[u+d+w,v,w,d],[u,v+d,d,h],[u+d,v+d,w,h],[u+d+w,v+d,d,h],[u+d+w+d,v+d,w,h]];}
async function main(){
  const report={checkedAt:new Date().toISOString(),skins:{},verified:[],notVerified:['Minecraft game login and server skin propagation','Visibility under equipped helmet or armor']};
  const images={};
  for(const variant of ['slim','classic']){
    const arm=variant==='slim'?3:4,file=path.join(root,`cormy-${variant}-64x64.png`);
    const {data,info}=await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    assert.equal(info.width,64);assert.equal(info.height,64);assert.equal(info.channels,4);
    const base=[...island(0,0,8,8,8),...island(16,16,8,12,4),...island(40,16,arm,12,4),...island(32,48,arm,12,4),...island(0,16,4,12,4),...island(16,48,4,12,4)];
    const layers=[island(32,0,8,8,8),island(16,32,8,12,4),island(40,32,arm,12,4),island(48,48,arm,12,4),island(0,32,4,12,4),island(0,48,4,12,4)];
    const allowed=new Set(),basePixels=new Set();let transparency=0;
    for(const [x,y,w,h]of base)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){
      const index=yy*64+xx;assert.equal(data[index*4+3],255,`${variant}: transparent mandatory texel ${xx},${yy}`);basePixels.add(index);allowed.add(index);
    }
    const outerPixels=layers.map(faces=>{let visible=0;for(const [x,y,w,h]of faces)for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const index=yy*64+xx;allowed.add(index);if(data[index*4+3])visible++;}assert(visible>0);return visible;});
    for(let index=0;index<4096;index++){const alpha=data[index*4+3];assert(alpha===0||alpha===255,'Skin alpha must remain discrete');if(!alpha)transparency++;if(!allowed.has(index))assert.equal(alpha,0,'Unused vanilla texels must remain transparent');}
    assert(transparency>0);images[variant]=data;
    report.skins[variant]={file:path.basename(file),dimensions:[64,64],armWidth:arm,baseOpaqueTexels:basePixels.size,outerVisibleTexels:outerPixels,transparentTexels:transparency,sha256:hash(file)};
  }
  // Model variants share the same head, body and legs, not a stretched conversion.
  for(const [x,y,w,h]of [...island(0,0,8,8,8),...island(32,0,8,8,8),...island(16,16,8,12,4),...island(16,32,8,12,4),...island(0,16,4,12,4),...island(0,32,4,12,4),...island(16,48,4,12,4),...island(0,48,4,12,4)])for(let yy=y;yy<y+h;yy++)for(let xx=x;xx<x+w;xx++){const i=(yy*64+xx)*4;assert(images.slim.subarray(i,i+4).equals(images.classic.subarray(i,i+4)),'Non-arm variant mismatch');}
  report.verified=['64x64 RGBA PNG','All 6 vanilla base cuboids opaque','All 6 vanilla overlay cuboids contain authored texels','Unused UV islands transparent','Only alpha 0 or 255','Slim/classic are authored at native 3/4 pixel arm widths','Head, torso and legs identical across variants'];
  fs.writeFileSync(path.join(root,'validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
main().catch(error=>{console.error(error);process.exitCode=1});
