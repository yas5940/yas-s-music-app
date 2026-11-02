(()=>{
'use strict';
const $=id=>document.getElementById(id);
const fileInput=$('scanFile'),cameraInput=$('scanCameraFile'),canvas=$('scanCanvas');
const ctx=canvas.getContext('2d',{willReadFrequently:true});
const status=$('scanMessage'),result=$('scanResult');
let pdfDoc=null,page=1,original=null,lines=[],busy=false,manual=false,manualFirst=null;
const message=t=>{status.textContent=t};
const buttons=()=>{
  $('scanPrev').disabled=busy||!pdfDoc||page<=1;
  $('scanNext').disabled=busy||!pdfDoc||page>=pdfDoc.numPages;
  $('scanDetect').disabled=busy||!original;
  $('scanReset').disabled=busy||!original||!lines.length;
  $('scanManual').disabled=busy||!original;
  $('scanPage').textContent=pdfDoc?`PDF ${page} / ${pdfDoc.numPages} ページ`:
    original?'画像 1 / 1 ページ':'未読み込み';
};
const clearPreview=()=>{
  original=null;lines=[];pdfDoc=null;page=1;manual=false;manualFirst=null;
  $('scanCanvasWrap').classList.add('hidden');
  result.textContent='※ 五線譜の検出は試験機能です。音符の自動入力はまだ行いません。';
  buttons();
};
const savePreview=()=>{
  original=ctx.getImageData(0,0,canvas.width,canvas.height);
  lines=[];manual=false;manualFirst=null;
  $('scanCanvasWrap').classList.remove('hidden');
  buttons();
};
const drawPreview=(source,w,h)=>{
  const max=1500,scale=Math.min(1,max/Math.max(w,h));
  canvas.width=Math.max(1,Math.round(w*scale));
  canvas.height=Math.max(1,Math.round(h*scale));
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.drawImage(source,0,0,canvas.width,canvas.height);
  savePreview();
};
const loadPhoto=async file=>{
  const url=URL.createObjectURL(file);
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=reject;img.src=url});
    drawPreview(img,img.naturalWidth,img.naturalHeight);
    message(`画像を読み込みました（${img.naturalWidth} × ${img.naturalHeight}）。「五線譜を検出」を押してみてね。`);
  }finally{URL.revokeObjectURL(url)}
};
let pdfPromise=null;
function getPdfJs(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(pdfPromise)return pdfPromise;
  pdfPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
    script.onload=()=>{
      if(!window.pdfjsLib)return reject(new Error('PDF表示ライブラリを読み込めませんでした'));
      window.pdfjsLib.GlobalWorkerOptions.workerSrc='https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
      resolve(window.pdfjsLib);
    };
    script.onerror=()=>reject(new Error('PDFの表示ライブラリを読み込めませんでした。ネット接続を確認してください。'));
    document.head.appendChild(script);
  }).catch(e=>{pdfPromise=null;throw e});
  return pdfPromise;
}
async function renderPdfPage(){
  if(!pdfDoc)return;
  const current=page;
  const pdfPage=await pdfDoc.getPage(current);
  const base=pdfPage.getViewport({scale:1});
  const viewport=pdfPage.getViewport({scale:Math.min(2,1500/Math.max(base.width,base.height))});
  canvas.width=Math.round(viewport.width);canvas.height=Math.round(viewport.height);
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  await pdfPage.render({canvasContext:ctx,viewport}).promise;
  savePreview();
  message(`PDFの${page}ページ目を表示しました。「五線譜を検出」を押してみてね。`);
}
async function handleFile(file){
  if(!file)return;
  if(busy)return;
  busy=true;buttons();clearPreview();
  message('読み込み中です…');
  try{
    if(file.type==='application/pdf'||/\.pdf$/i.test(file.name)){
      const lib=await getPdfJs();
      const buffer=await file.arrayBuffer();
      pdfDoc=await lib.getDocument({data:new Uint8Array(buffer)}).promise;
      page=1;
      await renderPdfPage();
    }else if(file.type.startsWith('image/')||/\.(jpe?g|png|webp|heic)$/i.test(file.name)){
      await loadPhoto(file);
    }else throw new Error('対応形式は画像またはPDFです。');
  }catch(err){
    clearPreview();
    message('読み込みに失敗しました：'+(err?.message||'不明なエラー'));
  }finally{busy=false;buttons()}
}
async function changePage(n){
  if(!pdfDoc||busy||page+n<1||page+n>pdfDoc.numPages)return;
  busy=true;buttons();page+=n;
  try{await renderPdfPage()}catch(e){message('ページを表示できませんでした：'+e.message)}
  finally{busy=false;buttons()}
}
// Detection: evaluate short horizontal windows independently so marginal
// marks and handwritten annotations do not erase whole staff lines.
function drawLines(){
  if(!original)return;
  ctx.putImageData(original,0,0);
  for(const sys of lines){
    ctx.strokeStyle=sys.manual?'rgba(230,110,30,.9)':'rgba(0,145,230,.85)';
    ctx.lineWidth=2;
    for(const y of sys.ys){
      ctx.beginPath();ctx.moveTo(sys.x0,y+.5);ctx.lineTo(sys.x1,y+.5);ctx.stroke();
    }
  }
  buttons();
}
function detectStaffLines(){
  if(!original)return;
  const w=canvas.width,h=canvas.height,p=original.data;
  const proposals=[];
  // Scan three broad regions of the page rather than demanding a black line
  // across the entire page. This also works on many slightly skewed photos.
  for(const [from,to] of [[.07,.37],[.35,.67],[.64,.94]]){
    const x0=Math.round(w*from),x1=Math.round(w*to),stride=Math.max(1,Math.floor((x1-x0)/260));
    const coverage=new Float32Array(h);
    for(let y=0;y<h;y++){
      let count=0,dark=0;
      for(let x=x0;x<x1;x+=stride){
        const i=(y*w+x)*4;
        const gray=p[i]*.299+p[i+1]*.587+p[i+2]*.114;
        if(gray<185)dark++;
        count++;
      }
      coverage[y]=dark/Math.max(1,count);
    }
    const peaks=[];
    for(let y=3;y<h-3;y++){
      const background=(coverage[Math.max(0,y-5)]+coverage[Math.min(h-1,y+5)])/2;
      if(coverage[y]>.13&&coverage[y]>background+.045&&coverage[y]>=coverage[y-1]&&coverage[y]>=coverage[y+1]){
        if(peaks.length&&y-peaks[peaks.length-1]<=3){
          if(coverage[y]>coverage[peaks[peaks.length-1]])peaks[peaks.length-1]=y;
        }else peaks.push(y);
      }
    }
    // Five equally spaced peaks, with tolerance for 1px and perspective.
    for(let i=0;i<peaks.length;i++)for(let j=i+1;j<peaks.length;j++){
      const d=peaks[j]-peaks[i];
      if(d<5)continue;
      if(d>Math.min(60,h/16))break;
      const ys=[peaks[i],peaks[j]];
      for(let k=2;k<5;k++){
        const target=peaks[i]+k*d;
        let best=null,diff=Math.max(2,d*.24);
        for(const y of peaks){
          const error=Math.abs(y-target);
          if(error<diff){best=y;diff=error}
          if(y>target+diff)break;
        }
        if(best===null)break;
        ys.push(best);
      }
      if(ys.length===5){
        proposals.push({ys,x0,x1,manual:false,quality:ys.reduce((sum,y)=>sum+coverage[y],0)});
        break;
      }
    }
  }
  // Combine overlapping estimates of the same staff into one candidate.
  proposals.sort((a,b)=>b.quality-a.quality);
  const chosen=[];
  for(const candidate of proposals){
    const span=candidate.ys[4]-candidate.ys[0];
    const duplicate=chosen.some(other=>Math.abs(other.ys[0]-candidate.ys[0])<Math.max(7,span*.45));
    if(!duplicate)chosen.push(candidate);
  }
  const manualLines=lines.filter(l=>l.manual);
  lines=[...manualLines,...chosen].sort((a,b)=>a.ys[0]-b.ys[0]).slice(0,35);
  drawLines();
  const count=chosen.length;
  result.textContent=`自動検出：${count}段（青）。足りない段は「手動で段を追加」を押し、五線譜の最上線と最下線を順にタップしてください。橙色で追加します。`;
  message(count?`候補を${count}段検出しました。見逃した段は手動で追加できます。`:'自動検出できませんでした。手動で五線譜の最上線と最下線を指定できます。');
}
$('scanManual').addEventListener('click',()=>{
  if(!original)return;
  manual=!manual;manualFirst=null;
  $('scanManual').textContent=manual?'✕ 手動追加を終了':'✍️ 手動で段を追加';
  message(manual?'追加したい五線譜の「一番上の線」をタップしてください。':'手動追加を終了しました。');
});
canvas.addEventListener('click',ev=>{
  if(!manual||!original)return;
  const r=canvas.getBoundingClientRect();
  const y=(ev.clientY-r.top)*canvas.height/r.height;
  if(manualFirst===null){
    manualFirst=y;
    message('次に、同じ五線譜の「一番下の線」をタップしてください。');
  }else{
    const top=Math.min(manualFirst,y),bottom=Math.max(manualFirst,y);
    manualFirst=null;
    if(bottom-top<15){message('上下の線が近すぎます。最上線からもう一度指定してください。');return}
    lines.push({ys:Array.from({length:5},(_,i)=>Math.round(top+(bottom-top)*i/4)),x0:0,x1:canvas.width,manual:true});
    lines.sort((a,b)=>a.ys[0]-b.ys[0]);
    drawLines();
    message('橙色の5本線を追加しました。次の段も追加できます。');
    result.textContent=`検出・追加した段：${lines.length}段（青＝自動、橙＝手動）。音符の自動認識はまだ未対応です。`;
  }
});
$('scanChoose').addEventListener('click',()=>fileInput.click());
$('scanCamera').addEventListener('click',()=>cameraInput.click());
fileInput.addEventListener('change',e=>{handleFile(e.target.files[0]);e.target.value=''});
cameraInput.addEventListener('change',e=>{handleFile(e.target.files[0]);e.target.value=''});
$('scanPrev').addEventListener('click',()=>changePage(-1));
$('scanNext').addEventListener('click',()=>changePage(1));
$('scanDetect').addEventListener('click',detectStaffLines);
$('scanReset').addEventListener('click',()=>{
  if(!original)return;
  ctx.putImageData(original,0,0);lines=[];manualFirst=null;buttons();
  result.textContent='検出線を消しました。元の画像に戻っています。';
  message('検出線を消しました。');
});
buttons();
})();
