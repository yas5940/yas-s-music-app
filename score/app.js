const REST_GLYPHS={"quarter":"M147 878 307 683Q257 624 230.0 581.0Q203 538 203 494Q203 457 227.0 416.5Q251 376 303 314L287 292Q243 320 205 320Q177 320 163.0 301.5Q149 283 149 257Q149 225 162.5 196.5Q176 168 199 142L186 123Q117 173 84.0 214.0Q51 255 51 303Q51 346 78.0 366.0Q105 386 143 386Q173 386 221 363V365L67 570Q168 659 168 736Q168 797 104 878Z","eighth":"M155 269 251 609Q230 590 203.5 582.0Q177 574 151 574Q108 574 79.0 597.0Q50 620 50 663Q50 691 70.0 710.5Q90 730 121 730Q150 730 168.5 711.5Q187 693 187 662Q187 640 177 623Q177 617 189 617Q244 617 294 703H312L191 269Z","sixteenth":"M155 147 251 487Q230 468 203.5 460.0Q177 452 151 452Q108 452 79.0 475.0Q50 498 50 541Q50 569 69.5 588.5Q89 608 121 608Q150 608 168.5 589.5Q187 571 187 540Q187 518 177 501Q177 495 189 495Q230 495 267 541L319 731Q298 712 271.5 704.0Q245 696 219 696Q176 696 147.0 719.0Q118 742 118 785Q118 813 138.0 832.5Q158 852 189 852Q219 852 237.0 833.0Q255 814 255 784Q255 774 252.0 763.5Q249 753 245 745Q245 739 257 739Q312 739 362 825H380L191 147Z"};
(()=>{'use strict';
const $=id=>document.getElementById(id), names=['ド','レ','ミ','ファ','ソ','ラ','シ'], semis=[0,2,4,5,7,9,11], pcn=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
let tempoChanges=[];
let repeatCfg={enabled:false,start:1,end:2,endings:false,first:2,secondEnd:3};
let seq=[], selected=-1, insertion='end', undo=[], picked=48, octaveShift=0, audio=null, master=null, nodes=[], timers=[], token=0, playbackFrame=0;
const beats=()=> $('meter').value==='6/8'?3:Number($('meter').value), dur=()=>Number($('duration').value)*($('triplet').checked?2/3:1);
const keyAcc=(i)=>{const k=Number($('keySig').value)||0;const flats=[6,2,5,1,4,0,3],sharps=[3,0,4,1,5,2,6];return k<0&&flats.slice(0,-k).includes(i)?-1:k>0&&sharps.slice(0,k).includes(i)?1:0};
const effectiveAcc=(i,raw)=>Number(raw)===99?0:Number(raw)!==0?Number(raw):keyAcc(i);
const pitch=(i,oct,acc=0)=>12*(oct+1)+semis[i]+effectiveAcc(i,acc);

const label=m=>m==null?'休符':pcn[((m%12)+12)%12]+(Math.floor(m/12)-1);
const round=n=>Math.round(n*10000)/10000;
function valid(e){return e&&(['note','rest','multi','repeat'].includes(e.type)||!e.type)&&Number.isFinite(e.d)&&e.d>0&&e.d<=256&&(e.m==null||(Number.isInteger(e.m)&&e.m>=12&&e.m<=108));}
function normalize(e){return {type:e.type|| (e.m===null?'rest':'note'),m:e.m??null,d:e.d,tie:!!e.tie,triplet:!!e.triplet,count:Math.max(1,Math.min(64,Number(e.count)||1)),acc:e.acc??null,slur:!!e.slur,slurSpan:Number.isInteger(Number(e.slurSpan))?Math.max(0,Math.min(100,Number(e.slurSpan))):0,beam:e.beam==='join'||e.beam==='break'?e.beam:'auto',bridgeRest:e.bridgeRest===true?true:e.bridgeRest===false?false:null,dynamic:['pp','p','mp','mf','f','ff'].includes(e.dynamic)?e.dynamic:''};}
function persist(){try{localStorage.setItem('yasu-score-v6',JSON.stringify({seq,repeatCfg,tempoChanges,title:$('title').value,bpm:$('bpm').value,meter:$('meter').value,keySig:$('keySig').value,volume:$('volume').value,timbre:$('timbre').value}))}catch(e){}}

function cleanTempoChanges(changes){
  if(!Array.isArray(changes))return [];
  const map=new Map();
  for(const x of changes){
    const measure=Number(x?.measure),bpm=Number(x?.bpm);
    if(Number.isInteger(measure)&&measure>=2&&measure<=1000&&Number.isInteger(bpm)&&bpm>=30&&bpm<=240)map.set(measure,bpm);
  }
  return [...map].map(([measure,bpm])=>({measure,bpm})).sort((a,b)=>a.measure-b.measure);
}
function tempoAt(measure){
  let bpm=Math.max(30,Math.min(240,Number($('bpm').value)||100));
  for(const c of tempoChanges){if(c.measure<=measure)bpm=c.bpm;else break}
  return bpm;
}
function tempoUI(){
  const list=$('tempoList');list.replaceChildren();
  if(!tempoChanges.length){const span=document.createElement('span');span.className='hint';span.textContent='途中のテンポ変更はありません。';list.appendChild(span)}
  for(const c of tempoChanges){
    const span=document.createElement('span');span.className='tempoChip';span.textContent=`${c.measure}小節目から ♩=${c.bpm} `;
    const del=document.createElement('button');del.type='button';del.textContent='削除';del.setAttribute('aria-label',`${c.measure}小節目のテンポ変更を削除`);
    del.onclick=()=>{stop();tempoChanges=tempoChanges.filter(x=>x.measure!==c.measure);render()};
    span.appendChild(del);list.appendChild(span);
  }
}
$('tempoAdd').onclick=()=>{
  const measure=Number($('tempoMeasure').value),bpm=Number($('tempoBpm').value);
  const max=Math.max(1,Math.ceil(seq.reduce((a,e)=>a+e.d,0)/beats()-1e-7));
  if(!Number.isInteger(measure)||measure<2||measure>max){$('tempoHint').textContent=`⚠️ 2〜${max}小節目の範囲で指定してください。`;return}
  if(!Number.isInteger(bpm)||bpm<30||bpm>240){$('tempoHint').textContent='⚠️ テンポは30〜240 BPMで指定してください。';return}
  stop();tempoChanges=cleanTempoChanges([...tempoChanges.filter(x=>x.measure!==measure),{measure,bpm}]);
  $('tempoHint').textContent=`${measure}小節目から${bpm} BPMに変更します。`;render();
};

function snap(){undo.push(JSON.stringify({seq,tempoChanges,repeatCfg}));if(undo.length>60)undo.shift()}

// v3.7.5: whole-measure copy/paste. Avoid splitting a note or multi-measure rest.
let measureClipboard=null;
let slurStart=-1; // Editing marker, not part of the saved score.
function measureBoundaries(){
  const b=beats(),starts=[0];let t=0;
  for(let i=0;i<seq.length;i++){
    t+=seq[i].d;
    const rounded=Math.round(t/b);
    if(Math.abs(t-rounded*b)<0.0001){while(starts.length<=rounded)starts.push(i+1)}
  }
  return {starts,complete:Math.abs(t/b-Math.round(t/b))<0.0001,total:t/b};
}
function copyMessage(msg,ok=false){$('measureCopyHint').textContent=(ok?'✅ ':'⚠️ ')+msg}
function getMeasureRange(start,count,allowEnd=false){
  const bounds=measureBoundaries(),a=start-1,z=a+count;
  if(!Number.isInteger(start)||start<1||!Number.isInteger(count)||count<1)return null;
  if(!bounds.complete)return null;
  if(z>=bounds.starts.length){if(!(allowEnd&&count===0&&a===bounds.starts.length-1))return null}
  if(bounds.starts[a]===undefined||bounds.starts[z]===undefined)return null;
  // No event is permitted to straddle a selected boundary.
  const b=beats();let t=0;
  for(const e of seq){
    const next=t+e.d;
    for(const k of [a,z])if(t<k*b-0.0001&&next>k*b+0.0001)return null;
    t=next;
  }
  return [bounds.starts[a],bounds.starts[z]];
}
function updateCopyControls(){
  const b=measureBoundaries(),complete=b.starts.length-1,shown=Math.ceil(b.total-1e-7);
  $('measureCopyInfo').textContent=`現在 ${shown} 小節${b.complete?'':'（最後の小節は入力途中）'}。貼り付け先はまだ存在しない小節も指定できます。`;
  const paste=$('pasteTo');paste.max='1000';
  $('pasteAtEnd').textContent=`➕ ${shown+1}小節目へ追加`;
  if(measureClipboard){$('measureCopyHint').dataset.ready='1'}
}
$('measureCopy').onclick=()=>{
  const start=Number($('copyFrom').value),count=Number($('copyCount').value);
  const range=getMeasureRange(start,count);
  let events;
  if(range){
    events=seq.slice(range[0],range[1]).map(e=>({...e}));
  }else{
    const bound=measureBoundaries(),last=Math.ceil(bound.total-1e-7);
    if(count===1 && start===last && !bound.complete && bound.starts[start-1]!==undefined){
      events=seq.slice(bound.starts[start-1]).map(e=>({...e}));
      const remaining=round(last*beats()-seq.reduce((sum,e)=>sum+e.d,0));
      if(remaining>0.0001)events.push({type:'rest',m:null,d:remaining,tie:false,triplet:false,count:1,slur:false,slurSpan:0});
    }else{
      copyMessage('コピーできません。完成した小節か、最後の入力途中の小節を1小節だけ指定してください。');return;
    }
  }
  measureClipboard={events,count,beatSize:beats()};
  $('pasteTo').value=String(Math.ceil(measureBoundaries().total-1e-7)+1);
  $('pasteMode').value='insert';
  copyMessage(`${start}〜${start+count-1}小節をコピーしました。貼り付け先を曲末尾（${$('pasteTo').value}小節目）に設定しました。`,true);
};
function pasteMeasures(){
  if(!measureClipboard){copyMessage('先に「小節をコピー」を押してください。');return}
  if(measureClipboard.beatSize!==beats()){copyMessage('拍子が変わっています。現在の拍子でコピーし直してください。');return}
  const target=Number($('pasteTo').value),mode=$('pasteMode').value,count=measureClipboard.count;
  if(!Number.isInteger(target)||target<1||target>1000||target+count-1>1000){copyMessage('貼り付け先は1〜1000小節目の範囲で指定してください。');return}
  const b=beats(),bound=measureBoundaries(),complete=bound.starts.length-1;
  // Keep an unfinished tail: complete the last measure with a rest before appending.
  // This also guarantees that a new measure has a real insertion boundary.
  const total=Math.ceil(bound.total-1e-7);
  if(!bound.complete&&target<=total){copyMessage(`現在の${total}小節目は入力途中です。新しい小節へ追加する場合は${total+1}小節目以降を指定してください。`);return}
  const existing=seq.slice();
  let padding=0;
  if(!bound.complete){
    padding=round(total*b-seq.reduce((sum,e)=>sum+e.d,0));
    if(padding<=0.0001)padding=0;
  }
  const extraRestCount=Math.max(0,target-1-total);
  const virtual=existing.slice();
  if(padding>0)virtual.push({type:'rest',m:null,d:padding,tie:false,triplet:false,count:1});
  for(let i=0;i<extraRestCount;i++)virtual.push({type:'rest',m:null,d:b,tie:false,triplet:false,count:1});
  // Find event boundaries after padding, without splitting any event.
  let t=0;const positions=new Map([[0,0]]);
  for(let i=0;i<virtual.length;i++){
    t+=virtual[i].d;const k=Math.round(t/b);
    if(Math.abs(t-k*b)<0.0001)positions.set(k,i+1);
  }
  const start=target-1;
  const end=mode==='overwrite'?Math.min(start+count,Math.round(t/b)):start;
  const a=positions.get(start),z=positions.get(end);
  if(a===undefined||z===undefined){copyMessage('貼り付け位置が小節の途中にあります。小節線をまたぐ音符がないか確認してください。');return}
  const incoming=measureClipboard.events.map(e=>({...e}));
  if(virtual.length-(z-a)+incoming.length>1200){copyMessage('楽譜の上限1200項目を超えるため貼り付けできません。');return}
  stop();snap();virtual.splice(a,z-a,...incoming);seq=virtual;selected=a;slurStart=-1;
  // Shift markers for inserted measures. When overwriting, existing markers retain their measure numbers.
  if(mode==='insert'){
    tempoChanges=cleanTempoChanges(tempoChanges.map(c=>({...c,measure:c.measure>=target?c.measure+count:c.measure})));
    for(const key of ['start','end','first','secondEnd']){
      if(Number.isInteger(repeatCfg[key])&&repeatCfg[key]>=target)repeatCfg[key]+=count;
    }
    showRepeatConfig();
  }
  render();
  const notes=[];
  if(padding>0)notes.push(`未完成の${total}小節目を休符で補完`);
  if(extraRestCount>0)notes.push(`空いた${extraRestCount}小節を休符で作成`);
  const modeLabel=mode==='insert'?'挿入':'上書き';
  copyMessage(`${target}小節目に${count}小節を${modeLabel}しました。${notes.length?'（'+notes.join('・')+'）':''}「↶ 戻す」で取り消せます。`,true);
  $('measureCopyCard').scrollIntoView({behavior:'smooth',block:'nearest'});
}
$('measurePaste').onclick=pasteMeasures;
$('pasteAtEnd').onclick=()=>{
  if(!measureClipboard){copyMessage('先にコピー元の小節をコピーしてください。');return}
  $('pasteTo').value=String(Math.ceil(measureBoundaries().total-1e-7)+1);
  $('pasteMode').value='insert';
  pasteMeasures();
};

function clearPlayingNote(){const old=$('score').querySelector('.playing-note');if(old)old.remove()}
let playingIndex=-1;
function showPlayingNote(i){
  if(i===playingIndex&&$('score').querySelector('.playing-note'))return;
  playingIndex=i;clearPlayingNote();
  if(i<0||!$('followNote').checked)return;
  const svg=$('score').querySelector('svg.scoreSvg');
  const target=svg?.querySelector('[data-index="'+i+'"]');
  if(!target)return;
  const ns='http://www.w3.org/2000/svg',rect=document.createElementNS(ns,'rect');
  const x=Number(target.getAttribute('x')),y=Number(target.getAttribute('y'));
  rect.setAttribute('x',String(x+2));rect.setAttribute('y',String(y+18));
  rect.setAttribute('width',String(Math.max(12,Number(target.getAttribute('width'))-4)));
  rect.setAttribute('height','100');rect.setAttribute('rx','9');
  rect.setAttribute('class','playing-note'+($('blinkNote').checked?' is-blinking':''));
  svg.appendChild(rect);
  if($('autoScroll').checked && !manualScroll && !document.hidden){
    ignoreScrollUntil=Date.now()+900;
    const bounds=target.getBoundingClientRect(),viewport=$('score').getBoundingClientRect();
    if(bounds.top<75||bounds.bottom>window.innerHeight-75){
      target.scrollIntoView({behavior:'smooth',block:'center',inline:'nearest'});
    }else if(bounds.left<viewport.left||bounds.right>viewport.right){
      target.scrollIntoView({behavior:'smooth',block:'nearest',inline:'center'});
    }
  }
}
let isScorePlaying=false,manualScroll=false,ignoreScrollUntil=0;
function pauseFollowing(){if(!isScorePlaying)return;manualScroll=true;$('followResume').hidden=false;$('followModeStatus').textContent='手動スクロール中（自動追従は一時停止）';}
function resumeFollowing(){manualScroll=false;$('followResume').hidden=true;$('followModeStatus').textContent='自動追従中';if(playingIndex>=0){const i=playingIndex;playingIndex=-1;showPlayingNote(i);}}
function setScorePlaying(on){isScorePlaying=on;if(!on){manualScroll=false;$('followResume').hidden=true;$('followModeStatus').textContent='';}else{$('followModeStatus').textContent='自動追従中';}const b=$('floatingStop');if(b){b.hidden=false;b.removeAttribute('aria-hidden');b.textContent=on?'■ 停止':'▶ 再生';b.setAttribute('aria-label',on?'演奏を停止':'演奏を開始');b.classList.toggle('is-playing',on);}const area=$('score');if(area)area.classList.toggle('tapToStop',on);}
function stop(){setScorePlaying(false);if(playbackFrame)cancelAnimationFrame(playbackFrame);playbackFrame=0;playingIndex=-1;clearPlayingNote();token++;timers.forEach(clearTimeout);timers=[];nodes.forEach(n=>{try{n.stop()}catch(e){}});nodes=[];$('bar').style.width='0%';$('status').textContent='停止中';if($('editReady'))$('editReady').textContent='✏️ 編集できます'}
function add(e){stop();snap();const at=insertion==='before'&&selected>=0?selected:insertion==='after'&&selected>=0?selected+1:seq.length;seq.splice(at,0,e);selected=at;render()}
function addNote(m){add({type:m===null?'rest':'note',m,d:dur(),tie:false,triplet:$('triplet').checked,count:1,beam:'auto',dynamic:''})}
function addSpecial(type){if(type==='multi')add({type,m:null,d:beats()*Number($('multiCount').value),count:Number($('multiCount').value),tie:false});else add({type,m:null,d:beats(),count:1,tie:false})}
function pickUI(){ $('pickedName').textContent='選択中：'+label(picked)+'（実音）';$('picker').querySelectorAll('[data-midi]').forEach(x=>x.classList.toggle('chosen',Number(x.dataset.midi)===picked)) }
function picker(){let s='<svg viewBox="0 0 380 400" xmlns="http://www.w3.org/2000/svg"><rect width="380" height="400" fill="white"/>';for(let i=0;i<15;i++){const step=i-5+octaveShift*7,absolute=14+step,oct=Math.floor(absolute/7),letter=((absolute%7)+7)%7,m=pitch(letter,oct,Number($('acc').value)),y=380-i*25;if(m<12||m>108)continue;s+=`<g data-midi="${m}" tabindex="0" role="button" aria-label="${names[letter]}${oct}"><rect x="12" y="${y-12}" width="356" height="24" rx="6" fill="${i%2?'#eff6fa':'#fff'}"/><ellipse cx="65" cy="${y}" rx="10" ry="7" fill="#176a88"/><text x="102" y="${y+5}" font-size="17" fill="#244455">${names[letter]}${oct}${Number($('acc').value)===-1?'♭':Number($('acc').value)===1?'♯':Number($('acc').value)===99?'♮':keyAcc(letter)===-1?'♭':keyAcc(letter)===1?'♯':''}</text></g>`}s+='</svg>';$('picker').innerHTML=s;$('picker').querySelectorAll('[data-midi]').forEach(e=>{let fn=()=>{picked=Number(e.dataset.midi);pickUI()};e.onclick=fn;e.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();fn()}}});$('octLabel').textContent=(octaveShift>0?'+':'')+octaveShift+'オクターブ';pickUI()}
// v3.3: click-to-enter bass-clef staff and chromatic piano.
let directMode='staff';
// v3.4.1: Safari-friendly touch input. Use the whole staff as a hit area,
// rather than 6 SVG-unit rectangles that shrink to ~3px on an iPhone.
function bindDirectInput(svg, resolveMidi){
  if(!svg)return;
  let lastPointerAt=0;
  const activate=ev=>{
    const m=resolveMidi(ev);
    if(!Number.isInteger(m)||m<12||m>108)return;
    if(ev.cancelable)ev.preventDefault();
    clickInsert(m);
  };
  if(window.PointerEvent){
    svg.addEventListener('pointerdown',ev=>{
      if(ev.pointerType==='mouse'&&ev.button!==0)return;
      lastPointerAt=Date.now();
      activate(ev);
    });
    // Keyboard-triggered click, and older browsers that lack pointer events.
    svg.addEventListener('click',ev=>{
      if(Date.now()-lastPointerAt<700)return;
      activate(ev);
    });
  }else{
    svg.addEventListener('click',activate);
  }
}
function svgCoords(svg,ev){
  const rect=svg.getBoundingClientRect();
  if(!rect.width||!rect.height)return null;
  const vb=svg.viewBox.baseVal;
  // preserveAspectRatio defaults to xMidYMid meet, so account for letterboxing.
  const scale=Math.min(rect.width/vb.width,rect.height/vb.height);
  const dx=(rect.width-vb.width*scale)/2,dy=(rect.height-vb.height*scale)/2;
  return {x:(ev.clientX-rect.left-dx)/scale+vb.x,
          y:(ev.clientY-rect.top-dy)/scale+vb.y};
}
function staffDirect(){
  const W=680,H=214,baseY=151;
  let out=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="タップで音符を入力するヘ音記号の五線譜"><rect width="${W}" height="${H}" fill="#fff"/>`;
  for(const y of [103,115,127,139,151])out+=`<line x1="48" y1="${y}" x2="${W-18}" y2="${y}" stroke="#506b7b" stroke-width="1.4" pointer-events="none"/>`;
  out+=`<text x="9" y="150" font-size="59" fill="#183145" pointer-events="none">𝄢</text><text x="57" y="41" font-size="14" fill="#476274" pointer-events="none">タップして音符を追加（実音）</text>`;
  for(let st=-5;st<=14;st++){
    const abs=2*7+4+st,oct=Math.floor(abs/7),letter=((abs%7)+7)%7,y=baseY-st*6;
    if(y<103||y>151)out+=`<line x1="300" x2="398" y1="${y}" y2="${y}" stroke="#9db0ba" stroke-dasharray="3 3" pointer-events="none"/>`;
    out+=`<circle cx="335" cy="${y}" r="2" fill="#176a88" opacity=".32" pointer-events="none"/>`;
  }
  out+=`<rect x="40" y="54" width="${W-55}" height="131" fill="transparent" pointer-events="all" aria-label="五線譜の入力範囲"/></svg>`;
  $('directStaff').innerHTML=out;
  const svg=$('directStaff').querySelector('svg');
  bindDirectInput(svg,ev=>{
    const pos=svgCoords(svg,ev);
    if(!pos||pos.y<54||pos.y>185||pos.x<40||pos.x>W-15)return null;
    const step=Math.max(-5,Math.min(14,Math.round((baseY-pos.y)/6)));
    const abs=2*7+4+step,oct=Math.floor(abs/7),letter=((abs%7)+7)%7;
    return pitch(letter,oct,Number($('acc').value));
  });
}
function pianoDirect(){
  const low=24,high=60,whiteW=31,H=148,whites=[];
  for(let m=low;m<=high;m++)if(![1,3,6,8,10].includes(m%12))whites.push(m);
  const W=whites.length*whiteW;
  let out=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="タップで音符を入力するピアノ鍵盤"><rect width="${W}" height="${H}" fill="#f2f6f8" pointer-events="none"/>`;
  whites.forEach((m,i)=>{const x=i*whiteW;out+=`<rect data-key="${m}" role="button" aria-label="${label(m)} を追加" x="${x+1}" y="1" width="${whiteW-2}" height="${H-3}" rx="3" fill="#fff" stroke="#849ca9"/><text x="${x+whiteW/2}" y="${H-12}" text-anchor="middle" font-size="10" fill="#2a5063" pointer-events="none">${pcn[m%12]}</text>`});
  whites.forEach((m,i)=>{const n=m+1;if(n<=high&&[1,3,6,8,10].includes(n%12)){const x=(i+1)*whiteW-11;out+=`<rect data-key="${n}" role="button" aria-label="${label(n)} を追加" x="${x}" y="1" width="22" height="88" rx="3" fill="#263c4c" stroke="#172a36"/><text x="${x+11}" y="76" text-anchor="middle" font-size="9" fill="white" pointer-events="none">${pcn[n%12]}</text>`}});
  out+='</svg>';$('directPiano').innerHTML=out;
  const svg=$('directPiano').querySelector('svg');
  bindDirectInput(svg,ev=>{
    const el=ev.target.closest&&ev.target.closest('[data-key]');
    return el?Number(el.dataset.key):null;
  });
}
function clickInsert(m){picked=m;addNote(m);pickUI();if($('clickPreview').checked)audition(m);$('clickHelp').textContent='追加：'+label(m)+' / '+round(dur())+'拍（挿入位置は③で指定できます）'}
function directRefresh(){staffDirect();pianoDirect()}
function directSet(mode){directMode=mode;$('directStaff').classList.toggle('hidden',mode!=='staff');$('directPiano').classList.toggle('hidden',mode!=='piano');$('entryStaff').classList.toggle('active',mode==='staff');$('entryPiano').classList.toggle('active',mode==='piano');$('clickHelp').textContent=mode==='staff'?'五線譜の線・間をクリックして音符を追加します。':'鍵盤をクリックして音符を追加します（C1〜C4）。'}
function shiftPitch(delta){let oct=Math.floor(picked/12)-1,pc=((picked%12)+12)%12,ix=[0,0,1,2,2,3,3,4,5,5,6,6][pc],diat=oct*7+ix+delta,o=Math.floor(diat/7),i=((diat%7)+7)%7;picked=Math.max(12,Math.min(108,pitch(i,o,Number($('acc').value))));pickUI()}
function noteY(m){const o=Math.floor(m/12)-1,pc=((m%12)+12)%12,i=[0,0,1,2,2,3,3,4,5,5,6,6][pc];return 137-((o-2)*7+i)*6}
// v3.4: score pitch drag. Pointer Events support mouse, pen and touch.
// Only the pitch changes; duration, triplet, tie and event order are retained.
const noteLetters=[0,0,1,2,2,3,3,4,5,5,6,6];
function draggedPitch(m,steps){
  const oct=Math.floor(m/12)-1, pc=((m%12)+12)%12, letter=noteLetters[pc];
  const accidental=pc-semis[letter], absolute=oct*7+letter+steps;
  const nextOct=Math.floor(absolute/7), nextLetter=((absolute%7)+7)%7;
  return Math.max(12,Math.min(108,12*(nextOct+1)+semis[nextLetter]+accidental));
}
function installScoreDrag(){
  const svg=$('score').querySelector('svg');if(!svg)return;
  let drag=null,ghost=null;
  const svgPoint=ev=>{
    const pt=svg.createSVGPoint();pt.x=ev.clientX;pt.y=ev.clientY;
    const matrix=svg.getScreenCTM();
    return matrix?pt.matrixTransform(matrix.inverse()):{x:0,y:0};
  };
  svg.querySelectorAll('[data-index]').forEach(el=>{
    el.addEventListener('pointerdown',ev=>{
      if(ev.button!==0&&ev.pointerType==='mouse')return;
      const index=Number(el.dataset.index),item=seq[index];
      if(!item)return;
      selected=index;
      const pos=svgPoint(ev);
      drag={index,pointerId:ev.pointerId,startY:pos.y,original:item.m,steps:0,moved:false,
        x:Number(el.dataset.x),rowY:Number(el.dataset.rowY)};
      if(item.type==='note'&&item.m!=null){
        ghost=document.createElementNS('http://www.w3.org/2000/svg','g');
        ghost.setAttribute('pointer-events','none');
        ghost.innerHTML='<ellipse rx="12" ry="8" fill="#1683bf" fill-opacity=".4" stroke="#11608c" stroke-width="2"/><text y="-16" text-anchor="middle" font-size="13" font-weight="bold" fill="#11608c"></text>';
        svg.appendChild(ghost);
        ghost.setAttribute('transform',`translate(${drag.x},${drag.rowY+noteY(item.m)-3})`);
        ghost.querySelector('text').textContent=label(item.m);
      }
      el.setPointerCapture(ev.pointerId);
      ev.preventDefault();
    });
    el.addEventListener('pointermove',ev=>{
      if(!drag||drag.pointerId!==ev.pointerId||!ghost)return;
      const dy=svgPoint(ev).y-drag.startY;
      if(Math.abs(dy)>3)drag.moved=true;
      drag.steps=Math.round(-dy/6);
      const m=draggedPitch(drag.original,drag.steps);
      ghost.setAttribute('transform',`translate(${drag.x},${drag.rowY+noteY(m)-3})`);
      ghost.querySelector('text').textContent=label(m);
    });
    const finish=(ev,cancel)=>{
      if(!drag||drag.pointerId!==ev.pointerId)return;
      const d=drag;drag=null;
      if(ghost){ghost.remove();ghost=null}
      if(!cancel&&d.original!=null&&d.moved&&d.steps!==0){
        const next=draggedPitch(d.original,d.steps);
        if(next!==d.original){
          stop();snap();seq[d.index].m=next;render();
          $('status').textContent='音程を変更：'+label(d.original)+' → '+label(next);return;
        }
      }
      stop();selected=d.index;render();$('markHint').textContent=`✅ ${d.index+1}番の音符を選択しました。`;updatePlayStartHint();
    };
    el.addEventListener('pointerup',ev=>finish(ev,false));
    el.addEventListener('pointercancel',ev=>finish(ev,true));
    el.addEventListener('lostpointercapture',ev=>{
      if(drag&&drag.pointerId===ev.pointerId)finish(ev,true);
    });
  });
}
function desc(e){if(e.type==='multi')return `${e.count}小節休み`;if(e.type==='repeat')return '前小節を反復';return `${label(e.m)} ${round(e.d)}拍${e.tie?' タイ':''}${e.slur?' スラー'+(e.slurSpan>1?'（'+(e.slurSpan+1)+'音）':''):''}${e.triplet?' 3連符':''}`}
function render(){
  const n=seq.length,meter=$('meter').value,k=Number($('keySig').value)||0;
  const measureBeats=beats(),available=Math.max(320,Math.min(1060,$('score').clientWidth||680));
  const mode=$('measuresPerLine')?.value||'auto';
  const cap=mode==='auto'?99:Number(mode);
  // Each event belongs to the measure where it begins. No note data is changed
  // when the display wraps to another staff.
  let elapsed=0;
  const groups=[];
  const starts=[],measureFor=[];
  seq.forEach((e,i)=>{
    const m=Math.floor((elapsed+1e-7)/measureBeats);
    if(!groups[m])groups[m]=[];
    groups[m].push(i);
    starts[i]=elapsed;measureFor[i]=m;
    elapsed+=e.d;
  });
  const total=Math.max(1,Math.ceil((elapsed-1e-7)/measureBeats));
  for(let m=0;m<total;m++)if(!groups[m])groups[m]=[];
  const left=46+Math.abs(k)*9+28,right=13;
  const minMeasureWidth=available<520?90:112;
  const multiHidden=new Set();
  for(let i=0;i<seq.length;i++){
    const e=seq[i];
    if(e.type==='multi'&&Number(e.count)>1){
      const first=measureFor[i];
      // A multi-measure rest is one engraved symbol across several measures.
      for(let k=1;k<e.count;k++)multiHidden.add(first+k);
    }
  }
  const measures=groups.flatMap((items,m)=>multiHidden.has(m)?[]:[{
    number:m+1,items,
    width:Math.max(minMeasureWidth,items.length*(available<520?37:43)+17)
  }]);
  if(!measures.length)measures.push({number:1,items:[],width:minMeasureWidth});
  tempoUI();updateCopyControls();
  const rows=[];let row=[],used=left+right;
  for(const m of measures){
    const need=m.width;
    if(row.length&&(row.length>=cap||used+need>available)){
      rows.push(row);row=[];used=left+right;
    }
    row.push(m);used+=need;
  }
  if(row.length)rows.push(row);
  const rowHeight=183,topPad=11,H=rows.length*rowHeight+topPad+10;
  let s=`<svg class="scoreSvg" width="${available}" height="${H}" viewBox="0 0 ${available} ${H}" xmlns="http://www.w3.org/2000/svg"><rect width="${available}" height="${H}" fill="white"/>`;
  const xy={},ys={},rowId={};
  const esc=t=>String(t).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  rows.forEach((line,r)=>{
    const off=topPad+r*rowHeight,base=off+62,staffEnd=available-8;
    for(const y of [62,74,86,98,110])
      s+=`<line x1="8" x2="${staffEnd}" y1="${off+y}" y2="${off+y}" stroke="#536671"/>`;
    s+=`<text x="10" y="${off+102}" font-size="36" fill="#183145">𝄢</text>`;
    if(k){
      const flatYs=[74,92,68,86],sharpYs=[86,68,92,74];
      for(let j=0;j<Math.abs(k);j++){
        const x=43+j*9,y=off+(k<0?flatYs:sharpYs)[j%4];
        s+=`<text x="${x}" y="${y}" font-size="17">${k<0?'♭':'♯'}</text>`;
      }
    }
    const meterX=49+Math.abs(k)*9;
    s+=`<text x="${meterX}" y="${off+83}" font-size="14">${meter==='6/8'?'6':measureBeats}</text><text x="${meterX}" y="${off+102}" font-size="14">${meter==='6/8'?'8':'4'}</text>`;
    s+=`<text x="9" y="${off+40}" font-size="12" font-weight="bold" fill="#176a88">${line[0].number}</text>`;
    const baseWidths=line.map(m=>m.width);
    const sum=baseWidths.reduce((a,b)=>a+b,0);
    const extra=Math.max(0,available-left-right-sum);
    let x=left;
    line.forEach((m,mi)=>{
      const tempoChange=tempoChanges.find(c=>c.measure===m.number);
      if(tempoChange){s+=`<text x="${x+4}" y="${off+25}" font-size="12" font-weight="bold" fill="#a04b0a">♩=${tempoChange.bpm}</text>`}
      const width=m.width+extra*(m.width/sum);
      const count=m.items.length;
      const usable=width-16;
      m.items.forEach((i,j)=>{
        const e=seq[i];
        const nx=x+8+usable*(j+.5)/Math.max(1,count);
        const rowY=off;
        xy[i]=nx;rowId[i]=r;
        if(e.type==='repeat')
          s+=`<text x="${nx-12}" y="${off+96}" font-size="26" font-weight="bold">%</text>`;
        else if(e.type==='multi'){
          // Standard multimeasure-rest sign: heavy bar on middle line,
          // short vertical end strokes, count centered above the staff.
          const x0=nx-22,x1=nx+22,mid=off+86;
          s+=`<line x1="${x0}" y1="${mid}" x2="${x1}" y2="${mid}" stroke="#233b49" stroke-width="7"/>`;
          s+=`<path d="M ${x0} ${mid-10} V ${mid+10} M ${x1} ${mid-10} V ${mid+10}" fill="none" stroke="#233b49" stroke-width="2"/>`;
          s+=`<text x="${nx}" y="${off+49}" text-anchor="middle" font-size="19" font-weight="bold">${e.count}</text>`;
        }else if(e.m===null){
          // Proper music-engraving rest glyph outlines (Noto Music, OFL).
          // SVG paths avoid iOS Safari's inconsistent musical-symbol font fallback.
          const restY=off+86;
          if(Math.abs(e.d-1)<.001 || Math.abs(e.d-.5)<.001 || Math.abs(e.d-.25)<.001){
            const kind=Math.abs(e.d-1)<.001?'quarter':Math.abs(e.d-.5)<.001?'eighth':'sixteenth';
            const dims={quarter:{cx:179,cy:500,s:.062},eighth:{cx:181,cy:500,s:.074},sixteenth:{cx:215,cy:500,s:.063}};
            const g=dims[kind];
            s+=`<path d="${REST_GLYPHS[kind]}" fill="#233b49" transform="translate(${nx-g.cx*g.s} ${restY+g.cy*g.s}) scale(${g.s} ${-g.s})"/>`;
          }else if(Math.abs(e.d-2)<.001){
            // Half rest sits on top of the middle staff line.
            s+=`<rect x="${nx-9}" y="${off+80}" width="18" height="6" fill="#233b49"/>`;
          }else if(Math.abs(e.d-4)<.001){
            // Whole rest hangs below the second staff line from the top.
            s+=`<rect x="${nx-9}" y="${off+74}" width="18" height="6" fill="#233b49"/>`;
          }else{
            s+=`<rect x="${nx-9}" y="${off+80}" width="18" height="6" fill="#233b49"/>`;
          }
          s+=`<text x="${nx}" y="${off+146}" font-size="10" text-anchor="middle">${round(e.d)}拍</text>`;
        }else{
          const y=off+noteY(e.m)-3;ys[i]=y;
          if(y>off+116)
            for(let yy=off+122;yy<=y+2;yy+=12)
              s+=`<line x1="${nx-13}" x2="${nx+13}" y1="${yy}" y2="${yy}" stroke="#536671"/>`;
          if(y<off+56)
            for(let yy=off+50;yy>=y-2;yy-=12)
              s+=`<line x1="${nx-13}" x2="${nx+13}" y1="${yy}" y2="${yy}" stroke="#536671"/>`;
          s+=`<ellipse cx="${nx}" cy="${y}" rx="8" ry="5.5" fill="${e.d>=2&&!e.triplet?'white':'#233b49'}" stroke="#233b49" stroke-width="1.5"/>`;
          // Short notes (eighths and sixteenths) get their stems in the
          // beam/flag pass below, not here. This avoids doubled stems when
          // a group has to reverse its stem direction.
          if(e.d<4 && e.d>.75){
            const down=noteY(e.m)<=86;
            const stemX=nx+(down?-8:8),endY=y+(down?32:-32);
            s+=`<line x1="${stemX}" y1="${y}" x2="${stemX}" y2="${endY}" stroke="#233b49" stroke-width="2"/>`;
          }
          if(e.dynamic)s+=`<text x="${nx}" y="${off+169}" text-anchor="middle" font-size="13" font-weight="bold" font-style="italic" fill="#8a3865">${esc(e.dynamic)}</text>`;
          if([3,1.5,.75,.375].some(d=>Math.abs(e.d-d)<.0001))
            s+=`<circle cx="${nx+18}" cy="${y}" r="2.4" fill="#233b49"/>`;

          s+=`<text x="${nx}" y="${off+157}" font-size="10" text-anchor="middle">${esc(label(e.m))}</text>`;
        }
        if(i===selected)
          s+=`<rect x="${nx-19}" y="${off+18}" width="38" height="154" fill="#f5b94b" fill-opacity=".16" stroke="#b67b22" stroke-dasharray="4 3" pointer-events="none"/>`;
        s+=`<rect data-index="${i}" data-x="${nx}" data-row-y="${rowY}" x="${nx-19}" y="${off+17}" width="38" height="156" fill="transparent"/>`;
      });
      x+=width;
      s+=`<line x1="${x}" x2="${x}" y1="${off+62}" y2="${off+110}" stroke="#536671"/>`;
    });
  });
  // Ties and slurs connect actual note positions, not a decorative fixed-length arc.
  for(let i=0;i<n-1;i++){
    const e=seq[i],next=seq[i+1];
    if(e.type!=='note'||next.type!=='note'||!xy[i]||!xy[i+1])continue;
    if(e.tie&&e.m===next.m){
      if(rowId[i]===rowId[i+1]){
        const x1=xy[i]+7,x2=xy[i+1]-7,y=ys[i]+8;
        s+=`<path d="M ${x1} ${y} Q ${(x1+x2)/2} ${y+21} ${x2} ${y}" stroke="#176a88" stroke-width="2.5" fill="none"/>`;
      }else{
        const y1=ys[i]+8,y2=ys[i+1]+8;
        s+=`<path d="M ${xy[i]+7} ${y1} Q ${xy[i]+24} ${y1+15} ${available-9} ${y1}" stroke="#176a88" stroke-width="2.3" fill="none"/>`;
        s+=`<path d="M 9 ${y2} Q ${xy[i+1]-10} ${y2+15} ${xy[i+1]-7} ${y2}" stroke="#176a88" stroke-width="2.3" fill="none"/>`;
      }
    }
    if(e.slur && !(e.slurSpan>1)){
      if(rowId[i]===rowId[i+1]){
        const x1=xy[i]+7,x2=xy[i+1]-7,y=Math.max(ys[i],ys[i+1])+17;
        s+=`<path d="M ${x1} ${ys[i]+12} Q ${(x1+x2)/2} ${y+22} ${x2} ${ys[i+1]+12}" stroke="#9a4a9f" stroke-width="2" fill="none"/>`;
      }else{
        s+=`<path d="M ${xy[i]+7} ${ys[i]+12} Q ${xy[i]+30} ${ys[i]+38} ${available-9} ${ys[i]+12}" stroke="#9a4a9f" stroke-width="2" fill="none"/>`;
        s+=`<path d="M 9 ${ys[i+1]+12} Q ${xy[i+1]-20} ${ys[i+1]+38} ${xy[i+1]-7} ${ys[i+1]+12}" stroke="#9a4a9f" stroke-width="2" fill="none"/>`;
      }
    }
  }
  // Multi-note slurs: draw one curve from the chosen start to end,
  // split gracefully across staff rows. All intermediate notes are included.
  for(let i=0;i<n;i++){
    const e=seq[i];if(!e||e.type!=='note'||!e.slur||!(e.slurSpan>1))continue;
    const end=Math.min(n-1,i+e.slurSpan);
    if(!xy[i]||!xy[end]||seq.slice(i,end+1).some(q=>q.type!=='note'))continue;
    for(let r=rowId[i];r<=rowId[end];r++){
      const first=r===rowId[i]?i:seq.findIndex((q,k)=>k>i&&k<=end&&rowId[k]===r);
      let last=end;
      if(r!==rowId[end]){last=end;while(last>i&&rowId[last]!==r)last--}
      if(first<0||last<first||!xy[first]||!xy[last])continue;
      const startX=r===rowId[i]?xy[first]+7:9;
      const endX=r===rowId[end]?xy[last]-7:available-9;
      const startY=ys[first]+13,endY=ys[last]+13;
      const middleY=Math.max(...Array.from({length:last-first+1},(_,j)=>ys[first+j]).filter(Number.isFinite))+39;
      s+=`<path d="M ${startX} ${startY} Q ${(startX+endX)/2} ${middleY} ${endX} ${endY}" stroke="#9a4a9f" stroke-width="2.6" fill="none"/>`;
    }
  }
  // Repeats and first/second endings are displayed at measure boundaries.
  if(repeatCfg.enabled){
    const cfg=repeatCfg;
    const validRange=cfg.start>=1&&cfg.end>=cfg.start&&cfg.end<=total&&(!cfg.endings||(cfg.first>=cfg.start&&cfg.first<=cfg.end&&cfg.secondEnd>cfg.end&&cfg.secondEnd<=total));
    if(validRange){
      const loc={};
      rows.forEach((line,r)=>{let x=left;const sum=line.reduce((v,m)=>v+m.width,0);const extra=Math.max(0,available-left-right-sum);line.forEach(m=>{const w=m.width+extra*m.width/sum;loc[m.number]={x0:x,x1:x+w,off:topPad+r*rowHeight,row:r};x+=w})});
      const start=loc[cfg.start],end=loc[cfg.end];
      if(start){const x=start.x0+2,y=start.off;s+=`<line x1="${x}" x2="${x}" y1="${y+62}" y2="${y+110}" stroke="#233b49" stroke-width="3"/><circle cx="${x+7}" cy="${y+81}" r="2.3"/><circle cx="${x+7}" cy="${y+92}" r="2.3"/>`}
      if(end){const x=end.x1-3,y=end.off;s+=`<line x1="${x}" x2="${x}" y1="${y+62}" y2="${y+110}" stroke="#233b49" stroke-width="3"/><circle cx="${x-7}" cy="${y+81}" r="2.3"/><circle cx="${x-7}" cy="${y+92}" r="2.3"/>`}
      if(cfg.endings){
        for(let m=cfg.first;m<=cfg.secondEnd;m++){
          const at=loc[m];if(!at)continue;
          const isFirst=m<=cfg.end,from=isFirst?cfg.first:cfg.end+1,to=isFirst?cfg.end:cfg.secondEnd;
          s+=`<line x1="${at.x0+2}" x2="${at.x1-2}" y1="${at.off+45}" y2="${at.off+45}" stroke="#176a88" stroke-width="2"/>`;
          if(m===from)s+=`<path d="M ${at.x0+2} ${at.off+45} v 13" stroke="#176a88" stroke-width="2"/><text x="${at.x0+7}" y="${at.off+40}" fill="#176a88" font-size="12">${isFirst?'1.':'2.'}</text>`;
          if(m===to)s+=`<line x1="${at.x1-2}" x2="${at.x1-2}" y1="${at.off+45}" y2="${at.off+57}" stroke="#176a88" stroke-width="2"/>`;
        }
      }
    }
  }
  // Eighth-note beams: single notes get proper curved flags; grouped
  // notes share a beam. Optional beams may bridge eighth rests.
  const beamable=i=>seq[i]?.type==='note'&&seq[i].m!=null&&seq[i].d<=.75&&seq[i].d>=.125;
  const restInBeam=i=>seq[i]?.type==='rest'&&seq[i].m==null&&seq[i].d<=.75&&seq[i].d>=.125;
  const is16=e=>e.d<=.251;
  const beatUnit=meter==='6/8'?1.5:1;
  const beamAcrossRest=$('beamAcrossRest').checked;
  const beatBoundary=i=>{
    const measureStart=measureFor[i]*measureBeats;
    const t=starts[i]-measureStart;
    return Math.abs(t/beatUnit-Math.round(t/beatUnit))<0.0001;
  };
  function joinable(prev,cur){
    if(measureFor[prev]!==measureFor[cur]||rowId[prev]!==rowId[cur])return false;
    if(seq[cur].beam==='break')return false;
    if(seq[cur].beam==='join')return true;
    if(beatBoundary(cur))return false;
    return true;
  }
  // A single note uses a curved filled flag. A beamed group uses
  // a single sloped beam with stems meeting it (no duplicate stems).
  function beamEnd(group){
    const notes=group.filter(beamable);
    if(!notes.length)return;
    const middle=notes.reduce((sum,i)=>sum+noteY(seq[i].m),0)/notes.length;
    // Low notes use up-stems, high notes use down-stems.
    const down=middle<=86;
    const sx=i=>xy[i]+(down?-8:8);
    const ink='#233b49';
    const isSixteenth=i=>is16(seq[i]);
    if(notes.length>=2){
      const first=notes[0],last=notes[notes.length-1];
      const x0=sx(first),x1=sx(last),dx=Math.max(1,x1-x0);
      // Music engraving uses a gentle beam angle, not a flat bar
      // regardless of pitch. 24 SVG units is a two-space limit.
      const rise=Math.max(-24,Math.min(24,ys[last]-ys[first]));
      const t=i=>(sx(i)-x0)/dx;
      // Preserve a minimum stem length for every note, including
      // wide leaps. This also avoids a beam crossing a notehead.
      const intercept=down
        ?Math.max(...notes.map(i=>ys[i]+32-rise*t(i)))
        :Math.min(...notes.map(i=>ys[i]-32-rise*t(i)));
      const beamY=i=>intercept+rise*t(i);
      for(const i of notes){
        s+=`<line x1="${sx(i)}" y1="${ys[i]}" x2="${sx(i)}" y2="${beamY(i)}" stroke="${ink}" stroke-width="2"/>`;
      }
      s+=`<line x1="${x0}" y1="${beamY(first)}" x2="${x1}" y2="${beamY(last)}" stroke="${ink}" stroke-width="5" stroke-linecap="butt"/>`;
      // The second beam follows the same slope as the primary beam.
      const secondary=down?-8:8;
      for(let q=0;q<notes.length;q++){
        const i=notes[q];if(!isSixteenth(i))continue;
        if(q>0&&isSixteenth(notes[q-1])&&notes[q-1]===i-1)continue;
        const next=q+1<notes.length&&isSixteenth(notes[q+1])&&notes[q+1]===i+1?notes[q+1]:null;
        const ex=next!=null?sx(next):sx(i)+(q<notes.length-1?13:-13);
        const ey=next!=null?beamY(next):beamY(i)+rise*(ex-sx(i))/dx;
        s+=`<line x1="${sx(i)}" y1="${beamY(i)+secondary}" x2="${ex}" y2="${ey+secondary}" stroke="${ink}" stroke-width="3"/>`;
      }
      if(seq[first].triplet){
        const cx=(x0+x1)/2,cy=(beamY(first)+beamY(last))/2;
        s+=`<text x="${cx}" y="${cy+(down?23:-10)}" text-anchor="middle" font-size="14" fill="#176a88">3</text>`;
      }
    }else{
      const i=notes[0],x=sx(i),y=ys[i];
      const edge=y+(down?34:-34);
      s+=`<line x1="${x}" y1="${y}" x2="${x}" y2="${edge}" stroke="${ink}" stroke-width="2"/>`;
      // The flag bends TOWARD the notehead: downward for up-stems,
      // upward for down-stems. Previous version reversed this.
      const flag=(offset)=>{
        const dir=down?-1:1;
        const yy=edge-dir*offset;
        const side=down?-1:1;
        return `<path d="M ${x} ${yy} C ${x+side*8} ${yy+dir*3}, ${x+side*20} ${yy+dir*12}, ${x+side*14} ${yy+dir*27} C ${x+side*17} ${yy+dir*16}, ${x+side*5} ${yy+dir*14}, ${x} ${yy+dir*11} Z" fill="${ink}"/>`;
      };
      s+=flag(0);if(isSixteenth(i))s+=flag(9);
      if(seq[i].triplet)s+=`<text x="${xy[i]}" y="${topPad+rowId[i]*rowHeight+25}" font-size="13" fill="#176a88" text-anchor="middle">3</text>`;
    }
  }
  for(let i=0;i<n;){
    if(!beamable(i)){i++;continue}
    const group=[i];let j=i+1;
    while(j<n&&j-i<9){
      if(beamable(j)&&joinable(j-1,j)&&seq[j].triplet===seq[i].triplet){group.push(j);j++;continue}
      if(restInBeam(j)&&(seq[j].bridgeRest===true||(seq[j].bridgeRest==null&&beamAcrossRest))){
        // Explicit rest bridging is local to the selected rest, not a global
        // toggle. Require actual eighth-note neighbors within one measure.
        let next=j+1;
        while(next<n&&next-j<=2&&restInBeam(next)&&
              (seq[next].bridgeRest===true||(seq[next].bridgeRest==null&&beamAcrossRest)))next++;
        const explicit=Array.from({length:next-j},(_,q)=>seq[j+q].bridgeRest===true).some(Boolean);
        const sameMeasure=next<n&&measureFor[i]===measureFor[next]&&rowId[i]===rowId[next];
        const boundaryOK=explicit||(
          joinable(j-1,j)&&joinable(next-1,next));
        if(sameMeasure&&boundaryOK&&beamable(next)&&seq[next].beam!=='break'&&seq[next].triplet===seq[i].triplet){
          for(let k=j;k<next;k++)group.push(k);
          group.push(next);j=next+1;continue;
        }
      }
      break;
    }
    beamEnd(group);i=j;
  }
  s+='</svg>';
  $('score').innerHTML=s;
  const selectedRegion=$('score').querySelector('[data-index="'+selected+'"]');
  if(selectedRegion)selectedRegion.classList.add('selected-note');
  installScoreDrag();
  $('chips').replaceChildren();
  seq.forEach((e,i)=>{
    let b=document.createElement('button');
    b.textContent=`${i+1}: ${desc(e)}`;
    if(i===selected)b.className='selected';if(i===slurStart){b.style.outline='3px solid #9a4a9f';b.title='スラーの始点として指定中'}
    b.onclick=()=>{stop();selected=i;render();$('markHint').textContent=`✅ ${i+1}番の音符を選択しました。タイ・スラーを設定できます。`;updatePlayStartHint()};
    $('chips').appendChild(b);
  });
  $('count').textContent=`（${n}項目・約${total}小節・${rows.length}段）`;
  $('from').max=total;$('to').max=total;$('playStartMeasure').max=total;
  if(Number($('to').value)>total||Number($('to').value)<1)$('to').value=total;
  let e=seq[selected];
  $('tie').checked=!!(e&&e.tie);
  $('tie').disabled=!(e&&e.type==='note');
  $('slur').checked=!!(e&&e.slur);$('slur').disabled=!(e&&e.type==='note');
  if(e?.type==='note'){$('beamEdit').value=e.beam||'auto';$('dynamicEdit').value=e.dynamic||'';}
  $('restBridgeHint').textContent=e?.type==='rest'&&e.d<=.75?
    `選択中：${selected+1}番の休符（${e.bridgeRest===true?'連桁でつなぐ':e.bridgeRest===false?'ここで切る':'自動'}）`:
    '8分休符を選ぶと、つなぐ・切るを切り替えられます。';
  $('beamSelectedHint').textContent=e?.type==='note'&&e.d<=.75?`選択中：${selected+1}番（${({auto:'自動',join:'前とつなぐ',break:'手前で切る'})[e.beam||'auto']}）`:'8分音符をタップすると連桁を変更できます。';
  $('editMarkInfo').textContent=selected<0?'楽譜または下の音符一覧から音を選んでください。':`✅ 選択中：${selected+1}番 ${desc(e)}${slurStart>=0?' ／ スラー始点：'+(slurStart+1)+'番':''}`;
  $('markSlurStart').disabled=!(e&&e.type==='note');$('markSlurEnd').disabled=!(e&&e.type==='note'&&slurStart>=0&&selected>slurStart);$('clearSlur').disabled=!(e&&e.type==='note'&&e.slur);$('toggleTie').disabled=!(e&&e.type==='note');
  if(e&&e.type==='note'){
    $('editPitch').value=String(e.m);
    $('editDur').value=String(round(e.d));
  }
  ['insertBefore','insertAfter'].forEach(id=>$(id).disabled=selected<0);
  ['insertBefore','insertAfter','appendMode'].forEach(id=>$(id).classList.toggle('active',
    (id==='insertBefore'&&insertion==='before')||
    (id==='insertAfter'&&insertion==='after')||
    (id==='appendMode'&&insertion==='end')));
  updatePlayStartHint();
  persist();
}
let scoreResizeTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(scoreResizeTimer);
  scoreResizeTimer=setTimeout(()=>render(),180);
});
function setupPitchChoices(){const sel=$('editPitch');sel.innerHTML='<option value="null">休符</option>';for(let m=24;m<=84;m++){let o=document.createElement('option');o.value=m;o.textContent=label(m);sel.appendChild(o)}}
// 0-100% controls the app's own maximum output gain, not the hardware volume.
// The squared curve makes low and middle levels easier to adjust.
// 100% corresponds to the previous 4000% gain ceiling.
function normalizedVolume(v){
  const x=Number(v);
  return Number.isFinite(x)?Math.max(0,Math.min(100,x)):20;
}
function legacyVolumeToPercent(v){
  const n=Number(v);
  if(!Number.isFinite(n))return 20;
  // Previous saved values were 0-4000, not the new percentage.
  return Math.round(100*Math.sqrt(Math.max(0,Math.min(4000,n))/4000));
}
function setAppVolume(){
  const v=normalizedVolume($('volume').value)/100;
  if(master&&audio)master.gain.setTargetAtTime(40*v*v,audio.currentTime,.025);
}
function showVolume(){
  const v=normalizedVolume($('volume').value);
  $('voltext').textContent=v+'%';
  $('volMultiplier').textContent=v===100?'アプリ側の最大設定（端末の最大音量とは別）':'アプリ側の音量：'+v+'%（最大100%）';
}
function setVolumeValue(v){
  $('volume').value=Math.round(normalizedVolume(v));
  showVolume();setAppVolume();persist();
}
function initAudio(){let AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('AudioContext unavailable');if(!audio){audio=new AC();let compressor=audio.createDynamicsCompressor();compressor.threshold.value=-22;compressor.knee.value=8;compressor.ratio.value=18;compressor.attack.value=.002;compressor.release.value=.14;master=audio.createGain();master.connect(compressor);const safety=audio.createGain();safety.gain.value=.85;compressor.connect(safety);safety.connect(audio.destination)}setAppVolume();return audio.resume()}
// Harmonic and envelope presets for synthetic brass timbres (concert-pitch playback).
const BRASS_PRESETS={
 tuba:{harm:[1,.55,.27,.14,.07,.03,.015],cutoff:7,low:260,high:1500,attack:.045,release:.11,level:.38},
 trumpet:{harm:[1,.92,.73,.58,.4,.25,.14,.07],cutoff:19,low:1000,high:4800,attack:.018,release:.065,level:.26},
 cornet:{harm:[1,.72,.46,.28,.16,.09,.04],cutoff:14,low:750,high:3400,attack:.025,release:.09,level:.3},
 altohorn:{harm:[1,.57,.34,.18,.09,.04],cutoff:10,low:400,high:2600,attack:.04,release:.105,level:.35},
 frenchhorn:{harm:[1,.5,.3,.2,.12,.06,.03],cutoff:9,low:430,high:2300,attack:.05,release:.14,level:.36},
 trombone:{harm:[1,.82,.59,.36,.22,.12,.06],cutoff:14,low:500,high:3300,attack:.027,release:.085,level:.31},
 euphonium:{harm:[1,.59,.36,.19,.095,.045,.02],cutoff:9,low:330,high:2200,attack:.043,release:.12,level:.36},
 brass:{harm:[1,.7,.42,.25,.14,.08,.04,.02],cutoff:13,low:450,high:2500,attack:.025,release:.06,level:.32}
};
const BRASS_WAVES={};
function tone(m,t,len){
 if(m===null||len<=0)return;
 const name=$('timbre').value;
 const preset=BRASS_PRESETS[name];
 const hz=440*Math.pow(2,(m-69)/12);
 const osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter();
 osc.frequency.value=hz;
 if(preset){
   if(!BRASS_WAVES[name]){
     const real=new Float32Array(preset.harm.length+1),imag=new Float32Array(preset.harm.length+1);
     preset.harm.forEach((v,i)=>{imag[i+1]=v});
     BRASS_WAVES[name]=audio.createPeriodicWave(real,imag);
   }
   osc.setPeriodicWave(BRASS_WAVES[name]);
 }else osc.type='sine';
 filter.type='lowpass';
 filter.frequency.value=preset?Math.min(preset.high,Math.max(preset.low,hz*preset.cutoff)):16000;
 const a=Math.min(preset?.attack??.015,Math.max(.008,len*.3));
 const r=Math.min(preset?.release??.06,Math.max(.012,len*.3));
 const level=preset?.level??.28;
 gain.gain.setValueAtTime(.0001,t);
 gain.gain.exponentialRampToValueAtTime(level,t+a);
 gain.gain.setValueAtTime(level,Math.max(t+a,t+len-r));
 gain.gain.exponentialRampToValueAtTime(.0001,t+len);
 osc.connect(filter);filter.connect(gain);gain.connect(master);
 osc.start(t);osc.stop(t+len+.03);nodes.push(osc);
}
function expand(){
  let result=[],prior=[],sourceBeat=0;
  seq.forEach((e,i)=>{
    const sourceMeasure=Math.floor((sourceBeat+1e-7)/beats())+1;
    sourceBeat+=e.d;
    if(e.type==='repeat'){
      if(prior.length){const copy=prior.map(x=>({...x}));result.push(...copy);prior=copy}
      else{const r={type:'rest',m:null,d:beats(),_source:i,_measure:sourceMeasure};result.push(r);prior=[r]}
    }else if(e.type==='multi'){
      const r={type:'rest',m:null,d:e.d,_source:i,_measure:sourceMeasure};result.push(r);prior=[r]
    }else{
      const x={...e,_source:i,_measure:sourceMeasure};result.push(x);prior.push(x);
      if(prior.reduce((a,v)=>a+v.d,0)>=beats()-.0001)prior=[x]
    }
  });
  return result;
}
function repeatOrder(events){
  const cfg=repeatCfg;
  if(!cfg.enabled)return events;
  const maxMeasure=Math.max(1,Math.ceil(events.reduce((a,e)=>a+e.d,0)/beats()-1e-7));
  if(cfg.start<1||cfg.end<cfg.start||cfg.end>maxMeasure||cfg.endings&&(cfg.first<cfg.start||cfg.first>cfg.end||cfg.secondEnd<=cfg.end||cfg.secondEnd>maxMeasure))return events;
  const buckets=Array.from({length:maxMeasure+1},()=>[]);let t=0;
  for(const e of events){const m=Math.min(maxMeasure,Math.floor((t+1e-7)/beats())+1);buckets[m].push(e);t+=e.d}
  const order=[];
  for(let m=1;m<=maxMeasure;m++){
    if(m===cfg.end+1){
      for(let r=cfg.start;r<=(cfg.endings?cfg.first-1:cfg.end);r++)order.push(r);
    }
    order.push(m);
  }
  return order.flatMap(m=>buckets[m].map(e=>({...e})));
}
function readRepeatConfig(){
  const c={enabled:$('repEnabled').checked,start:Number($('repStart').value),end:Number($('repEnd').value),endings:$('endingEnabled').checked,first:Number($('endingFirst').value),secondEnd:Number($('endingSecondEnd').value)};
  const total=Math.max(1,Math.ceil(seq.reduce((a,e)=>a+e.d,0)/beats()-1e-7));
  if(c.enabled&&(!Number.isInteger(c.start)||!Number.isInteger(c.end)||c.start<1||c.end<c.start||c.end>total||c.endings&&(!Number.isInteger(c.first)||!Number.isInteger(c.secondEnd)||c.first<c.start||c.first>c.end||c.secondEnd<=c.end||c.secondEnd>total))){
    $('repeatHint').textContent='⚠️ 小節番号を確認してください。反復終了は曲の範囲内、1番カッコ開始は反復区間内、2番カッコ終了は反復終了より後の小節にしてください。';return;
  }
  repeatCfg=c;$('repeatHint').textContent='設定済み：'+(c.enabled?`${c.start}〜${c.end}小節を反復${c.endings?'（1番・2番カッコあり）':''}`:'繰り返しなし');render();
}
function showRepeatConfig(){
  $('repEnabled').checked=!!repeatCfg.enabled;$('repStart').value=repeatCfg.start;$('repEnd').value=repeatCfg.end;
  $('endingEnabled').checked=!!repeatCfg.endings;$('endingFirst').value=repeatCfg.first;$('endingSecondEnd').value=repeatCfg.secondEnd;
}
['repEnabled','repStart','repEnd','endingEnabled','endingFirst','endingSecondEnd'].forEach(id=>$(id).addEventListener('change',readRepeatConfig));
async function audition(m){
  if(m==null)return;
  try{
    await initAudio();
    tone(m,audio.currentTime+.015,.27);
    $('inputSoundStatus').textContent='🔊 入力音：'+label(m);
  }catch(e){$('inputSoundStatus').textContent='音声が再生できません。端末の消音設定も確認してください。'}
}
async function preview(m){stop();if(m==null)return;let id=token;try{await initAudio();if(id!==token)return;tone(m,audio.currentTime+.02,.6);$('status').textContent='試聴：'+label(m)}catch(e){$('status').textContent='音声を再生できませんでした'}}
async function play(){
  stop();
  if(!seq.length){$('status').textContent='先に音符を入力してください';return}
  const id=token;
  try{
    await initAudio();if(id!==token)return;
    const loop=$('loop').checked;
    const startMode=$('playStartMode').value;
    const totalMeasures=Math.max(1,Math.ceil(seq.reduce((a,e)=>a+e.d,0)/beats()-1e-7));
    const measureInput=Number($('playStartMeasure').value);
    if(!loop&&startMode==='measure'&&(!Number.isInteger(measureInput)||measureInput<1||measureInput>totalMeasures)){
      $('status').textContent=`⚠️ 開始小節は1〜${totalMeasures}の範囲で指定してください。`;return;
    }
    if(!loop&&startMode==='selected'&&(selected<0||selected>=seq.length)){
      $('status').textContent='⚠️ ③の楽譜から再生開始したい音符を選んでください。';return;
    }
    const startMeasure=Number($('from').value)||1,endMeasure=Number($('to').value)||1;
    if(loop&&(startMeasure<1||endMeasure<startMeasure||endMeasure>totalMeasures)){
      $('status').textContent=`⚠️ 繰り返し範囲は1〜${totalMeasures}小節で、開始≦終了にしてください。`;return;
    }
    const expanded=repeatOrder(expand());
    const items=[];let elapsed=0,started=startMode==='all'||loop;
    for(const e of expanded){
      const measure=Math.floor((elapsed+1e-6)/beats())+1;
      if(!loop&&!started){
        if(startMode==='measure'&&measure>=measureInput)started=true;
        else if(startMode==='selected'&&e._source===selected)started=true;
      }
      if(loop?(measure>=startMeasure&&measure<=endMeasure):started)items.push(e);
      elapsed+=e.d;
    }
    if(!items.length){$('status').textContent='⚠️ 指定位置に再生できる音符がありません';return}
    if($('editReady'))$('editReady').textContent='▶ 再生中（入力すると停止します）';
    $('status').textContent=loop?`${startMeasure}〜${endMeasure}小節を繰り返し再生`:(startMode==='measure'?`${measureInput}小節目から再生準備中`:(startMode==='selected'?`${selected+1}番の音符から再生準備中`:'曲の最初から再生準備中'));
    const lengths=items.map(e=>e.d*60/tempoAt(e._measure||1));
    const offsets=[];let total=0;
    lengths.forEach(v=>{offsets.push(total);total+=v});
    // Schedule sound using the AudioContext clock. Drive the visual cursor from
    // that same clock rather than independent setTimeout callbacks.
    // Audio output latency is subtracted to approximate when the sound is heard.
    const outputDelay=Math.max(0,Math.min(.25,(audio.baseLatency||0)+(audio.outputLatency||0)));
    setScorePlaying(true);
    const cycle=()=>{
      if(id!==token)return;
      const start=audio.currentTime+.10;
      let t=0;
      // Preserve ties by scheduling one continuous tone across tied notes.
      for(let i=0;i<items.length;){
        const e=items[i];let advance=1,hold=lengths[i];
        if(e.type==='note'){
          while(items[i+advance-1]?.tie&&items[i+advance]?.type==='note'&&items[i+advance].m===e.m){
            hold+=lengths[i+advance];advance++;
          }
          tone(e.m,start+t,Math.max(.07,hold*(advance>1?1:.92)));
        }
        t+=hold;i+=advance;
      }
      let lastIndex=-2;
      const tick=()=>{
        if(id!==token)return;
        const elapsed=audio.currentTime-outputDelay-start;
        if(elapsed>=total){
          playingIndex=-1;clearPlayingNote();
          if(loop){cycle();return}
          setScorePlaying(false);
          $('status').textContent='再生終了。続けて音符を入力・編集できます';$('bar').style.width='100%';playbackFrame=0;if($('editReady'))$('editReady').textContent='✅ 再生終了・編集できます';return;
        }
        if(elapsed>=0){
          // Binary search finds the current written event even for fast notes.
          let lo=0,hi=offsets.length-1;
          while(lo<hi){const mid=Math.ceil((lo+hi)/2);if(offsets[mid]<=elapsed)lo=mid;else hi=mid-1}
          if(lo!==lastIndex){
            const e=items[lo],source=Number.isInteger(e._source)?e._source:-1;
            showPlayingNote(e.type==='note'?source:-1);
            $('status').textContent='再生中：'+label(e.m);
            lastIndex=lo;
          }
          $('bar').style.width=Math.min(100,100*elapsed/total)+'%';
        }
        playbackFrame=requestAnimationFrame(tick);
      };
      playbackFrame=requestAnimationFrame(tick);
    };
    cycle();
  }catch(e){setScorePlaying(false);playingIndex=-1;clearPlayingNote();$('status').textContent='音声再生に失敗しました'}
}
function updatePlayStartHint(){
  const mode=$('playStartMode').value;
  $('playStartMeasureWrap').classList.toggle('hidden',mode!=='measure');
  $('playFromHere').textContent=mode==='all'?'▶ 最初から再生':mode==='measure'?'▶ 指定小節から再生':'▶ 選択音から再生';
  const loop=$('loop').checked;
  $('playStartHint').textContent=loop?'🔁 上の再生ボタンでは繰り返し範囲を使います。「ここから再生」を押すと繰り返しを解除して途中再生します。':mode==='all'?'曲の最初から再生します。':mode==='measure'?`${$('playStartMeasure').value||1}小節目から最後まで再生します。`:(selected>=0?`選択中の${selected+1}番の音符から最後まで再生します。`:'③の楽譜で音符をタップして選んでください。');
}
$('playStartMode').addEventListener('change',updatePlayStartHint);
$('playStartMeasure').addEventListener('input',updatePlayStartHint);
$('loop').addEventListener('change',updatePlayStartHint);
['followNote','blinkNote','autoScroll'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='followNote'){if(!$(id).checked)clearPlayingNote();else if(playingIndex>=0){const i=playingIndex;playingIndex=-1;showPlayingNote(i)}}else if(id==='blinkNote'){$('score').querySelector('.playing-note')?.classList.toggle('is-blinking',$('blinkNote').checked)}}));
$('staffMode').onclick=()=>{$('staffInput').classList.remove('hidden');$('solInput').classList.add('hidden');$('staffMode').classList.add('active');$('solMode').classList.remove('active')};$('solMode').onclick=()=>{$('staffInput').classList.add('hidden');$('solInput').classList.remove('hidden');$('staffMode').classList.remove('active');$('solMode').classList.add('active')};
names.forEach((name,i)=>{let b=document.createElement('button');b.textContent=name;b.onclick=()=>{const m=pitch(i,Number($('oct').value),Number($('solAcc').value));addNote(m);if($('clickPreview').checked)audition(m)};$('solKeys').appendChild(b)});
$('entryStaff').onclick=()=>directSet('staff');$('entryPiano').onclick=()=>directSet('piano');$('acc').onchange=()=>{picker();directRefresh()};$('keySig').onchange=()=>{picker();directRefresh();render()};$('pitchDown').onclick=()=>shiftPitch(-1);$('pitchUp').onclick=()=>shiftPitch(1);$('pitchAdd').onclick=()=>{addNote(picked);if($('clickPreview').checked)audition(picked)};$('pitchPreview').onclick=()=>preview(picked);$('octDown').onclick=()=>{octaveShift=Math.max(-1,octaveShift-1);picker()};$('octUp').onclick=()=>{octaveShift=Math.min(2,octaveShift+1);picker()};$('insertBefore').onclick=()=>{insertion='before';render()};$('insertAfter').onclick=()=>{insertion='after';render()};$('appendMode').onclick=()=>{insertion='end';render()};$('rest').onclick=()=>addNote(null);$('multiAdd').onclick=()=>addSpecial('multi');$('repeatAdd').onclick=()=>addSpecial('repeat');$('tie').onchange=()=>{let e=seq[selected];if(e&&e.type==='note'){if($('tie').checked&&(seq[selected+1]?.type!=='note'||seq[selected+1]?.m!==e.m)){$('markHint').textContent='タイは次の音が同音のときだけ設定できます。';render();return}stop();snap();e.tie=$('tie').checked;render()}};$('slur').onchange=()=>{let e=seq[selected];if(e&&e.type==='note'){stop();snap();e.slur=$('slur').checked;e.slurSpan=0;render()}};
// Retrospective articulation editing. Pick any old note in the score/chip list.
$('markSlurStart').onclick=()=>{if(selected<0||seq[selected]?.type!=='note')return;slurStart=selected;$('markHint').textContent=`${selected+1}番をスラーの始点にしました。終点の音符を選んで「終点にする」を押してください。`;render()};
$('markSlurEnd').onclick=()=>{
  const start=slurStart,end=selected;
  if(start<0||end<=start||seq.slice(start,end+1).some(e=>e.type!=='note')){$('markHint').textContent='始点より後の音符を選択してください。途中に休符がある場合はつなげません。';return}
  stop();snap();seq[start].slur=true;seq[start].slurSpan=end-start;
  // Older one-step slurs in this region would clutter the new long slur.
  for(let i=start+1;i<end;i++){seq[i].slur=false;seq[i].slurSpan=0}
  slurStart=-1;render();$('markHint').textContent=`✅ ${start+1}番から${end+1}番まで（${end-start+1}音）のスラーを設定しました。`; 
};
$('clearSlur').onclick=()=>{if(selected<0||seq[selected]?.type!=='note')return;stop();snap();seq[selected].slur=false;seq[selected].slurSpan=0;render();$('markHint').textContent='選択音から始まるスラーを解除しました。'};
$('toggleTie').onclick=()=>{
  const e=seq[selected],next=seq[selected+1];if(!e||e.type!=='note')return;
  if(!e.tie&&(!next||next.type!=='note'||next.m!==e.m)){$('markHint').textContent='タイは次の音符と同じ高さのときだけ設定できます。違う音程はスラーを使ってください。';return}
  stop();snap();e.tie=!e.tie;render();$('markHint').textContent=e.tie?'次の同音へのタイを設定しました。':'タイを解除しました。';
};
$('apply').onclick=()=>{let e=seq[selected];if(!e||!['note','rest'].includes(e.type))return;stop();snap();e.m=$('editPitch').value==='null'?null:Number($('editPitch').value);e.type=e.m===null?'rest':'note';e.d=Number($('editDur').value);e.triplet=false;render()};$('preview').onclick=()=>{let e=seq[selected];if(e)preview(e.m)};$('delete').onclick=()=>{if(selected<0)return;stop();snap();seq.splice(selected,1);selected=Math.min(selected,seq.length-1);render()};$('undo').onclick=()=>{if(!undo.length)return;stop();{const prev=JSON.parse(undo.pop());if(Array.isArray(prev)){seq=prev}else{seq=prev.seq;tempoChanges=cleanTempoChanges(prev.tempoChanges);repeatCfg=prev.repeatCfg||repeatCfg;showRepeatConfig()}selected=Math.min(selected,seq.length-1);render()}};$('clear').onclick=()=>{slurStart=-1;if(seq.length&& !confirm('曲を全消去しますか？'))return;stop();snap();seq=[];selected=-1;render()};$('play').onclick=play;$('playFromHere').onclick=()=>{if($('loop').checked){$('loop').checked=false;}play()};$('stop').onclick=stop;
$('floatingStop').onclick=()=>{if(isScorePlaying)stop();else play()};
// Capture clicks during playback so tapping the moving score only stops playback,
// without accidentally selecting, dragging or editing a note.
// Allow swiping the score freely while playing. Touch gestures disable following.
$('score').addEventListener('touchstart',()=>{if(isScorePlaying)pauseFollowing()},{passive:true});
$('score').addEventListener('wheel',()=>{if(isScorePlaying)pauseFollowing()},{passive:true});
window.addEventListener('scroll',()=>{if(isScorePlaying && Date.now()>ignoreScrollUntil)pauseFollowing()},{passive:true});
$('followResume').onclick=resumeFollowing;
// While playback is active, taps on the score do not edit notes. Use the fixed stop button.
$('score').addEventListener('click',event=>{if(!isScorePlaying)return;event.preventDefault();event.stopImmediatePropagation();},true);$('demo').onclick=()=>{stop();snap();seq=[0,0,7,7,9,9,7,5,5,4,4,2,2,0].map((v,i)=>({type:'note',m:48+v,d:i===6||i===13?2:1,tie:false,triplet:false}));selected=-1;render()};
$('volume').oninput=()=>{showVolume();setAppVolume();persist()};
$('volumeReset').onclick=()=>setVolumeValue(20);
$('beamAcrossRest').checked=localStorage.getItem('yasu-beam-across-rest')==='1';
$('beamAcrossRest').addEventListener('change',()=>{localStorage.setItem('yasu-beam-across-rest',$('beamAcrossRest').checked?'1':'0');render()});
$('beamMode').addEventListener('change',()=>{$('beamHint').textContent='次に入力する音符：'+({auto:'自動（拍ごとに連桁）',join:'前の音符とつなぐ',break:'前の音符と分ける'}[$('beamMode').value]);});
// Easy beam editing: select the second note and tap one action, no dropdown/apply.
function changeBeam(mode){
  const e=seq[selected];
  if(!e||e.type!=='note'||e.d>.75){
    $('beamEditHint').textContent='先に楽譜の8分音符（または16分音符）をタップしてね。';return;
  }
  if(mode==='join'){
    const previous=seq[selected-1];
    if(!previous||previous.type!=='note'||previous.d>.75){
      $('beamEditHint').textContent='直前に8分音符などがありません。つなぐ2つ目の音符を選んでね。';return;
    }
    // Disallow crossing a measure boundary or a system break.
    let elapsed=0;
    for(let i=0;i<selected;i++)elapsed+=seq[i].d;
    const mb=beats();
    if(Math.abs(elapsed/mb-Math.round(elapsed/mb))<.0001){
      $('beamEditHint').textContent='小節線をまたいで連桁はつなげられません。';return;
    }
  }
  stop();snap();e.beam=mode;render();
  $('beamEditHint').textContent=mode==='join'?'✅ 選択した音符を直前の音符とつなぎました。':mode==='break'?'✅ この音符の手前で連桁を切りました。':'✅ この音符の連桁を自動に戻しました。';
}
function changeRestBridge(mode){
  const e=seq[selected];
  if(!e||e.type!=='rest'||e.d>.75){
    $('restBridgeHint').textContent='先に楽譜の8分休符をタップしてね。';return;
  }
  const before=seq[selected-1],after=seq[selected+1];
  if(mode===true&&(!before||!after||before.type!=='note'||after.type!=='note'||before.d>.75||after.d>.75)){
    $('restBridgeHint').textContent='8分休符の前後に8分音符（または16分音符）が必要です。';return;
  }
  if(mode===true){
    const elapsed=seq.slice(0,selected).reduce((sum,x)=>sum+x.d,0);
    const measure=beats();
    if(Math.floor((elapsed+.00001)/measure)!==Math.floor((elapsed+e.d+.00001)/measure)){
      $('restBridgeHint').textContent='小節線をまたぐ連桁にはできません。';return;
    }
  }
  stop();snap();e.bridgeRest=mode;render();
  $('restBridgeHint').textContent=mode===true?'✅ 休符の前後を連桁でつなぐ設定にしました。':mode===false?'✅ 休符のところで連桁を切りました。':'✅ 休符の連桁設定を自動に戻しました。';
}
$('restBridgeJoin').onclick=()=>changeRestBridge(true);
$('restBridgeBreak').onclick=()=>changeRestBridge(false);
$('restBridgeAuto').onclick=()=>changeRestBridge(null);
$('beamJoinEasy').onclick=()=>changeBeam('join');
$('beamBreakEasy').onclick=()=>changeBeam('break');
$('beamAutoEasy').onclick=()=>changeBeam('auto');
$('beamApply').onclick=()=>changeBeam($('beamEdit').value);
$('dynamicApply').onclick=()=>{
  const e=seq[selected];if(!e||e.type!=='note'){ $('dynamicHint').textContent='先に③の音符を選んでね。';return;}
  stop();snap();e.dynamic=$('dynamicEdit').value;render();
  $('dynamicHint').textContent=e.dynamic?`${selected+1}番に ${e.dynamic} を表示しました。`:'強弱記号を解除しました。';
};
$('save').onclick=()=>{let blob=new Blob([JSON.stringify({version:5,title:$('title').value,bpm:Number($('bpm').value),meter:$('meter').value,keySig:$('keySig').value,repeatCfg,tempoChanges,events:seq},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='yasu-score-v5.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2500)};
$('load').onclick=()=>$('file').click();$('file').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let data=JSON.parse(await f.text()),events=data.events||data.seq;if(!Array.isArray(events)||events.length>1200||!events.every(valid))throw Error('invalid');stop();snap();seq=events.map(normalize);slurStart=-1;repeatCfg=Object.assign({enabled:false,start:1,end:2,endings:false,first:2,secondEnd:3},data.repeatCfg||{});tempoChanges=cleanTempoChanges(data.tempoChanges);showRepeatConfig();$('title').value=String(data.title||'読み込んだ曲').slice(0,100);$('bpm').value=Math.max(30,Math.min(240,Number(data.bpm)||100));if(['2','3','4','6','6/8'].includes(String(data.meter)))$('meter').value=(String(data.meter)==='6'||data.meter==='6/8')?'6/8':String(data.meter);if(data.keySig!=null&&Math.abs(Number(data.keySig))<=4)$('keySig').value=String(data.keySig);selected=-1;picker();render();$('status').textContent='読み込み完了'}catch(err){alert('曲データを読み込めませんでした')}e.target.value=''};
['title','bpm','meter','timbre'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='meter'){$('meterHelp').textContent=$('meter').value==='6/8'?'6/8：8分音符6つ分（付点4分音符2拍）。テンポは4分音符換算で再生します。':$('meter').value+'/4：1小節に4分音符'+$('meter').value+'つ分。';stop()}render()}));// Keep the WebAudio playback alive when the page loses focus. Mobile browsers may
// still suspend audio when backgrounded; do not forcibly stop it ourselves.
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden && isScorePlaying && audio?.state==='suspended'){
    audio.resume().catch(()=>{});
  }
});
function online(){$('offline').textContent=navigator.onLine?'オンラインです。オフライン利用は事前に読み込みが必要です。':'オフラインです。保存済みの機能を利用できます。'}window.addEventListener('online',online);window.addEventListener('offline',online);
// No service worker is shipped with this ZIP; unregister stale score-scoped workers to prevent serving old app files.
if('serviceWorker' in navigator&&location.protocol==='https:'){navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>{if(r.scope.includes('/score/'))r.unregister()})).catch(()=>{});}
try{let d=JSON.parse(localStorage.getItem('yasu-score-v6')||localStorage.getItem('yasu-score-v5')||localStorage.getItem('yasu-score-v3')||'null');if(d&&Array.isArray(d.seq)){seq=d.seq.filter(valid).slice(0,1200).map(normalize);repeatCfg=Object.assign(repeatCfg,d.repeatCfg||{});tempoChanges=cleanTempoChanges(d.tempoChanges);$('title').value=d.title||'新しい曲';$('bpm').value=d.bpm||100;$('meter').value=(String(d.meter)==='6'||d.meter==='6/8')?'6/8':(d.meter||'4');$('volume').value=localStorage.getItem('yasu-score-v6')?normalizedVolume(d.volume??20):legacyVolumeToPercent(d.volume??150);$('timbre').value=d.timbre||'brass';if(d.keySig!=null)$('keySig').value=String(d.keySig)}}catch(e){}
showVolume();$('measuresPerLine').addEventListener('change',render);setupPitchChoices();showRepeatConfig();picker();directRefresh();directSet('staff');render();online();
})();

// v3.7.8: Keep input near long scores, and make post-play editing discoverable.
(function setupInputPosition(){
  const $=id=>document.getElementById(id);
  const input=$('inputPanel'),scorePanel=$('scorePanel');
  if(!input||!scorePanel)return;
  function place(below){
    if(below)scorePanel.insertAdjacentElement('afterend',input);
    else scorePanel.insertAdjacentElement('beforebegin',input);
    $('inputBelow').classList.toggle('active',below);
    $('inputBelow').setAttribute('aria-pressed',String(below));
    $('inputAbove').classList.toggle('active',!below);
    $('inputAbove').setAttribute('aria-pressed',String(!below));
    $('inputMoveStatus').textContent=below?'✅ 入力欄を楽譜の下へ移動しました。':'✅ 入力欄を楽譜の上へ移動しました。';
    try{localStorage.setItem('yasu-score-input-below',below?'1':'0')}catch(e){}
  }
  $('inputBelow').onclick=()=>{place(true);input.scrollIntoView({behavior:'smooth',block:'start'});};
  $('inputAbove').onclick=()=>{place(false);input.scrollIntoView({behavior:'smooth',block:'start'});};
  $('goInput').onclick=()=>{input.scrollIntoView({behavior:'smooth',block:'start'});$('editReady').textContent='✏️ 音符入力できます';};
  $('goEdit').onclick=()=>{const el=scorePanel.querySelector('.markEditor');(el||scorePanel).scrollIntoView({behavior:'smooth',block:'start'});$('editReady').textContent='✏️ タイ・スラーなどを編集できます';};
  let below=true;try{below=localStorage.getItem('yasu-score-input-below')!=='0'}catch(e){}
  place(below);
})();
