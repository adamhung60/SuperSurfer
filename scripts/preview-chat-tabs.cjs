'use strict';
// Actual UI with an in-memory workspace; never connects to providers or native installation.
const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'../ui');
function start(port=Number(process.env.PORT||8771)){
 const server=http.createServer((req,res)=>{
  let name;try{name=decodeURIComponent(new URL(req.url,'http://localhost').pathname);}catch{res.writeHead(400);return res.end();}
  if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);return res.end();}
  res.setHeader('Cache-Control','no-store');
  if(name==='/'||name==='/index.html'){
   const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<head>','<head><script src="chat-tabs-preview-runtime.js"></script><style>body{padding-top:28px}.app-shell{height:calc(100vh - 28px)}.topbar{display:none!important}</style>');
   res.setHeader('Content-Type','text/html; charset=utf-8');return res.end(req.method==='HEAD'?'':html);
  }
  const runtime=name==='/chat-tabs-preview-runtime.js';
  const file=runtime?path.join(__dirname,'chat-tabs-preview-runtime.js'):path.resolve(root,'.'+name);
  if((!runtime&&!file.startsWith(root+path.sep))||!fs.existsSync(file)||!fs.statSync(file).isFile()||(!runtime&&!fs.realpathSync(file).startsWith(root+path.sep))){res.writeHead(404);return res.end();}
  res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.woff2':'font/woff2','.svg':'image/svg+xml','.png':'image/png','.json':'application/json'})[path.extname(file)]||'application/octet-stream');
  res.end(req.method==='HEAD'?'':fs.readFileSync(file));
 });
 server.listen(port,'127.0.0.1',()=>console.log('Chat tabs preview: http://127.0.0.1:'+server.address().port));return server;
}
if(require.main===module)start();module.exports={start};
