// Real Cubism Core regression: yaw must have zero effect, including combinations.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const coreFile=process.env.CUBISM_CORE_JS||path.join(root,'verification/vendor/live2dcubismcore.min.js');
const core=new Function('require','module','exports','__dirname',fs.readFileSync(coreFile,'utf8')+'\nreturn Live2DCubismCore;')(require,{}, {},path.dirname(coreFile));
const assert=(v,msg)=>{if(!v)throw Error(msg)};
(async()=>{
 const deadline=Date.now()+5000;for(;;){try{core.Version.csmGetVersion();break}catch(e){if(Date.now()>deadline)throw e;await new Promise(r=>setTimeout(r,30));}}
 const file=path.join(root,'VTubeStudio/Cormy/Cormy.moc3'),bytes=fs.readFileSync(file);
 const moc=core.Moc.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),m=core.Model.fromMoc(moc),p=m.parameters,d=m.drawables,ppu=m.canvasinfo.PixelsPerUnit;
 const read=name=>JSON.parse(fs.readFileSync(path.join(root,name),'utf8'));
 function sample(inputs){p.values.set(p.defaultValues);for(const[id,v]of Object.entries(inputs)){const i=p.ids.indexOf(id);assert(i>=0,'Unknown parameter '+id);p.values[i]=v;}m.update();return {vertices:d.vertexPositions.map(v=>Float32Array.from(v)),opacity:Float32Array.from(d.opacities),order:Int32Array.from(d.renderOrders)};}
 const expressionData=read('expressions.json').presets.map(e=>[e.id,read('VTubeStudio/Cormy/'+e.file)]);
 function expressed(data){const inputs={};for(const q of data.Parameters){const i=p.ids.indexOf(q.Id),base=p.defaultValues[i];inputs[q.Id]=q.Blend==='Multiply'?base*q.Value:q.Blend==='Add'?base+q.Value:q.Value;}return inputs;}
 let checks=0,maxDeltaPx=0,maxOpacityDelta=0,worstOpacity=null;
 for(const [name,data] of expressionData)for(const pitch of [-30,0,30])for(const mouth of [0,.6,1])for(const blink of [0,.25,1]){
  const inputs={...expressed(data),ParamAngleX:0,ParamAngleY:pitch,ParamMouthOpenY:mouth,ParamEyeLOpen:blink,ParamEyeROpen:blink,ParamBodyAngleX:10,ParamAngleZ:12};
  const rest=sample(inputs);
  for(const yaw of [-45,-30,-10,10,30,45]){
   const q=sample({...inputs,ParamAngleX:yaw});
   for(let i=0;i<d.count;i++){
    for(let j=0;j<q.vertices[i].length;j++){assert(Number.isFinite(q.vertices[i][j]),'Nonfinite geometry');maxDeltaPx=Math.max(maxDeltaPx,Math.abs(q.vertices[i][j]-rest.vertices[i][j])*ppu);}
    const opacityDelta=Math.abs(q.opacity[i]-rest.opacity[i]);
    if(opacityDelta>maxOpacityDelta){maxOpacityDelta=opacityDelta;worstOpacity={name,pitch,mouth,blink,yaw,drawable:d.ids[i],before:rest.opacity[i],after:q.opacity[i]};}
    assert(q.order[i]===rest.order[i],'Yaw changes render order: '+name);
   }
   checks++;
  }
 }
 assert(maxDeltaPx<.001,'Head yaw still changes geometry: '+maxDeltaPx+'px');
 assert(maxOpacityDelta<.00001,'Yaw still changes opacity: '+JSON.stringify({maxOpacityDelta,worstOpacity,maxDeltaPx}));
 let neutralMaxDeltaPx=null,baselineHash=null;
 const baseline=process.env.CORMY_BASELINE_MOC||path.join(root,'../live2d-v6.4/VTubeStudio/Cormy/Cormy.moc3');
 if(fs.existsSync(baseline)){
  const oldBytes=fs.readFileSync(baseline),oldMoc=core.Moc.fromArrayBuffer(oldBytes.buffer.slice(oldBytes.byteOffset,oldBytes.byteOffset+oldBytes.byteLength)),old=core.Model.fromMoc(oldMoc);
  old.parameters.values.set(old.parameters.defaultValues);old.update();const fresh=sample({});
  assert(JSON.stringify(old.drawables.ids)===JSON.stringify(d.ids),'Drawable contract changed');
  assert(JSON.stringify(old.parameters.ids)===JSON.stringify(p.ids),'Parameter contract changed');
  neutralMaxDeltaPx=0;
  for(let i=0;i<d.count;i++)for(let j=0;j<fresh.vertices[i].length;j++)neutralMaxDeltaPx=Math.max(neutralMaxDeltaPx,Math.abs(fresh.vertices[i][j]-old.drawables.vertexPositions[i][j])*ppu);
  assert(neutralMaxDeltaPx<.001,'Neutral artwork changed: '+neutralMaxDeltaPx);
  baselineHash=crypto.createHash('sha256').update(oldBytes).digest('hex');old.release();oldMoc._release();
 }
 const config=read('VTubeStudio/Cormy/Cormy.vtube.json'),profile=read('VTubeStudio/Cormy/cortico.profile.json');
 assert(!config.ParameterSettings.some(p=>p.OutputLive2D==='ParamAngleX'),'VTS still maps horizontal head rotation');
 assert(profile.wiring.FaceAngleX.scale===0&&profile.wiring.FaceAngleX.clamp.every(v=>v===0),'Agent profile still maps yaw');
 const report={revision:'6.7',createdAt:new Date().toISOString(),renderer:'Real Cubism Core',mocSha256:crypto.createHash('sha256').update(bytes).digest('hex'),baselineMocSha256:baselineHash,neutralMaxDeltaPx,combinedYawChecks:checks,maxYawGeometryDeltaPx:maxDeltaPx,maxYawOpacityDelta:maxOpacityDelta,trackingYawDisabled:true,passed:true};
 fs.writeFileSync(path.join(root,'no-head-turn-validation.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
 m.release();moc._release();
})().catch(e=>{console.error(e);process.exitCode=1});
