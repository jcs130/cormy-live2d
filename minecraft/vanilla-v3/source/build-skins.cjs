/* Original native vanilla skin texels for Cormy v3. Each character is one game pixel.
 * Reference artwork is not resized, pasted, or used as a UV atlas.
 */
const fs=require('node:fs'), path=require('node:path'), crypto=require('node:crypto');
const sharp=require(process.env.CORMY_SHARP||'sharp');
const root=path.resolve(__dirname,'..');
const palette={
  W:'#fffaf2',w:'#f4e9dd',h:'#e6d5c6',c:'#cbb5a3',
  O:'#efa66e',G:'#d38350',g:'#b9663f',
  P:'#ffe8dc',p:'#ffdfcf',q:'#f1c5b2',r:'#f2b4a7',
  L:'#41251f',a:'#875023',A:'#efa638',E:'#fff8db',
  K:'#805a48',k:'#6b483a',b:'#4b3028',B:'#34231f',
  F:'#cb9652',f:'#f1ca80',e:'#fff0b7',
  T:'#f5e6cd',t:'#e5d2b6',H:'#c5ab8a', '.':'#00000000'
};
const head={
  front:[
    'wwOGwGww','wWWGWWww','wWWwWWww','wPPwPPPw',
    'wLaPPaLw','wEAPPAEw','wrPPPPrw','wwPPPPww'
  ],
  back:[
    'wOOWwGOw','wGWWwWGw','wWwWWwWw','wWwWWwWw',
    'wWwWWwWw','wWwWWwWw','whwWWwhw','chwhhwhc'
  ],
  right:[
    'wOOwwwww','wGOwwWWw','wWWwwWWw','wWWwwWWw',
    'wWWwwWWw','wWWwwWWw','whwwWwhw','chwhhwhc'
  ],
  left:[
    'wwwwwOOw','wWWwwOGw','wWWwwWWw','wWWwwWWw',
    'wWWwwWWw','wWWwwWWw','whwWwwhw','chwhhwhc'
  ],
  top:[
    'wwwwwwww','wwOOwOOw','wwGOwOGw','wwGWWGww',
    'wwWWWWww','wWWWWWWw','wwWWWWww','wwwwwwww'
  ],
  bottom:[
    'hhhhhhhh','hqqqqqqh','hqPPPPqh','hqPPPPqh',
    'hqPPPPqh','hqPPPPqh','hqqqqqqh','hhhhhhhh'
  ]
};
// Sparse outer bob: preserve the readable eyes and a clean chin, without a face frame.
const hat={
  front:[
    'wwwOwOww','wW....Ww','WW.WW.WW','W..W...W',
    'W......W','w......w','w......w','.w....w.'
  ],
  back:[
    '.w....w.','........','........','........',
    'W......W','w......w','ww....ww','.hwwwwh.'
  ],
  right:[
    '........','........','........','........',
    '.......W','W.....Ww','wW....ww','.hwwwwh.'
  ],
  // The lantern is attached to a dark ribbon in the hair, not floating beside the model.
  left:[
    '........','........','....b.b.','.....b..',
    'W...bFb.','w...FeF.','ww..bfb.','.hwwwwh.'
  ],
  top:[
    '........','..O..O..','..G..G..','........',
    '........','........','........','........'
  ],
  bottom:Array(8).fill('........')
};
const body={
  front:[
    'wwKkkKww','wWKkkKWw','WWKkkKWW','WwKkkKwW',
    'WWKkkKWW','WWKkkKWW','WWkkkkWW','WWPPPPWW',
    'WWbbbbWW','WbFffbbW','WwtTTtwW','htTttTth'
  ],
  back:[
    'whhhhhhw','hwWWWWwh','WhwWWwhW','WWchhcWW',
    'WGGWWGGW','WOGGGGOW','WWGGGGWW','WWWGGWWW',
    'WWWWWWWW','wWWWWWWw','hwWWWWwh','htTttTth'
  ],
  right:[
    'hwwh','wWWh','wWWh','wWWh','wWWh','wWWh',
    'wWWh','wWWh','wWWh','wWWh','wWWh','htth'
  ],
  left:[
    'hwwh','hWWw','hWWw','hWWw','hWWw','hWWw',
    'hWWw','hWWw','hWWw','hWWw','hWWw','htth'
  ],
  top:['wwKkkKww','wwKkkKww','wwKkkKww','whhhhhhw'],
  bottom:['htTttTth','ttTTTTtt','ttTTTTtt','htTttTth']
};
const jacket={
  front:[
    '.W....W.','.WW..WW.','..W..W..','.f....f.',
    '.b....b.','.e....e.','.b....b.','.h....h.',
    'W......W','W......W','.w....w.','........'
  ],
  back:[
    '.wwwwww.','..WWWW..','...ww...','........',
    '........','........','........','........',
    '........','........','W......W','.h....h.'
  ],
  right:['....','....','....','....','....','....','....','....','....','....','...W','....'],
  left:['....','....','....','....','....','....','....','....','....','....','W...','....'],
  top:Array(4).fill('........'),bottom:Array(4).fill('........')
};
const leg={
  front:[
    'tTTt','tTTt','HHHH','qPPp','pPPP','pPPP',
    'qPPp','wwww','bkkb','bFfb','bwwb','BBBB'
  ],
  back:[
    'tTTt','tTTt','HHHH','qppq','pPPp','pPPp',
    'qppq','wwww','bkkb','bkkb','bFfb','BBBB'
  ],
  right:['Httt','Httt','HHHH','qppp','pPPP','pPPP','qppp','wwww','bkkb','bkkb','bbkb','BBBB'],
  left:['tttH','tttH','HHHH','pppq','PPPp','PPPp','pppq','wwww','bkkb','bkkb','bkbb','BBBB'],
  top:['tttt','tTTt','tTTt','tttt'],bottom:Array(4).fill('BBBB')
};
const pants={
  front:['w...','W...','w...','....','....','....','....','....','....','.f..','....','....'],
  back:['w...','w...','h...','....','....','....','....','....','....','....','....','....'],
  right:['wwww','wWWW','hhhh','....','....','....','....','....','....','....','....','....'],
  left:['....','....','....','....','....','....','....','....','....','....','....','....'],
  top:Array(4).fill('....'),bottom:Array(4).fill('....')
};
const mirror=rows=>rows.map(row=>[...row].reverse().join(''));
function arm(width,isLeft,outer){
  const result={};
  for(const face of ['front','back','right','left','top','bottom']){
    const w=(face==='right'||face==='left')?4:width;
    const height=(face==='top'||face==='bottom')?4:12;
    result[face]=Array.from({length:height},(_,y)=>Array.from({length:w},(_,x)=>{
      if(outer){
        if(face==='top'||face==='bottom')return '.';
        if(y===0&&x>0&&x<w-1)return 'W';
        if(y===7&&x>0&&x<w-1)return 'w';
        if(face===(isLeft?'left':'right')&&y===6&&x===1)return 'f';
        if(y===8&&x>0&&x<w-1)return 'k';
        return '.';
      }
      if(face==='bottom')return x===0?'q':'P';
      if(face==='top')return x===0?'w':'W';
      if(y===11)return x===0?'p':'P';
      if(y===10)return 'P';
      if(y===9)return 'b';
      if(y===8)return 'k';
      if(y===7)return x===0?'h':'w';
      return x===0?'w':'W';
    }).join(''));
    if(isLeft)result[face]=mirror(result[face]);
  }
  return result;
}
function faces(u,v,w,h,d){return {
  top:[u+d,v,w,d],bottom:[u+d+w,v,w,d],right:[u,v+d,d,h],
  front:[u+d,v+d,w,h],left:[u+d+w,v+d,d,h],back:[u+d+w+d,v+d,w,h]
};}
function rgba(hex){return [1,3,5,7].map((s,i)=>i===3&&hex.length===7?255:parseInt(hex.slice(s,s+2),16));}
const colors=Object.fromEntries(Object.entries(palette).map(([k,v])=>[k,rgba(v)]));
function skin(model){
  const bytes=Buffer.alloc(64*64*4),regions=[];
  const put=(part,u,v,w,h,d,maps,layer)=>{
    for(const [face,rect]of Object.entries(faces(u,v,w,h,d))){
      const [x,y,rw,rh]=rect,rows=maps[face];
      if(rows.length!==rh||rows.some(row=>row.length!==rw))throw Error(`${part}/${face}: expected ${rw}x${rh}`);
      regions.push({part,layer,face,rect});
      rows.forEach((row,yy)=>[...row].forEach((code,xx)=>{
        if(!colors[code])throw Error(`Unknown palette ${code}`);
        if(layer==='base'&&code==='.')throw Error(`Transparent base ${part}/${face}`);
        bytes.set(colors[code],((y+yy)*64+x+xx)*4);
      }));
    }
  };
  const aw=model==='slim'?3:4;
  put('head',0,0,8,8,8,head,'base');put('head',32,0,8,8,8,hat,'outer');
  put('body',16,16,8,12,4,body,'base');put('body',16,32,8,12,4,jacket,'outer');
  put('rightArm',40,16,aw,12,4,arm(aw,false,false),'base');put('rightArm',40,32,aw,12,4,arm(aw,false,true),'outer');
  put('leftArm',32,48,aw,12,4,arm(aw,true,false),'base');put('leftArm',48,48,aw,12,4,arm(aw,true,true),'outer');
  put('rightLeg',0,16,4,12,4,leg,'base');put('rightLeg',0,32,4,12,4,pants,'outer');
  const leftLeg=structuredClone(leg),leftPants=structuredClone(pants);
  for(const face of ['front','back','left','right'])leftLeg[face]=mirror(leftLeg[face]);
  for(const face of ['front','back'])leftPants[face]=mirror(leftPants[face]);
  [leftPants.left,leftPants.right]=[leftPants.right,leftPants.left];
  // Flat ginger/white tail motif: one leg only, so walking cannot tear it across joints.
  leftPants.back=['..O.','..G.','..W.','.WW.','.OG.','.GG.','.WW.','..W.','....','....','....','....'];
  put('leftLeg',16,48,4,12,4,leftLeg,'base');put('leftLeg',0,48,4,12,4,leftPants,'outer');
  return {bytes,regions,armWidth:aw};
}
async function main(){
  const entries=[];
  for(const model of ['slim','classic']){
    const {bytes,regions,armWidth}=skin(model),file=`cormy-${model}-64x64.png`;
    await sharp(bytes,{raw:{width:64,height:64,channels:4}}).png().toFile(path.join(root,file));
    entries.push({model,file,armWidth,regions,sha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')});
  }
  fs.writeFileSync(path.join(root,'source/skin-uv-map.json'),JSON.stringify(entries,null,2)+'\n');
  fs.writeFileSync(path.join(root,'source/palette.json'),JSON.stringify(palette,null,2)+'\n');
  console.log(JSON.stringify(entries.map(({model,file,sha256})=>({model,file,sha256}))));
}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1;});
module.exports={skin,palette};
