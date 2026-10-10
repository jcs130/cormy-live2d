// Native Core checks: expressions must alter geometry, preserve blinking and leave lip sync live.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),corePath=process.env.CUBISM_CORE_JS||path.join(root,'verification/vendor/live2dcubismcore.min.js');
const core=new Function('require','module','exports','__dirname',fs.readFileSync(corePath,'utf8')+'\nreturn Live2DCubismCore;')(require,{}, {},path.dirname(corePath));
(async()=>{
 const until=Date.now()+5000;for(;;){try{core.Version.csmGetVersion();break;}catch(e){if(Date.now()>until)throw e;await new Promise(r=>setTimeout(r,30));}}
 const bytes=fs.readFileSync(path.join(root,'VTubeStudio/Cormy/Cormy.moc3')),moc=core.Moc.fromArrayBuffer(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)),model=core.Model.fromMoc(moc),p=model.parameters,d=model.drawables;
 const physics=JSON.parse(fs.readFileSync(path.join(root,'VTubeStudio/Cormy/Cormy.physics3.json'))),physicsOutputs=new Set(physics.PhysicsSettings.flatMap(s=>s.Output.map(o=>o.Destination.Id)));
 const defaults=Float32Array.from(p.defaultValues),ppu=model.canvasinfo.PixelsPerUnit,manifest=JSON.parse(fs.readFileSync(path.join(root,'expressions.json')));
 const set=(id,value)=>{const i=p.ids.indexOf(id);assert(i>=0,'Missing parameter '+id);p.values[i]=value;};
 const snapshot=()=>d.vertexPositions.map(a=>Float32Array.from(a));
 const reset=()=>{p.values.set(defaults);model.update();};
 reset();const baseline=snapshot();
 function diff(id,from=baseline){const index=d.ids.indexOf(id);assert(index>=0,id);return Math.max(...d.vertexPositions[index].map((v,i)=>Math.abs(v-from[index][i])*ppu));}
 const report={revision:'6.7',createdAt:new Date().toISOString(),modelSha256:crypto.createHash('sha256').update(bytes).digest('hex'),parameters:p.count,drawables:d.count,checks:[],expressionChecks:[]};
 for(const [id,mesh] of [['ParamBrowLAngle','ArtMeshEyebrowL'],['ParamBrowRAngle','ArtMeshEyebrowR'],['ParamEyeSmile','ArtMeshEyeCloseL'],['ParamEyeWide','ArtMeshEyewhiteL'],['ParamMouthForm','ArtMeshMouthClose']]){
  reset();set(id,1);model.update();const motion=diff(mesh);assert(motion>.5,`${id} has no actual native deformation`);report.checks.push({id,mesh,maxMotionPx:motion});
 }
 const names=JSON.parse(fs.readFileSync(path.join(root,'source/drawable-names.json')));
 const blush=d.ids.indexOf(Object.keys(names).find(id=>names[id]==='blush'));assert(blush>=0);reset();const neutralOpacity=d.opacities[blush];set('ParamBlush',1);model.update();assert(neutralOpacity===0&&d.opacities[blush]===1,'Blush lifecycle');report.blush={neutralOpacity,activeOpacity:d.opacities[blush]};
 for(const entry of manifest.presets){
  const exp=JSON.parse(fs.readFileSync(path.join(root,'VTubeStudio/Cormy',entry.file)));assert(!exp.Parameters.some(e=>['ParamMouthOpenY','ParamEyeLOpen','ParamEyeROpen'].includes(e.Id)),'Expression overrides live mouth/blink');
  assert(exp.Parameters.every(e=>e.Blend==='Overwrite'),'Facial preset may accumulate');
  assert(!exp.Parameters.some(e=>physicsOutputs.has(e.Id)),'Expression conflicts with physics output');
  function apply(blink,mouth){p.values.set(defaults);set('ParamEyeLOpen',blink);set('ParamEyeROpen',blink);set('ParamMouthOpenY',mouth);for(const e of exp.Parameters){const index=p.ids.indexOf(e.Id);assert(index>=0);assert(['Overwrite','Add','Multiply'].includes(e.Blend));p.values[index]=e.Blend==='Multiply'?p.values[index]*e.Value:e.Blend==='Add'?p.values[index]+e.Value:e.Value;}model.update();assert(d.vertexPositions.every(v=>v.every(Number.isFinite)),'Nonfinite '+entry.id);assert.equal(p.values[p.ids.indexOf('ParamMouthOpenY')],mouth);if(blink===0){assert.equal(p.values[p.ids.indexOf('ParamEyeLOpen')],0);assert.equal(p.values[p.ids.indexOf('ParamEyeROpen')],0);}}
  apply(0,0);for(const eye of ['ArtMeshEyeCloseL','ArtMeshEyeCloseR'])assert.equal(d.opacities[d.ids.indexOf(eye)],1,'Blink not fully closed '+entry.id);
  apply(1,0);const closed=snapshot();apply(1,1);const mouthMotion=diff('ArtMeshMouthOpen',closed);assert(mouthMotion>1,'Lip frozen '+entry.id);
  for(const blink of [0,.5,1])for(const mouth of [0,1])for(const turn of [-30,0,30]){apply(blink,mouth);set('ParamAngleX',turn);model.update();assert(d.vertexPositions.every(v=>v.every(Number.isFinite)));}
  report.expressionChecks.push({id:entry.id,lipMotionPx:mouthMotion,blinkAndLipAndTurnCombinations:18});
 }
 // Reproduce VTS's last-activated overwrite policy, including prior active presets.
 // Each facial style must resolve to the latest preset, never accumulated eye multipliers.
 const expressionData=manifest.presets.map(e=>JSON.parse(fs.readFileSync(path.join(root,'VTubeStudio/Cormy',e.file))));
 let transitions=0;
 for(const first of expressionData)for(const second of expressionData){p.values.set(defaults);for(const exp of [first,second])for(const e of exp.Parameters)set(e.Id,e.Value);model.update();const stacked=snapshot(),opacities=Float32Array.from(d.opacities);p.values.set(defaults);for(const e of second.Parameters)set(e.Id,e.Value);model.update();for(const id of d.ids)assert(diff(id,stacked)<.001,'Residual style '+id);assert(opacities.every((v,i)=>Math.abs(v-d.opacities[i])<.00001));transitions++;}
 report.expressionSwitchPairs=transitions;
 report.totalCombinations=report.expressionChecks.reduce((n,e)=>n+e.blinkAndLipAndTurnCombinations,0);
 report.passed=true;
 fs.writeFileSync(path.join(root,'expression-validation.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report,null,2));model.release();moc._release();
})().catch(e=>{console.error(e);process.exitCode=1;});
