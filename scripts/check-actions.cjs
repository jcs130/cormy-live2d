// Regression gates for the actual native model: independent limbs, emote
// clipping/lifecycle and the ear-to-lantern attachment under combined controls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),file=p=>path.join(root,p),read=p=>JSON.parse(fs.readFileSync(file(p),'utf8'));
const coreFile=process.env.CUBISM_CORE_JS||file('verification/vendor/live2dcubismcore.min.js');
const core=new Function('require','module','exports','__dirname',fs.readFileSync(coreFile,'utf8')+'\nreturn Live2DCubismCore;')(require,{}, {},path.dirname(coreFile));
(async()=>{
 const deadline=Date.now()+5000;for(;;){try{core.Version.csmGetVersion();break;}catch(e){if(Date.now()>deadline)throw e;await new Promise(r=>setTimeout(r,30));}}
 const bytes=fs.readFileSync(file('VTubeStudio/Cormy/Cormy.moc3')),moc=core.Moc.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),model=core.Model.fromMoc(moc),p=model.parameters,d=model.drawables,ppu=model.canvasinfo.PixelsPerUnit;
 const names=read('source/drawable-names.json'),mesh=name=>d.ids.indexOf(Object.keys(names).find(id=>names[id]===name));
 const set=(id,v)=>{const i=p.ids.indexOf(id);assert(i>=0,id);assert(v>=p.minimumValues[i]-.00001&&v<=p.maximumValues[i]+.00001,'Out of range '+id);p.values[i]=v;};
 const defaults=Float32Array.from(p.defaultValues),reset=()=>{p.values.set(defaults);model.update();},geometry=()=>d.vertexPositions.map(v=>Float32Array.from(v));
 const point=(positions,i)=>[positions[i*2]*ppu+model.canvasinfo.CanvasOriginX,model.canvasinfo.CanvasOriginY-positions[i*2+1]*ppu];
 reset();const neutral=geometry(),report={revision:'6.7',createdAt:new Date().toISOString(),modelSha256:crypto.createHash('sha256').update(bytes).digest('hex'),limbs:[],effects:[],motionFrames:0,failures:[]};
 for(const [id,name] of [['ParamArmRA','arm-r'],['ParamArmRB','arm-r'],['ParamHandR','arm-r'],['ParamArmLA','arm-l'],['ParamArmLB','arm-l'],['ParamHandL','arm-l'],['ParamLegRA','leg-r'],['ParamLegRB','leg-r'],['ParamFootR','leg-r'],['ParamLegLA','leg-l'],['ParamLegLB','leg-l'],['ParamFootL','leg-l']]){
  reset();set(id,id.includes('Arm')?20:id.includes('Hand')?12:4);model.update();let own=0,others=0;
  for(let j=0;j<d.count;j++)for(let k=0;k<d.vertexPositions[j].length;k++){const delta=Math.abs(d.vertexPositions[j][k]-neutral[j][k])*ppu;if(j===mesh(name))own=Math.max(own,delta);else others=Math.max(others,delta);}
  assert(own>.5,'Limb is not actually bound: '+id);assert(others<.02,'Limb drags unrelated artwork: '+id);report.limbs.push({id,mesh:name,maxMotionPx:own,unrelatedMotionPx:others});
 }
 for(const [id,name] of [['ParamFxAnger','face detail fx anger'],['ParamFxSweat','face detail fx sweat'],['ParamFxHeart','face detail fx hearts'],['ParamFxSparkle','face detail fx sparkles'],['ParamFxStarEyes','face detail fx star-l'],['ParamFxStarEyes','face detail fx star-r']]){
  const index=mesh(name);assert(index>=0,name);reset();assert.equal(d.opacities[index],0,'Emote visible in neutral '+name);set(id,1);model.update();assert.equal(d.opacities[index],1,'Emote not shown '+name);
  if(id==='ParamFxStarEyes'){
   const side=name.endsWith('-l')?'L':'R',masks=Array.from(d.masks[index],j=>d.ids[j]);assert.deepEqual(masks,['ArtMeshEyewhite'+side],'Star lacks same-side eyelid mask');
   for(const blink of [0,.25,.5,.75,1])for(const x of [-1,0,1])for(const y of [-1,0,1]){set('ParamEye'+side+'Open',blink);set('ParamEyeBallX',x);set('ParamEyeBallY',y);model.update();assert(d.vertexPositions[index].every(Number.isFinite));if(blink===0)assert.equal(d.opacities[index],0,'Star persists with closed eyelid');}
  }
  reset();assert.equal(d.opacities[index],0,'Emote fails to clear '+name);report.effects.push({id,mesh:name,neutralHidden:true,activeShown:true,resetHidden:true,clipped:id==='ParamFxStarEyes'});
 }
 const physicsOutputs=new Set(read('VTubeStudio/Cormy/Cormy.physics3.json').PhysicsSettings.flatMap(s=>s.Output.map(o=>o.Destination.Id)));
 const actionMeta=read('actions.json');
 function linear(segments,t){let previous=[segments[0],segments[1]];for(let i=2;i<segments.length;i+=3){assert.equal(segments[i],0,'Check expects authored linear curves');const next=[segments[i+1],segments[i+2]];if(t<=next[0]){const a=Math.max(0,(t-previous[0])/(next[0]-previous[0]));return previous[1]+(next[1]-previous[1])*a;}previous=next;}return previous[1];}
 report.motionBounds=[];
 for(const action of actionMeta.actions){const data=read('VTubeStudio/Cormy/'+action.file);assert(!data.Meta.Loop);let bounds=[Infinity,Infinity,-Infinity,-Infinity];
  for(const c of data.Curves){assert(!physicsOutputs.has(c.Id),'Action competes with physics');assert(!['ParamEyeLOpen','ParamEyeROpen','ParamMouthOpenY'].includes(c.Id));assert.equal(c.Segments[1],0);assert.equal(c.Segments.at(-1),0,'Motion does not end at neutral');}
  for(let frame=0;frame<=Math.ceil(action.duration*30);frame++){reset();for(const c of data.Curves)set(c.Id,linear(c.Segments,frame/30));model.update();report.motionFrames++;assert(d.vertexPositions.every(v=>v.every(Number.isFinite)),'Nonfinite motion '+action.id);
   for(const name of ['arm-l','arm-r','leg-l','leg-r']){const positions=d.vertexPositions[mesh(name)];for(let i=0;i<positions.length/2;i++){const [x,y]=point(positions,i);bounds[0]=Math.min(bounds[0],x);bounds[1]=Math.min(bounds[1],y);bounds[2]=Math.max(bounds[2],x);bounds[3]=Math.max(bounds[3],y);}}
  }
  assert(bounds[0]>0&&bounds[1]>0&&bounds[2]<model.canvasinfo.CanvasWidth&&bounds[3]<model.canvasinfo.CanvasHeight,'Action leaves canvas '+action.id);report.motionBounds.push({id:action.id,bounds});
 }
 // Capture barycentric attachment landmarks in the actual neutral mesh. This
 // complements visual alpha overlap inspection; it is not an artwork proof.
 function landmark(name,target){const index=mesh(name),positions=neutral[index],indices=d.indices[index];let nearest=null;
  for(let k=0;k<indices.length;k+=3){const v=[indices[k],indices[k+1],indices[k+2]],a=point(positions,v[0]),b=point(positions,v[1]),c=point(positions,v[2]),den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);if(Math.abs(den)<1e-8)continue;
   const u=((b[1]-c[1])*(target[0]-c[0])+(c[0]-b[0])*(target[1]-c[1]))/den,w=((c[1]-a[1])*(target[0]-c[0])+(a[0]-c[0])*(target[1]-c[1]))/den,weights=[u,w,1-u-w];
   if(weights.every(v=>v>=-1e-5))return {index,vertices:v,weights,target,nearestDistance:0};
  }
  let distance=Infinity,vertex=-1;for(let j=0;j<positions.length/2;j++){const q=point(positions,j),n=Math.hypot(q[0]-target[0],q[1]-target[1]);if(n<distance){distance=n;vertex=j;}}
  return {index,vertices:[vertex],weights:[1],target,nearestDistance:distance};
 }
 function evaluated(mark){let x=0,y=0;for(let j=0;j<mark.vertices.length;j++){const q=point(d.vertexPositions[mark.index],mark.vertices[j]);x+=q[0]*mark.weights[j];y+=q[1]*mark.weights[j];}return [x,y];}
 const joints=[['ear-to-loop','ears-l','headwear connector',[627,88]],['loop-to-lantern','headwear connector','headwear',[628,101]]];report.lantern=[];
 for(const [name,left,right,target] of joints){const a=landmark(left,target),b=landmark(right,target);reset();const restA=evaluated(a),restB=evaluated(b),rest=[restA[0]-restB[0],restA[1]-restB[1]];let maxDrift=0,maxGap=0,checks=0;
  for(const ear of [-1,0,1])for(const turn of [-30,0,30])for(const tilt of [-15,0,15]){reset();set('ParamEarL',ear);set('ParamAngleX',turn);set('ParamAngleZ',tilt);model.update();const q=evaluated(a),r=evaluated(b);maxDrift=Math.max(maxDrift,Math.hypot(q[0]-r[0]-rest[0],q[1]-r[1]-rest[1]));maxGap=Math.max(maxGap,Math.hypot(q[0]-r[0],q[1]-r[1]));checks++;}
  assert(a.nearestDistance<1&&b.nearestDistance<1,'Attachment landmark outside authored mesh '+name);
  assert(Math.hypot(...rest)<1&&maxDrift<1,'Ear lamp attachment separates '+name);
  report.lantern.push({joint:name,sourceCanvasLandmark:target,nearestDistances:[a.nearestDistance,b.nearestDistance],neutralGap:Math.hypot(...rest),maxGap,maxRelativeDriftPx:maxDrift,checks});
 }
 report.earRoots=[];
 for(const [name,id] of [['ears-l','ParamEarL'],['ears-r','ParamEarR']]){
  const index=mesh(name),vertices=[];
  for(let i=0;i<neutral[index].length/2;i++)if(point(neutral[index],i)[1]>=100)vertices.push(i);
  assert(vertices.length>2,'No ear base vertices '+name);let maxDrift=0,checks=0;
  for(const turn of [-30,0,30])for(const tilt of [-15,0,15]){
   reset();set('ParamAngleX',turn);set('ParamAngleZ',tilt);model.update();const baseline=Float32Array.from(d.vertexPositions[index]);
   for(const ear of [-1,1]){set(id,ear);model.update();for(const v of vertices){const a=point(baseline,v),b=point(d.vertexPositions[index],v);maxDrift=Math.max(maxDrift,Math.hypot(a[0]-b[0],a[1]-b[1]));}checks++;}
  }
  assert(maxDrift<.05,'Ear base moves during ear flick '+name);
  report.earRoots.push({name,baseVertices:vertices.length,maxEarFlickDriftPx:maxDrift,checks});
 }
 report.eyeAperture=[];
 for(const side of ['L','R']){
  const i=d.ids.indexOf('ArtMeshEyewhite'+side),heights={};assert(i>=0);
  for(const open of [.5,1]){reset();set('ParamEye'+side+'Open',open);model.update();const ys=[];for(let v=0;v<d.vertexPositions[i].length/2;v++)ys.push(point(d.vertexPositions[i],v)[1]);heights[open]=Math.max(...ys)-Math.min(...ys);}
  assert(heights[1]>heights[.5]*1.4,'Fully open input fails to open eyelid '+side);
  report.eyeAperture.push({side,halfOpenHeightPx:heights[.5],fullyOpenHeightPx:heights[1]});
 }
 report.passed=true;fs.writeFileSync(file('action-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));model.release();moc._release();
})().catch(e=>{console.error(e);process.exitCode=1;});
