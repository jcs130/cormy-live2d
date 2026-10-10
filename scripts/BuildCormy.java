import io.github.psd2live.core.*;
import io.github.psd2live.format.compile.*;
import java.lang.reflect.*;
import java.nio.file.*;
import java.util.*;
import org.umamo.runtime.model.*;
import org.umamo.edit.KeyformChannelsEdit;

public class BuildCormy {
  @SuppressWarnings("unchecked")
  static <T> T change(T original, Map<String,Object> edits) throws Exception {
    Class<?> c=original.getClass();
    Method copy=Arrays.stream(c.getMethods()).filter(m->!Modifier.isStatic(m.getModifiers())&&(m.getName().equals("copy")||m.getName().startsWith("copy-"))).findFirst().orElseThrow();
    List<Field> fields=Arrays.stream(c.getDeclaredFields()).filter(f->!Modifier.isStatic(f.getModifiers())&&!f.isSynthetic()).toList();
    if(fields.size()<copy.getParameterCount())throw new IllegalStateException("Data class field contract changed: "+c);
    // Constructor-backed properties precede computed caches; verify every component before copying.
    fields=fields.subList(0,copy.getParameterCount());
    Object[] values=new Object[fields.size()];
    Set<String> applied=new HashSet<>();
    for(int i=0;i<fields.size();i++) {
      Field field=fields.get(i);field.setAccessible(true);
      String component="component"+(i+1);
      Object value=Arrays.stream(c.getMethods()).filter(m->m.getName().equals(component)||m.getName().startsWith(component+"-")).findFirst().orElseThrow().invoke(original);
      if(!Objects.deepEquals(value,field.get(original)))throw new IllegalStateException("Component order changed: "+field.getName());
      if(edits.containsKey(field.getName())) {value=edits.get(field.getName());applied.add(field.getName());}
      values[i]=value;
    }
    if(!applied.equals(edits.keySet()))throw new IllegalArgumentException("Unknown copy properties "+edits.keySet());
    return (T)copy.invoke(original,values);
  }

  static String drawableId(Drawable d) throws Exception {
    return (String)Arrays.stream(d.getClass().getMethods()).filter(m->m.getName().startsWith("getId-")).findFirst().orElseThrow().invoke(d);
  }

  // Mesh deltas are in the parent deformer frame, never in screen pixels.
  static float[] extent(float[] positions) {
    float[] e={Float.POSITIVE_INFINITY,Float.POSITIVE_INFINITY,Float.NEGATIVE_INFINITY,Float.NEGATIVE_INFINITY};
    for(int i=0;i<positions.length;i+=2){e[0]=Math.min(e[0],positions[i]);e[1]=Math.min(e[1],positions[i+1]);e[2]=Math.max(e[2],positions[i]);e[3]=Math.max(e[3],positions[i+1]);}
    return e;
  }
  static RigEditOverlay meshKey(RigEditOverlay edits,String id,Map<String,Float> coordinate,float[] delta) {
    List<Float> values=new ArrayList<>();for(float v:delta)values.add(v);
    return edits.setKeyform(new RigKeyformSetEdit(new RigTargetRef(RigTargetKind.ART_MESH,id,null,null),coordinate,new RigKeyformGeometryEdit(null,null,null,null,null,values),null));
  }
  static float[] existing(Drawable d,float key) {
    KeyformGrid<MeshDeltaForm> grid=d.getGeometryGrid();
    if(grid.getAxes().isEmpty())return grid.getCells().get(0).getForm().getPositionDeltas().clone();
    float[] keys=grid.getAxes().get(0).getKeys();
    for(var cell:grid.getCells())if(Math.abs(keys[cell.getCoordinate()[0]]-key)<1e-5)return cell.getForm().getPositionDeltas().clone();
    throw new IllegalStateException("Missing original key "+key+" on "+d.getName());
  }
  static String nativeId(Object obj,String prefix) throws Exception {
    return (String)Arrays.stream(obj.getClass().getMethods()).filter(m->m.getName().startsWith(prefix+"-")).findFirst().orElseThrow().invoke(obj);
  }
  static int zeroIndex(KeyformAxis axis) {
    float[] keys=axis.getKeys();for(int i=0;i<keys.length;i++)if(Math.abs(keys[i])<1e-5)return i;
    throw new IllegalStateException("Missing zero pose");
  }
  static float[] lattice(KeyformGrid<WarpLatticeForm> grid,int[] coordinate) {
    for(var cell:grid.getCells())if(Arrays.equals(cell.getCoordinate(),coordinate))return cell.getForm().getControlPoints();
    throw new IllegalStateException("Missing lattice pose");
  }
  static RigEditOverlay disableHeadYaw(RigPreviewModel preview,RigEditOverlay edits) throws Exception {
    // Keep the zero-yaw geometry for every yaw key, preserving pitch and all
    // other axes. This lives in the editable rig and every exported MOC, so
    // another player cannot accidentally re-enable the rejected head warp.
    int flattened=0;
    for(Deformer deformer:preview.getRig().getPuppet().getDeformers()) {
      if(!(deformer instanceof Deformer.Warp warp))continue;
      String id=nativeId(warp,"getId");
      var grid=warp.getGeometryGrid();int xAxis=-1;
      for(int i=0;i<grid.getAxes().size();i++)
        if(nativeId(grid.getAxes().get(i),"getParameterId").equals("ParamAngleX"))xAxis=i;
      if(xAxis<0)continue;
      Float neutralOpacity=null;
      var opacityGrid=warp.getChannelGrids().get(FormChannel.OPACITY);
      if(opacityGrid!=null&&opacityGrid.getAxes().stream().anyMatch(axis->{
        try{return nativeId(axis,"getParameterId").equals("ParamAngleX");}catch(Exception e){throw new RuntimeException(e);}
      })) {
        // The generated far-ear fade is a yaw channel too, not geometry.
        if(opacityGrid.getAxes().size()!=1)throw new IllegalStateException("Unexpected multi-axis yaw opacity: "+id);
        int zero=zeroIndex(opacityGrid.getAxes().get(0));
        for(var cell:opacityGrid.getCells())if(cell.getCoordinate()[0]==zero)
          neutralOpacity=((ChannelValue.Scalar)cell.getForm()).getValue();
        if(neutralOpacity==null)throw new IllegalStateException("Missing neutral opacity: "+id);
      }
      for(var cell:grid.getCells()) {
        int[] key=cell.getCoordinate().clone(),zeroYaw=key.clone();
        zeroYaw[xAxis]=zeroIndex(grid.getAxes().get(xAxis));
        List<Float> points=new ArrayList<>();for(float p:lattice(grid,zeroYaw))points.add(p);
        Map<String,Float> coordinate=new LinkedHashMap<>();
        for(int i=0;i<key.length;i++)
          coordinate.put(nativeId(grid.getAxes().get(i),"getParameterId"),grid.getAxes().get(i).getKeys()[key[i]]);
        edits=edits.setKeyform(new RigKeyformSetEdit(new RigTargetRef(RigTargetKind.WARP_DEFORMER,id,null,null),coordinate,
          new RigKeyformGeometryEdit(points,null,null,null,null,null),
          neutralOpacity==null?null:new KeyformChannelsEdit(neutralOpacity,null,null,null,null,null,null)));
        flattened++;
      }
    }
    if(flattened==0)throw new IllegalStateException("No yaw keyforms found");
    System.out.println("Disabled horizontal head rotation in "+flattened+" warp keyforms");
    return edits;
  }
  static RigEditOverlay expressions(RigPreviewModel preview,RigEditOverlay edits) throws Exception {
    for(String id:List.of("ParamBrowLAngle","ParamBrowRAngle"))edits=edits.upsert(new RigParameterEdit(id,id,-1f,1f,0f,ParameterKind.NORMAL,false,true));
    for(String id:List.of("ParamEyeSmile","ParamEyeWide","ParamBlush"))edits=edits.upsert(new RigParameterEdit(id,id,0f,1f,0f,ParameterKind.NORMAL,false,true));
    for(String id:List.of("ParamEyeLStyle","ParamEyeRStyle"))edits=edits.upsert(new RigParameterEdit(id,id,0f,1f,1f,ParameterKind.NORMAL,false,true));
    for(String id:List.of("ParamFxAnger","ParamFxSweat","ParamFxHeart","ParamFxSparkle","ParamFxStarEyes","ParamFxPulse"))edits=edits.upsert(new RigParameterEdit(id,id,0f,1f,0f,ParameterKind.NORMAL,false,true));
    for(String id:List.of("ParamEarL","ParamEarR"))edits=edits.upsert(new RigParameterEdit(id,id,-1f,1f,0f,ParameterKind.NORMAL,false,true));
    for(Drawable d:preview.getRig().getPuppet().getDrawables()) {
      String id=drawableId(d);
      float[] positions=d.getMesh().getPositions(),e=extent(positions);
      Bounds b=preview.getRig().getSourceBoundsByDrawableId().get(id);
      float sx=(e[2]-e[0])/Math.max(1,b.getWidth()),sy=(e[3]-e[1])/Math.max(1,b.getHeight());
      float cx=(e[0]+e[2])/2,cy=(e[1]+e[3])/2;
      System.out.println("Mesh "+id+" vertices="+positions.length/2+" bounds="+b);
      // Ear, bow, connector and lantern share one measured ear pivot. Head
      // movement remains inherited from the existing head deformer hierarchy.
      if(d.getName().startsWith("ears-")||d.getName().startsWith("headwear")) {
        String side=d.getName().endsWith("-r")?"R":"L";
        float pivotX=side.equals("L")?590f:434f,pivotY=116f;
        for(float key:new float[]{-1f,0f,1f}) {
          float[] delta=new float[positions.length];double angle=Math.toRadians(key*6f*(side.equals("L")?1:-1));
          for(int v=0;v<positions.length;v+=2){float canvasY=b.getTop()+(positions[v+1]-e[1])/sy;
            float x=b.getLeft()+(positions[v]-e[0])/sx-pivotX,y=canvasY-pivotY;
            // Ear bases remain attached beneath the scalp. The same canvas-space
            // flex field also drives the connector and lantern, avoiding a new seam.
            float flex=Math.max(0f,Math.min(1f,(90f-canvasY)/37f));
            flex=flex*flex*(3f-2f*flex);
            delta[v]=(float)(x*(Math.cos(angle)-1)-y*Math.sin(angle))*sx*flex;
            delta[v+1]=(float)(x*Math.sin(angle)+y*(Math.cos(angle)-1))*sy*flex;}
          edits=meshKey(edits,id,Map.of("ParamEar"+side,key),delta);
        }
      }
      if(d.getName().startsWith("face detail fx ")) {
        String name=d.getName(),parameter=name.contains("anger")?"ParamFxAnger":name.contains("sweat")?"ParamFxSweat":name.contains("hearts")?"ParamFxHeart":name.contains("sparkles")?"ParamFxSparkle":"ParamFxStarEyes";
        if(parameter.equals("ParamFxStarEyes")) {
          String side=name.endsWith("-r")?"R":"L";
          for(float shown:new float[]{0f,1f})for(float blink:new float[]{0f,1f})for(float style:new float[]{0f,1f})
            edits=edits.setKeyform(new RigKeyformSetEdit(new RigTargetRef(RigTargetKind.ART_MESH,id,null,null),Map.of(parameter,shown,"ParamEye"+side+"Open",blink,"ParamEye"+side+"Style",style),null,new KeyformChannelsEdit(shown*blink*style,null,null,null,null,null,null)));
          for(float x:new float[]{-1f,0f,1f})for(float y:new float[]{-1f,0f,1f}) {
            float[] delta=new float[positions.length];for(int v=0;v<positions.length;v+=2){delta[v]=x*3.8f*sx;delta[v+1]=-y*3.7f*sy;}
            edits=meshKey(edits,id,Map.of("ParamEyeBallX",x,"ParamEyeBallY",y),delta);
          }
        } else {
          for(float shown:new float[]{0f,1f})edits=edits.setKeyform(new RigKeyformSetEdit(new RigTargetRef(RigTargetKind.ART_MESH,id,null,null),Map.of(parameter,shown),null,new KeyformChannelsEdit(shown,null,null,null,null,null,null)));
          for(float pulse:new float[]{0f,1f}){float[] delta=new float[positions.length];for(int v=0;v<positions.length;v+=2){delta[v]=(positions[v]-cx)*.07f*pulse;delta[v+1]=(positions[v+1]-cy)*.07f*pulse-4f*pulse*sy;}edits=meshKey(edits,id,Map.of("ParamFxPulse",pulse),delta);}
        }
      }
      if(id.startsWith("ArtMeshEyebrow")) {
        String side=id.endsWith("L")?"L":"R";
        for(float lift:new float[]{-1f,0f,1f})for(float angle:new float[]{-1f,0f,1f}) {
          float[] delta=existing(d,lift);
          // Positive = concerned inner brow lifted; negative = focused inner brow lowered.
          float signed=(side.equals("L")?1:-1)*angle;
          for(int v=0;v<positions.length;v+=2) {
            float x=(positions[v]-cx)/sx,y=(positions[v+1]-cy)/sy;
            double radians=signed*Math.toRadians(13);
            delta[v]+=(float)(x*(Math.cos(radians)-1)-y*Math.sin(radians))*sx;
            delta[v+1]+=(float)(x*Math.sin(radians)+y*(Math.cos(radians)-1))*sy;
          }
          edits=meshKey(edits,id,Map.of("ParamBrow"+side+"Y",lift,"ParamBrow"+side+"Angle",angle),delta);
        }
      } else if(id.equals("ArtMeshMouthClose")) {
        for(float form:new float[]{-1f,0f,1f}) {
          float[] delta=new float[positions.length];
          for(int v=0;v<positions.length;v+=2) {
            float x=(positions[v]-cx)/Math.max(1e-5f,(e[2]-e[0])/2);
            delta[v]=(positions[v]-cx)*.12f*form;
            delta[v+1]=-form*(form<0?5.3f:3.1f)*x*x*sy;
          }
          edits=meshKey(edits,id,Map.of("ParamMouthForm",form),delta);
        }
      } else if(id.startsWith("ArtMeshEyewhite")||id.startsWith("ArtMeshEyelash")) {
        String openness=id.endsWith("L")?"ParamEyeLOpen":"ParamEyeROpen";
        String styleId=id.endsWith("L")?"ParamEyeLStyle":"ParamEyeRStyle";
        for(float blink:new float[]{0f,1f})for(float style:new float[]{0f,1f})for(float happy:new float[]{0f,1f})for(float wide:new float[]{0f,1f}) {
          float open=blink*style;
          float[] delta=existing(d,open);
          for(int v=0;v<positions.length;v+=2) {
            float x=(positions[v]-cx)/Math.max(1e-5f,(e[2]-e[0])/2);
            float arch=Math.max(0,1-x*x),y=(positions[v+1]-e[1])/Math.max(1e-5f,e[3]-e[1]);
            float raiseClosed=12f*(1-open),raiseOpen=id.startsWith("ArtMeshEyewhite")?5f*y*open:0;
            delta[v+1]-=happy*arch*(raiseClosed+raiseOpen)*sy;
            delta[v+1]+=wide*open*(id.startsWith("ArtMeshEyewhite")?(positions[v+1]-cy)*.22f:-2.4f*sy);
          }
          edits=meshKey(edits,id,Map.of(openness,blink,styleId,style,"ParamEyeSmile",happy,"ParamEyeWide",wide),delta);
        }
      } else if(id.startsWith("ArtMeshEyeClose")) {
        for(float happy:new float[]{0f,1f}) {
          float[] delta=new float[positions.length];
          for(int v=0;v<positions.length;v+=2) {
            float x=(positions[v]-cx)/Math.max(1e-5f,(e[2]-e[0])/2);
            delta[v+1]=-happy*12f*Math.max(0,1-x*x)*sy;
          }
          edits=meshKey(edits,id,Map.of("ParamEyeSmile",happy),delta);
        }
        String openness=id.endsWith("L")?"ParamEyeLOpen":"ParamEyeROpen";
        String styleId=id.endsWith("L")?"ParamEyeLStyle":"ParamEyeRStyle";
        for(float blink:new float[]{0f,1f})for(float style:new float[]{0f,1f})edits=edits.setKeyform(new RigKeyformSetEdit(new RigTargetRef(RigTargetKind.ART_MESH,id,null,null),Map.of(openness,blink,styleId,style),null,new KeyformChannelsEdit(1-blink*style,null,null,null,null,null,null)));
      } else if(id.toLowerCase(Locale.ROOT).contains("blush")||d.getName().equals("blush")) {
        for(float visible:new float[]{0f,1f})edits=edits.setKeyform(new RigKeyformSetEdit(new RigTargetRef(RigTargetKind.ART_MESH,id,null,null),Map.of("ParamBlush",visible),null,new KeyformChannelsEdit(visible,null,null,null,null,null,null)));
      }
    }
    return edits;
  }

  public static void main(String[] args) throws Exception {
    Path root=Path.of(args[0]);
    Path input=root.resolve("source/Cormy.psd");
    PipelineConfig config=change(new PipelineConfig(),Map.of(
      "atlasSize",2048,"meshSpacing",40,"headTurnStrength",0.6f,"bodyStrength",0.45f,
      "mouthOutlineEnabled",false,"mouthShape","flat"));
    RigTuning tuning=config.getRigTuning();
    config=change(config,Map.of("rigTuning",tuning));
    StringJoiner tuningJson=new StringJoiner(",\n","{\n","\n}\n");
    for(var entry:tuning.toMap().entrySet())tuningJson.add("  \""+entry.getKey()+"\": "+entry.getValue());
    Files.writeString(root.resolve("source/rig-tuning.json"),tuningJson.toString());
    PSD2LivePipeline pipeline=new PSD2LivePipeline();
    RigPreviewModel base=pipeline.buildPreview(input,config);
    Map<String,LayerClassificationOverride> accessories=new HashMap<>();
    for(ClassifiedLayer layer:base.getAnalysis().getLayers())if(layer.getSource().getName().startsWith("headwear")) {
      Method getter=Arrays.stream(org.umamo.format.art.SourceLayer.class.getMethods()).filter(m->m.getName().startsWith("getId-")).findFirst().orElseThrow();
      accessories.put((String)getter.invoke(layer.getSource()),new LayerClassificationOverride(SemanticTag.EARWEAR,Side.LEFT));
    }
    if(accessories.size()!=2)throw new IllegalStateException("Ear lantern and connector must both be present");
    config=change(config,Map.of("layerOverrides",accessories));
    base=pipeline.buildPreview(input,config);
    SkeletonSpec skeleton=SkeletonAutoBuilder.INSTANCE.build(base.getAnalysis(),base.getRig());
    Files.writeString(root.resolve("source/skeleton-auto-before.json"),skeleton.toJson().toString());
    if(!skeleton.getEnabled())skeleton=change(skeleton,Map.of("enabled",true));
    // The headless whole-body layer fooled hip inference: its guessed root was near
    // the knee and its tail chain ran from the white tip toward the actual root.
    // Author the chain in PSD canvas pixels, starting at the narrow ginger root.
    // The complete body is one Topwear mesh, so inherit that mesh's body bone.
    float[][] tailPoints={{621.34136f,724.1035f},{710f,900f},{767f,1043f},{632f,1090f}};
    float[] tailLimits={14f,18f,22f};
    List<SkeletonBone> authored=new ArrayList<>();
    for(SkeletonBone bone:skeleton.getBones()) {
      if(bone.getRole()==BoneRole.TAIL) {
        int i=bone.getChainIndex()-1;
        if(i<0||i>=3)throw new IllegalStateException("Unexpected tail chain");
        bone=change(bone,Map.ofEntries(
          Map.entry("parentId",i==0?"upper_body":"tail_"+i),
          Map.entry("headX",tailPoints[i][0]),Map.entry("headY",tailPoints[i][1]),
          Map.entry("tailX",tailPoints[i+1][0]),Map.entry("tailY",tailPoints[i+1][1]),
          Map.entry("minAngle",-tailLimits[i]),Map.entry("maxAngle",tailLimits[i]),
          Map.entry("blendWidth",i==0?0f:32f),Map.entry("connected",i!=0)));
      }
      if(bone.getRole()==BoneRole.UPPER_BODY)bone=change(bone,Map.of("headX",513f,"headY",690f,"tailX",513f,"tailY",360f));
      if(bone.getRole()==BoneRole.LOWER_BODY)bone=change(bone,Map.of("headX",513f,"headY",690f,"tailX",513f,"tailY",800f));
      boolean left=bone.getSide()==Side.LEFT;
      float[][] arm=left?new float[][]{{642,364},{693,590},{758,760},{785,845}}:new float[][]{{383,364},{333,590},{267,760},{240,845}};
      float[][] leg=left?new float[][]{{571,744},{574,1010},{577,1253},{577,1490}}:new float[][]{{454,744},{463,1010},{456,1253},{451,1490}};
      int index=switch(bone.getRole()){case UPPER_ARM,THIGH->0;case FOREARM,SHIN->1;case HAND,FOOT->2;default->-1;};
      if(index>=0) {
        boolean isArm=bone.getRole()==BoneRole.UPPER_ARM||bone.getRole()==BoneRole.FOREARM||bone.getRole()==BoneRole.HAND;
        float[][] points=isArm?arm:leg;
        float min=isArm?(index==2?-22f:-10f):(index==1?-8f:-7f);
        float max=isArm?(index==0?38f:index==1?145f:22f):(index==1?14f:7f);
        bone=change(bone,Map.ofEntries(Map.entry("headX",points[index][0]),Map.entry("headY",points[index][1]),Map.entry("tailX",points[index+1][0]),Map.entry("tailY",points[index+1][1]),Map.entry("minAngle",min),Map.entry("maxAngle",max),Map.entry("blendWidth",isArm?(index==0?32f:22f):20f),Map.entry("connected",index!=0)));
      }
      authored.add(bone);
    }
    skeleton=change(skeleton,Map.of("bones",authored));
    Files.writeString(root.resolve("source/skeleton-authored.json"),skeleton.toJson().toString());
    for(SkeletonBone bone:skeleton.getBones())System.out.println("Bone "+bone.getId()+" => "+bone.getParameterId());
    config=change(config,Map.of("rigEdits",change(config.getRigEdits(),Map.of("skeleton",skeleton))));
    RigPreviewModel expressionBase=pipeline.buildPreview(input,config);
    StringJoiner drawableNames=new StringJoiner(",\n","{\n","\n}\n");
    for(Drawable drawable:expressionBase.getRig().getPuppet().getDrawables())drawableNames.add("  \""+drawableId(drawable)+"\": \""+drawable.getName()+"\"");
    Files.writeString(root.resolve("source/drawable-names.json"),drawableNames.toString());
    config=change(config,Map.of("rigEdits",disableHeadYaw(expressionBase,expressions(expressionBase,config.getRigEdits()))));
    // Cubism's Angle physics output is radians; skeleton rotation parameters are
    // authored in degrees. Preserve the generated 0.75 follow-through strength
    // while converting its units, in the source rig as well as runtime exports.
    Set<String> available=new HashSet<>();
    for(org.umamo.runtime.model.Parameter parameter:expressionBase.getRig().getPuppet().getParameters()) {
      Method idGetter=Arrays.stream(parameter.getClass().getMethods())
        .filter(m->m.getName().startsWith("getId-")||m.getName().equals("getId")).findFirst().orElseThrow();
      available.add((String)idGetter.invoke(parameter));
    }
    Set<String> angularTailParameters=new HashSet<>();
    for(SkeletonBone bone:skeleton.getBones())if(bone.getRole()==BoneRole.TAIL)angularTailParameters.add(bone.getParameterId());
    List<RigPhysicsEdit> authoredPhysics=new ArrayList<>();
    Set<String> disabledPhysics=new HashSet<>();
    for(RigPhysicsEdit group:PhysicsCatalog.INSTANCE.active(expressionBase.getAnalysis(),config,available)) {
      if(!group.getId().startsWith("PhysicsSkel_"))continue;
      if(group.getOutputs().stream().noneMatch(o->angularTailParameters.contains(o.getParameter()))){disabledPhysics.add(group.getId());continue;}
      List<PhysicsOutput> outputs=new ArrayList<>();
      for(PhysicsOutput output:group.getOutputs()) {
        if(angularTailParameters.contains(output.getParameter()))output=change(output,
          Map.of("scale",(float)(output.getScale()*180.0/Math.PI)));
        outputs.add(output);
      }
      authoredPhysics.add(change(group,Map.of("outputs",outputs)));
    }
    config=change(config,Map.of("rigEdits",change(config.getRigEdits(),Map.of("physicsEdits",authoredPhysics,"disabledPhysicsIds",disabledPhysics))));
    Files.writeString(root.resolve("source/physics-authored.txt"),authoredPhysics.toString());
    Files.writeString(root.resolve("source/expression-rig.txt"),config.getRigEdits().toString());
    pipeline.run(input,root.resolve("model"),config,(stage,fraction)->System.out.println(stage));
    RigPreviewModel preview=pipeline.buildPreview(input,config);
    // Stars are actual eye contents, so reuse each iris's same-side native
    // eyelid mask. Author this on the editable puppet before ALL exports.
    List<Drawable> masked=new ArrayList<>();
    List<Drawable> all=preview.getRig().getPuppet().getDrawables();
    for(Drawable d:all) {
      if(d.getName().startsWith("face detail fx star-")) {
        String irisName="irides"+d.getName().substring(d.getName().lastIndexOf('-'));
        Drawable iris=all.stream().filter(e->e.getName().equals(irisName)).findFirst().orElseThrow();
        if(iris.getMaskedBy().isEmpty())throw new IllegalStateException("Missing iris clipping mask");
        d=change(d,Map.of("maskedBy",iris.getMaskedBy()));
      }
      masked.add(d);
    }
    var puppet=change(preview.getRig().getPuppet(),Map.of("drawables",masked));
    preview=change(preview,Map.of("rig",change(preview.getRig(),Map.of("puppet",puppet))));
    Files.writeString(root.resolve("source/authored-masks.json"),"{\"star-l\":\"ArtMeshEyewhiteL\",\"star-r\":\"ArtMeshEyewhiteR\"}\n");
    ExportService service=ExportService.INSTANCE;
    ExportRegistry registry=service.registry(config);
    for(String id:List.of("moc3","cmo3","vtube-studio","web","gif")) {
      ExportTarget target=registry.get(id);
      Map<String,String> settings=id.equals("gif")?Map.of("clip","Idle","fps","15","size","768","background","FFF3EEE6"):Map.of();
      Path out=root.resolve(id.equals("vtube-studio")?"VTubeStudio/Cormy":id.equals("web")?"preview":id.equals("gif")?"preview-idle":"model");
      try {
        ExportReport report=service.export(preview,target,service.options(target,"Cormy",config,settings),out);
        System.out.println("EXPORTED "+id+" "+report.getFiles().size()+" files");
      } catch(Exception ex) {
        System.err.println("EXPORT ERROR "+id+": "+ex);
        if(!id.equals("gif"))throw ex;
      }
    }
  }
}
