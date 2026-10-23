(()=>{
'use strict';
const $=id=>document.getElementById(id);
const fileInput=$('scanFile'),cameraInput=$('scanCameraFile'),canvas=$('scanCanvas');
const ctx=canvas.getContext('2d',{willReadFrequently:true});
const status=$('scanMessage'),result=$('scanResult');
let pdfDoc=null,page=1,original=null,lines=[],busy=false;
const message=t=>{status.textContent=t};
const buttons=()=>{
  $('scanPrev').disabled=busy||!pdfDoc||page<=1;
  $('scanNext').disabled=busy||!pdfDoc||page>=pdfDoc.numPages;
  $('scanDetect').disabled=busy||!original;
  $('scanReset').disabled=busy||!original||!lines.length;
  $('scanPage').textContent=pdfDoc?`PDF ${page} / ${pdfDoc.numPages} ページ`:
    original?'画像 1 / 1 ページ':'未読み込み';
};
const clearPreview=()=>{
  original=null;lines=[];pdfDoc=null;page=1;
  $('scanCanvasWrap').classList.add('hidden');
  result.textContent='※ 五線譜の検出は試験機能です。音符の自動入力はまだ行いません。';
  buttons();
};
const savePreview=()=>{
  original=ctx.getImageData(0,0,canvas.width,canvas.height);
  lines=[];
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
// A lightweight, local-only detector for nearly horizontal staff lines.
// This is NOT an optical music recognition engine.
function detectStaffLines(){
  if(!original)return;
  const {width:w,height:h}=canvas,p=original.data;
  const x0=Math.round(w*.08),x1=Math.round(w*.95),stride=Math.max(2,Math.floor((x1-x0)/400));
  const score=new Float32Array(h);
  for(let y=0;y<h;y++){
    let dark=0,count=0;
    for(let x=x0;x<x1;x+=stride){
      const i=(y*w+x)*4;
      const lum=(p[i]*.299+p[i+1]*.587+p[i+2]*.114);
      if(lum<150)dark++;
      count++;
    }
    score[y]=dark/Math.max(1,count);
  }
  const candidates=[];
  for(let y=2;y<h-2;y++){
    // High ink coverage in a row, relative to nearby rows.
    const baseline=(score[Math.max(0,y-7)]+score[Math.min(h-1,y+7)])/2;
    if(score[y]>.19&&score[y]>baseline+.09)candidates.push(y);
  }
  const runs=[];
  for(const y of candidates){
    const last=runs[runs.length-1];
    if(last&&y-last[last.length-1]<=3)last.push(y);
    else runs.push([y]);
  }
  const centers=runs.map(a=>Math.round(a.reduce((x,y)=>x+y,0)/a.length));
  // Find clusters of five approximately equidistant horizontal lines.
  const systems=[],seen=new Set();
  for(let i=0;i<centers.length-4;i++){
    for(let j=i+1;j<centers.length;j++){
      const d=centers[j]-centers[i];
      if(d<5||d>Math.max(45,h/18))break;
      const found=[centers[i]],indices=[i];
      for(let k=1;k<5;k++){
        const target=centers[i]+k*d;
        let best=-1,bestDiff=Math.max(2,d*.18);
        for(let q=j;q<centers.length;q++){
          const diff=Math.abs(centers[q]-target);
          if(diff<bestDiff){best=q;bestDiff=diff}
          if(centers[q]>target+bestDiff)break;
        }
        if(best<0)break;
        found.push(centers[best]);indices.push(best);
      }
      if(found.length===5){
        const key=Math.round(found[0]/5);
        if(!seen.has(key)){seen.add(key);systems.push(found)}
        break;
      }
    }
  }
  systems.sort((a,b)=>a[0]-b[0]);
  lines=systems.slice(0,30);
  ctx.putImageData(original,0,0);
  for(const system of lines){
    for(const y of system){
      ctx.strokeStyle='rgba(0,150,225,.85)';
      ctx.lineWidth=2;
      ctx.beginPath();ctx.moveTo(0,y+.5);ctx.lineTo(w,y+.5);ctx.stroke();
    }
  }
  buttons();
  const count=lines.length;
  result.textContent=count
    ?`検出候補：${count}段（青い線）。傾きや手書き文字によって誤検出することがあります。これは五線譜の位置の検出のみで、音符の自動入力ではありません。`
    :'五線譜を検出できませんでした。写真を正面から撮影し、明るく鮮明な画像で再試行してください。';
  message(count?`五線譜の候補を${count}段検出しました。青い線が元の五線譜と重なっているか確認してね。`:'今回は五線譜を検出できませんでした。');
}
$('scanChoose').addEventListener('click',()=>fileInput.click());
$('scanCamera').addEventListener('click',()=>cameraInput.click());
fileInput.addEventListener('change',e=>{handleFile(e.target.files[0]);e.target.value=''});
cameraInput.addEventListener('change',e=>{handleFile(e.target.files[0]);e.target.value=''});
$('scanPrev').addEventListener('click',()=>changePage(-1));
$('scanNext').addEventListener('click',()=>changePage(1));
$('scanDetect').addEventListener('click',detectStaffLines);
$('scanReset').addEventListener('click',()=>{
  if(!original)return;
  ctx.putImageData(original,0,0);lines=[];buttons();
  result.textContent='検出線を消しました。元の画像に戻っています。';
  message('検出線を消しました。');
});
buttons();
})();
