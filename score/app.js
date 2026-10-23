const REST_GLYPHS={"quarter":"M147 878 307 683Q257 624 230.0 581.0Q203 538 203 494Q203 457 227.0 416.5Q251 376 303 314L287 292Q243 320 205 320Q177 320 163.0 301.5Q149 283 149 257Q149 225 162.5 196.5Q176 168 199 142L186 123Q117 173 84.0 214.0Q51 255 51 303Q51 346 78.0 366.0Q105 386 143 386Q173 386 221 363V365L67 570Q168 659 168 736Q168 797 104 878Z","eighth":"M155 269 251 609Q230 590 203.5 582.0Q177 574 151 574Q108 574 79.0 597.0Q50 620 50 663Q50 691 70.0 710.5Q90 730 121 730Q150 730 168.5 711.5Q187 693 187 662Q187 640 177 623Q177 617 189 617Q244 617 294 703H312L191 269Z","sixteenth":"M155 147 251 487Q230 468 203.5 460.0Q177 452 151 452Q108 452 79.0 475.0Q50 498 50 541Q50 569 69.5 588.5Q89 608 121 608Q150 608 168.5 589.5Q187 571 187 540Q187 518 177 501Q177 495 189 495Q230 495 267 541L319 731Q298 712 271.5 704.0Q245 696 219 696Q176 696 147.0 719.0Q118 742 118 785Q118 813 138.0 832.5Q158 852 189 852Q219 852 237.0 833.0Q255 814 255 784Q255 774 252.0 763.5Q249 753 245 745Q245 739 257 739Q312 739 362 825H380L191 147Z"};
(()=>{'use strict';
const $=id=>document.getElementById(id), names=['ド','レ','ミ','ファ','ソ','ラ','シ'], semis=[0,2,4,5,7,9,11], pcn=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
let repeatCfg={enabled:false,start:1,end:2,endings:false,first:2,secondEnd:3};
let seq=[], selected=-1, insertion='end', undo=[], picked=48, octaveShift=0, audio=null, master=null, nodes=[], timers=[], token=0;
const beats=()=> $('meter').value==='6/8'?3:Number($('meter').value), dur=()=>Number($('duration').value)*($('triplet').checked?2/3:1);
const keyAcc=(i)=>{const k=Number($('keySig').value)||0;const flats=[6,2,5,1,4,0,3],sharps=[3,0,4,1,5,2,6];return k<0&&flats.slice(0,-k).includes(i)?-1:k>0&&sharps.slice(0,k).includes(i)?1:0};
const effectiveAcc=(i,raw)=>Number(raw)===99?0:Number(raw)!==0?Number(raw):keyAcc(i);
const pitch=(i,oct,acc=0)=>12*(oct+1)+semis[i]+effectiveAcc(i,acc);

const label=m=>m==null?'休符':pcn[((m%12)+12)%12]+(Math.floor(m/12)-1);
const round=n=>Math.round(n*10000)/10000;
function valid(e){return e&&(['note','rest','multi','repeat'].includes(e.type)||!e.type)&&Number.isFinite(e.d)&&e.d>0&&e.d<=256&&(e.m==null||(Number.isInteger(e.m)&&e.m>=12&&e.m<=108));}
function normalize(e){return {type:e.type|| (e.m===null?'rest':'note'),m:e.m??null,d:e.d,tie:!!e.tie,triplet:!!e.triplet,count:Math.max(1,Math.min(64,Number(e.count)||1)),acc:e.acc??null,slur:!!e.slur};}
function persist(){try{localStorage.setItem('yasu-score-v5',JSON.stringify({seq,repeatCfg,title:$('title').value,bpm:$('bpm').value,meter:$('meter').value,keySig:$('keySig').value,volume:$('volume').value,timbre:$('timbre').value}))}catch(e){}}
function snap(){undo.push(JSON.stringify(seq));if(undo.length>60)undo.shift()}
function stop(){token++;timers.forEach(clearTimeout);timers=[];nodes.forEach(n=>{try{n.stop()}catch(e){}});nodes=[];$('bar').style.width='0%';$('status').textContent='停止中'}
function add(e){stop();snap();const at=insertion==='before'&&selected>=0?selected:insertion==='after'&&selected>=0?selected+1:seq.length;seq.splice(at,0,e);selected=at;render()}
function addNote(m){add({type:m===null?'rest':'note',m,d:dur(),tie:false,triplet:$('triplet').checked,count:1})}
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
  const low=36,high=72,whiteW=31,H=148,whites=[];
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
function clickInsert(m){picked=m;addNote(m);pickUI();if($('clickPreview').checked)preview(m);$('clickHelp').textContent='追加：'+label(m)+' / '+round(dur())+'拍（挿入位置は③で指定できます）'}
function directRefresh(){staffDirect();pianoDirect()}
function directSet(mode){directMode=mode;$('directStaff').classList.toggle('hidden',mode!=='staff');$('directPiano').classList.toggle('hidden',mode!=='piano');$('entryStaff').classList.toggle('active',mode==='staff');$('entryPiano').classList.toggle('active',mode==='piano');$('clickHelp').textContent=mode==='staff'?'五線譜の線・間をクリックして音符を追加します。':'鍵盤をクリックして音符を追加します（C2〜C5）。'}
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
      selected=d.index;render();
    };
    el.addEventListener('pointerup',ev=>finish(ev,false));
    el.addEventListener('pointercancel',ev=>finish(ev,true));
    el.addEventListener('lostpointercapture',ev=>{
      if(drag&&drag.pointerId===ev.pointerId)finish(ev,true);
    });
  });
}
function desc(e){if(e.type==='multi')return `${e.count}小節休み`;if(e.type==='repeat')return '前小節を反復';return `${label(e.m)} ${round(e.d)}拍${e.tie?' タイ':''}${e.slur?' スラー':''}${e.triplet?' 3連符':''}`}
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
  const measures=groups.map((items,m)=>({
    number:m+1,items,
    width:Math.max(minMeasureWidth,items.length*(available<520?37:43)+17)
  }));
  if(!measures.length)measures.push({number:1,items:[],width:minMeasureWidth});
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
          s+=`<line x1="${nx-17}" y1="${off+86}" x2="${nx+17}" y2="${off+86}" stroke="#233b49" stroke-width="6"/>`;
          s+=`<text x="${nx}" y="${off+72}" text-anchor="middle" font-size="14">${e.count}</text>`;
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
          if(e.d<4)s+=`<line x1="${nx+8}" y1="${y}" x2="${nx+8}" y2="${y-29}" stroke="#233b49" stroke-width="2"/>`;
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
    if(e.slur){
      if(rowId[i]===rowId[i+1]){
        const x1=xy[i]+7,x2=xy[i+1]-7,y=Math.max(ys[i],ys[i+1])+17;
        s+=`<path d="M ${x1} ${ys[i]+12} Q ${(x1+x2)/2} ${y+22} ${x2} ${ys[i+1]+12}" stroke="#9a4a9f" stroke-width="2" fill="none"/>`;
      }else{
        s+=`<path d="M ${xy[i]+7} ${ys[i]+12} Q ${xy[i]+30} ${ys[i]+38} ${available-9} ${ys[i]+12}" stroke="#9a4a9f" stroke-width="2" fill="none"/>`;
        s+=`<path d="M 9 ${ys[i+1]+12} Q ${xy[i+1]-20} ${ys[i+1]+38} ${xy[i+1]-7} ${ys[i+1]+12}" stroke="#9a4a9f" stroke-width="2" fill="none"/>`;
      }
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
  // Beams for eighths, sixteenths and dotted-eighth + sixteenth pairs.
  const beamable=i=>seq[i]&&seq[i].type==='note'&&seq[i].m!=null&&seq[i].d<=.75&&seq[i].d>=.125;
  const is16=e=>e.d<=.251;
  for(let i=0;i<n;){
    if(!beamable(i)){i++;continue}
    let j=i+1;
    while(j<n&&beamable(j)&&seq[j].triplet===seq[i].triplet&&measureFor[j]===measureFor[i]&&rowId[j]===rowId[i]&&j-i<6)j++;
    const x=i=>xy[i]+8;
    if(j-i>=2){
      const y=Math.min(...Array.from({length:j-i},(_,q)=>ys[i+q]))-30;
      s+=`<line x1="${x(i)}" y1="${y}" x2="${x(j-1)}" y2="${y}" stroke="#233b49" stroke-width="4"/>`;
      for(let q=i;q<j;q++){
        if(is16(seq[q])){
          let x2=x(q)+((q<j-1)?Math.min(14,(x(q+1)-x(q))*.55):-Math.min(14,(x(q)-x(q-1))*.55));
          if(q+1<j&&is16(seq[q+1]))x2=x(q+1);
          if(q>i&&is16(seq[q-1]))continue;
          s+=`<line x1="${x(q)}" y1="${y+7}" x2="${x2}" y2="${y+7}" stroke="#233b49" stroke-width="3"/>`;
        }
      }
      if(seq[i].triplet){
        for(let q=i;q+2<j;q+=3)s+=`<text x="${(x(q)+x(q+2))/2}" y="${y-7}" text-anchor="middle" font-size="14" fill="#176a88">3</text>`;
      }
    }else{
      const xx=x(i),yy=ys[i];
      s+=`<path d="M ${xx} ${yy-29} q 16 6 0 19" fill="none" stroke="#233b49" stroke-width="2"/>`;
      if(is16(seq[i]))s+=`<path d="M ${xx} ${yy-21} q 16 6 0 19" fill="none" stroke="#233b49" stroke-width="2"/>`;
      if(seq[i].triplet)s+=`<text x="${xy[i]}" y="${topPad+rowId[i]*rowHeight+25}" font-size="13" fill="#176a88" text-anchor="middle">3</text>`;
    }
    i=j;
  }
  s+='</svg>';
  $('score').innerHTML=s;
  installScoreDrag();
  $('chips').replaceChildren();
  seq.forEach((e,i)=>{
    let b=document.createElement('button');
    b.textContent=`${i+1}: ${desc(e)}`;
    if(i===selected)b.className='selected';
    b.onclick=()=>{selected=i;render()};
    $('chips').appendChild(b);
  });
  $('count').textContent=`（${n}項目・約${total}小節・${rows.length}段）`;
  $('from').max=total;$('to').max=total;
  if(Number($('to').value)>total||Number($('to').value)<1)$('to').value=total;
  let e=seq[selected];
  $('tie').checked=!!(e&&e.tie);
  $('tie').disabled=!(e&&e.type==='note');
  $('slur').checked=!!(e&&e.slur);$('slur').disabled=!(e&&e.type==='note');
  if(e&&e.type==='note'){
    $('editPitch').value=String(e.m);
    $('editDur').value=String(round(e.d));
  }
  ['insertBefore','insertAfter'].forEach(id=>$(id).disabled=selected<0);
  ['insertBefore','insertAfter','appendMode'].forEach(id=>$(id).classList.toggle('active',
    (id==='insertBefore'&&insertion==='before')||
    (id==='insertAfter'&&insertion==='after')||
    (id==='appendMode'&&insertion==='end')));
  persist();
}
let scoreResizeTimer=null;
window.addEventListener('resize',()=>{
  clearTimeout(scoreResizeTimer);
  scoreResizeTimer=setTimeout(()=>render(),180);
});
function setupPitchChoices(){const sel=$('editPitch');sel.innerHTML='<option value="null">休符</option>';for(let m=24;m<=84;m++){let o=document.createElement('option');o.value=m;o.textContent=label(m);sel.appendChild(o)}}
function initAudio(){let AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('AudioContext unavailable');if(!audio){audio=new AC();let compressor=audio.createDynamicsCompressor();master=audio.createGain();master.connect(compressor);compressor.connect(audio.destination)}master.gain.value=Number($('volume').value)/100;return audio.resume()}
function tone(m,t,len){if(m===null||len<=0)return;let osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter(),hz=440*Math.pow(2,(m-69)/12),brass=$('timbre').value==='brass';osc.frequency.value=hz;if(brass)osc.setPeriodicWave(audio.createPeriodicWave(new Float32Array(9),new Float32Array([0,1,.7,.42,.25,.14,.08,.04,.02])));else osc.type='sine';filter.type='lowpass';filter.frequency.value=brass?Math.min(2500,Math.max(450,hz*13)):16000;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.32,t+.025);gain.gain.setValueAtTime(.32,Math.max(t+.026,t+len-.06));gain.gain.exponentialRampToValueAtTime(.0001,t+len);osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start(t);osc.stop(t+len+.03);nodes.push(osc)}
function expand(){let result=[],prior=[];for(let e of seq){if(e.type==='repeat'){if(prior.length){let copy=prior.map(x=>({...x}));result.push(...copy);prior=copy}else{let r={type:'rest',m:null,d:beats()};result.push(r);prior=[r]}}else if(e.type==='multi'){let r={type:'rest',m:null,d:e.d};result.push(r);prior=[r]}else{let x={...e};result.push(x);prior.push(x);if(prior.reduce((a,v)=>a+v.d,0)>=beats()-0.0001)prior=[x]}}return result}
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
async function preview(m){stop();if(m==null)return;let id=token;try{await initAudio();if(id!==token)return;tone(m,audio.currentTime+.02,.6);$('status').textContent='試聴：'+label(m)}catch(e){$('status').textContent='音声を再生できませんでした'}}
async function play(){stop();if(!seq.length){$('status').textContent='先に音符を入力してください';return}let id=token;try{await initAudio();if(id!==token)return;let beat=60/Math.min(240,Math.max(30,Number($('bpm').value)||100)),startMeasure=Number($('from').value)||1,endMeasure=Number($('to').value)||1,loop=$('loop').checked,items=[],elapsed=0;for(let e of repeatOrder(expand())){let measure=Math.floor((elapsed+0.000001)/beats())+1;if(!loop||(measure>=startMeasure&&measure<=endMeasure))items.push(e);elapsed+=e.d}if(!items.length){$('status').textContent='指定した小節に音符がありません';return}let total=items.reduce((a,e)=>a+e.d,0)*beat;function schedule(){if(id!==token)return;let start=audio.currentTime+.08,t=0;for(let i=0;i<items.length;){let e=items[i],at=t,hold=e.d*beat,advance=1;if(e.type==='note'){while(items[i+advance-1]&&items[i+advance-1].tie&&items[i+advance]&&items[i+advance].type==='note'&&items[i+advance].m===e.m){hold+=items[i+advance].d*beat;advance++}tone(e.m,start+at,Math.max(.07,hold*(advance>1?1:.92)))}let shown=label(e.m),progress=Math.min(100,100*(at/total));timers.push(setTimeout(()=>{if(id===token){$('status').textContent='再生中：'+shown;$('bar').style.width=progress+'%'}},Math.max(0,(at+.08)*1000)));t+=items.slice(i,i+advance).reduce((a,v)=>a+v.d*beat,0);i+=advance}timers.push(setTimeout(()=>{if(id!==token)return;if(loop)schedule();else{$('status').textContent='再生終了';$('bar').style.width='100%'}},(total+.12)*1000))}schedule()}catch(e){$('status').textContent='音声再生に失敗しました'}}
$('staffMode').onclick=()=>{$('staffInput').classList.remove('hidden');$('solInput').classList.add('hidden');$('staffMode').classList.add('active');$('solMode').classList.remove('active')};$('solMode').onclick=()=>{$('staffInput').classList.add('hidden');$('solInput').classList.remove('hidden');$('staffMode').classList.remove('active');$('solMode').classList.add('active')};
names.forEach((name,i)=>{let b=document.createElement('button');b.textContent=name;b.onclick=()=>addNote(pitch(i,Number($('oct').value),Number($('solAcc').value)));$('solKeys').appendChild(b)});
$('entryStaff').onclick=()=>directSet('staff');$('entryPiano').onclick=()=>directSet('piano');$('acc').onchange=()=>{picker();directRefresh()};$('keySig').onchange=()=>{picker();directRefresh();render()};$('pitchDown').onclick=()=>shiftPitch(-1);$('pitchUp').onclick=()=>shiftPitch(1);$('pitchAdd').onclick=()=>addNote(picked);$('pitchPreview').onclick=()=>preview(picked);$('octDown').onclick=()=>{octaveShift=Math.max(-1,octaveShift-1);picker()};$('octUp').onclick=()=>{octaveShift=Math.min(2,octaveShift+1);picker()};$('insertBefore').onclick=()=>{insertion='before';render()};$('insertAfter').onclick=()=>{insertion='after';render()};$('appendMode').onclick=()=>{insertion='end';render()};$('rest').onclick=()=>addNote(null);$('multiAdd').onclick=()=>addSpecial('multi');$('repeatAdd').onclick=()=>addSpecial('repeat');$('tie').onchange=()=>{let e=seq[selected];if(e&&e.type==='note'){snap();e.tie=$('tie').checked;render()}};$('slur').onchange=()=>{let e=seq[selected];if(e&&e.type==='note'){snap();e.slur=$('slur').checked;render()}};
$('apply').onclick=()=>{let e=seq[selected];if(!e||!['note','rest'].includes(e.type))return;stop();snap();e.m=$('editPitch').value==='null'?null:Number($('editPitch').value);e.type=e.m===null?'rest':'note';e.d=Number($('editDur').value);e.triplet=false;render()};$('preview').onclick=()=>{let e=seq[selected];if(e)preview(e.m)};$('delete').onclick=()=>{if(selected<0)return;stop();snap();seq.splice(selected,1);selected=Math.min(selected,seq.length-1);render()};$('undo').onclick=()=>{if(!undo.length)return;stop();seq=JSON.parse(undo.pop());selected=Math.min(selected,seq.length-1);render()};$('clear').onclick=()=>{if(seq.length&& !confirm('曲を全消去しますか？'))return;stop();snap();seq=[];selected=-1;render()};$('play').onclick=play;$('stop').onclick=stop;$('demo').onclick=()=>{stop();snap();seq=[0,0,7,7,9,9,7,5,5,4,4,2,2,0].map((v,i)=>({type:'note',m:48+v,d:i===6||i===13?2:1,tie:false,triplet:false}));selected=-1;render()};
$('volume').oninput=()=>{$('voltext').textContent=$('volume').value+'%';if(master)master.gain.value=Number($('volume').value)/100;persist()};
$('save').onclick=()=>{let blob=new Blob([JSON.stringify({version:5,title:$('title').value,bpm:Number($('bpm').value),meter:$('meter').value,keySig:$('keySig').value,repeatCfg,events:seq},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='yasu-score-v5.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2500)};
$('load').onclick=()=>$('file').click();$('file').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let data=JSON.parse(await f.text()),events=data.events||data.seq;if(!Array.isArray(events)||events.length>1200||!events.every(valid))throw Error('invalid');stop();snap();seq=events.map(normalize);repeatCfg=Object.assign({enabled:false,start:1,end:2,endings:false,first:2,secondEnd:3},data.repeatCfg||{});showRepeatConfig();$('title').value=String(data.title||'読み込んだ曲').slice(0,100);$('bpm').value=Math.max(30,Math.min(240,Number(data.bpm)||100));if(['2','3','4','6','6/8'].includes(String(data.meter)))$('meter').value=(String(data.meter)==='6'||data.meter==='6/8')?'6/8':String(data.meter);if(data.keySig!=null&&Math.abs(Number(data.keySig))<=4)$('keySig').value=String(data.keySig);selected=-1;picker();render();$('status').textContent='読み込み完了'}catch(err){alert('曲データを読み込めませんでした')}e.target.value=''};
['title','bpm','meter','timbre'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='meter'){$('meterHelp').textContent=$('meter').value==='6/8'?'6/8：8分音符6つ分（付点4分音符2拍）。テンポは4分音符換算で再生します。':$('meter').value+'/4：1小節に4分音符'+$('meter').value+'つ分。';stop()}render()}));window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
function online(){$('offline').textContent=navigator.onLine?'オンラインです。オフライン利用は事前に読み込みが必要です。':'オフラインです。保存済みの機能を利用できます。'}window.addEventListener('online',online);window.addEventListener('offline',online);
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
try{let d=JSON.parse(localStorage.getItem('yasu-score-v5')||localStorage.getItem('yasu-score-v3')||'null');if(d&&Array.isArray(d.seq)){seq=d.seq.filter(valid).slice(0,1200).map(normalize);repeatCfg=Object.assign(repeatCfg,d.repeatCfg||{});$('title').value=d.title||'新しい曲';$('bpm').value=d.bpm||100;$('meter').value=(String(d.meter)==='6'||d.meter==='6/8')?'6/8':(d.meter||'4');$('volume').value=d.volume||100;$('timbre').value=d.timbre||'brass';if(d.keySig!=null)$('keySig').value=String(d.keySig)}}catch(e){}
$('voltext').textContent=$('volume').value+'%';$('measuresPerLine').addEventListener('change',render);setupPitchChoices();showRepeatConfig();picker();directRefresh();directSet('staff');render();online();
})();
