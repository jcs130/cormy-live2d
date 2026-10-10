const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const assetRoot=path.resolve(__dirname,'..'),root=path.dirname(assetRoot);
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.png':'image/png','.json':'application/json','.zip':'application/zip','.txt':'text/plain; charset=utf-8'};
const server=http.createServer((request,response)=>{
  let pathname;try{pathname=decodeURIComponent(new URL(request.url,'http://127.0.0.1').pathname);}catch{response.writeHead(400).end();return;}
  const file=path.resolve(root,'.'+pathname+(pathname.endsWith('/')?'index.html':''));
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  fs.stat(file,(error,stat)=>{if(error||!stat.isFile()){response.writeHead(404).end();return;}response.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});fs.createReadStream(file).pipe(response);});
});
server.listen(Number(process.env.CORMY_PREVIEW_PORT)||0,'127.0.0.1',()=>console.log(`http://127.0.0.1:${server.address().port}/${encodeURIComponent(path.basename(assetRoot))}/preview/`));
