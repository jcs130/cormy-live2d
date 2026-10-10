// Read-only compatibility check using a locally downloaded official Cubism Core.
// The proprietary Core is not included in the deliverable.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const [corePath, mocPath] = process.argv.slice(2);
const source = fs.readFileSync(corePath, 'utf8');
const core = new Function('require', 'module', 'exports', '__dirname', source + '\nreturn Live2DCubismCore;')(require, {}, {}, path.dirname(corePath));
async function main() {
// The browser Core initializes its embedded WASM asynchronously.
const deadline = Date.now() + 5000;
for (;;) {
  try { core.Version.csmGetVersion(); break; } catch (error) {
    if (Date.now() >= deadline) throw error;
    await new Promise(resolve => setTimeout(resolve, 30));
  }
}
const bytes = fs.readFileSync(mocPath);
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const moc = core.Moc.fromArrayBuffer(buffer);
if (!moc) throw new Error('Official Cubism Core rejected the MOC');
const model = core.Model.fromMoc(moc);
if (!model) throw new Error('Official Cubism Core could not create a model');
model.update();
const report = {
  revision: '6.7', createdAt: new Date().toISOString(),
  modelSha256: crypto.createHash('sha256').update(bytes).digest('hex'),
  coreVersion: core.Version.csmGetVersion(),
  mocVersion: core.Version.csmGetMocVersion(moc, buffer),
  parameterCount: model.parameters.count,
  drawableCount: model.drawables.count,
  parameters: model.parameters.ids,
  drawableIds: model.drawables.ids,
  finiteVertices: model.drawables.vertexPositions.every(p => Array.from(p).every(Number.isFinite)),
  irisMasks: model.drawables.ids.flatMap((id,i) => /ArtMeshIrides/.test(id)?[{id, masks:Array.from(model.drawables.masks[i]).map(index=>model.drawables.ids[index])}]:[]),
};
for(const iris of report.irisMasks) {
  const expected=iris.id.replace('Irides','Eyewhite');
  if(iris.masks.length!==1||iris.masks[0]!==expected)throw new Error('Iris mask does not match its eyelid: '+iris.id);
}
if (!report.finiteVertices || report.drawableCount < 22) throw new Error('Invalid drawable data');
const defaults = Float32Array.from(model.parameters.defaultValues);
const reset = () => { model.parameters.values.set(defaults); model.update(); };
const geometry = () => model.drawables.vertexPositions.map(p => Float32Array.from(p));
reset();
const baseline = geometry();
report.canvasInfo = model.canvasinfo;
const tailIndex=model.drawables.ids.indexOf('ArtMeshTail');
if(tailIndex<0)throw new Error('Missing actual tail mesh');
const ppu=model.canvasinfo.PixelsPerUnit;
const canvasPoint=(array,i)=>[array[2*i]*ppu+model.canvasinfo.CanvasOriginX,model.canvasinfo.CanvasOriginY-array[2*i+1]*ppu];
const neutralTail=baseline[tailIndex];
const rootPoint=[621.34136,724.1035];
let anchor=-1,nearest=Infinity;
for(let i=0;i<neutralTail.length/2;i++) {
  const p=canvasPoint(neutralTail,i),distance=Math.hypot(p[0]-rootPoint[0],p[1]-rootPoint[1]);
  if(distance<nearest){nearest=distance;anchor=i;}
}
if(nearest>1)throw new Error('Tail root landmark no longer matches artwork: '+nearest);
const restAnchor=canvasPoint(neutralTail,anchor);
report.tailRoot={authoredCanvasRoot:rootPoint,nearestMeshVertex:anchor,restCanvasPoint:restAnchor,landmarkDistancePx:nearest,checks:[]};
for(const id of ['ParamTail1','ParamTail2','ParamTail3','ParamSkelTailSwing']) {
  const parameter=model.parameters.ids.indexOf(id);
  for(const value of [model.parameters.minimumValues[parameter],model.parameters.maximumValues[parameter]]) {
    reset();model.parameters.values[parameter]=value;model.update();
    const posedTail=model.drawables.vertexPositions[tailIndex],root=canvasPoint(posedTail,anchor);
    let maximumMotion=0,otherMotion=0;
    for(let i=0;i<posedTail.length;i++)maximumMotion=Math.max(maximumMotion,Math.abs(posedTail[i]-neutralTail[i])*ppu);
    for(let d=0;d<model.drawables.count;d++)if(d!==tailIndex)for(let i=0;i<baseline[d].length;i++)otherMotion=Math.max(otherMotion,Math.abs(model.drawables.vertexPositions[d][i]-baseline[d][i])*ppu);
    report.tailRoot.checks.push({id,value,rootDriftPx:Math.hypot(root[0]-restAnchor[0],root[1]-restAnchor[1]),maximumTailMotionPx:maximumMotion,otherMeshMotionPx:otherMotion});
  }
}
report.tailRoot.maxDriftPx=Math.max(...report.tailRoot.checks.map(c=>c.rootDriftPx));
report.tailRoot.otherMeshesStable=report.tailRoot.checks.every(c=>c.otherMeshMotionPx<.01);
report.poseChecks = [];
for (const id of ['ParamAngleX','ParamAngleY','ParamAngleZ','ParamEyeLOpen','ParamEyeROpen','ParamEyeBallX','ParamEyeBallY','ParamMouthOpenY','ParamTail1','ParamTail2','ParamTail3','ParamSkelTailSwing']) {
  const i = model.parameters.ids.indexOf(id);
  if (i < 0) throw new Error('Missing parameter ' + id);
  for (const value of [model.parameters.minimumValues[i], model.parameters.maximumValues[i]]) {
    reset();
    model.parameters.values[i] = value;
    model.update();
    let delta = 0;
    for (let d=0; d<model.drawables.count; d++) {
      const p = model.drawables.vertexPositions[d];
      if (!Array.from(p).every(Number.isFinite)) throw new Error('Nonfinite pose ' + id);
      for (let v=0; v<p.length; v++) delta = Math.max(delta, Math.abs(p[v]-baseline[d][v]));
    }
    report.poseChecks.push({id,value,maxVertexDelta:delta});
  }
}
reset();
const opacities = {};
for (const value of [0,1]) {
  model.parameters.values[model.parameters.ids.indexOf('ParamEyeLOpen')] = value;
  model.parameters.values[model.parameters.ids.indexOf('ParamEyeROpen')] = value;
  model.update();
  opacities[value] = Object.fromEntries(model.drawables.ids.map((id,i)=>[id,model.drawables.opacities[i]]).filter(([id])=>/EyeClose|Irides|Eyewhite/.test(id)));
}
report.eyeOpacities = opacities;
if (process.argv[4]) fs.writeFileSync(process.argv[4], JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report, null, 2));
model.release();
moc._release();
if(report.tailRoot.maxDriftPx>1||!report.tailRoot.otherMeshesStable)throw new Error('Tail root is not fixed to its authored attachment');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
