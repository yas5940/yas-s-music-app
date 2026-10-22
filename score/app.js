(()=>{'use strict';
const $=id=>document.getElementById(id), names=['ド','レ','ミ','ファ','ソ','ラ','シ'], semis=[0,2,4,5,7,9,11], pcn=['C','C♯','D','E♭','E','F','F♯','G','A♭','A','B♭','B'];
let seq=[], selected=-1, insertion='end', undo=[], picked=48, octaveShift=0, audio=null, master=null, nodes=[], timers=[], token=0;
const beats=()=> $('meter').value==='6/8'?3:Number($('meter').value), dur=()=>Number($('duration').value)*($('triplet').checked?2/3:1);
const keyAcc=(i)=>{const k=Number($('keySig').value)||0;const flats=[6,2,5,1,4,0,3],sharps=[3,0,4,1,5,2,6];return k<0&&flats.slice(0,-k).includes(i)?-1:k>0&&sharps.slice(0,k).includes(i)?1:0};
const effectiveAcc=(i,raw)=>Number(raw)===99?0:Number(raw)!==0?Number(raw):keyAcc(i);
const pitch=(i,oct,acc=0)=>12*(oct+1)+semis[i]+effectiveAcc(i,acc);

const label=m=>m==null?'休符':pcn[((m%12)+12)%12]+(Math.floor(m/12)-1);
const round=n=>Math.round(n*10000)/10000;
function valid(e){return e&&(['note','rest','multi','repeat'].includes(e.type)||!e.type)&&Number.isFinite(e.d)&&e.d>0&&e.d<=256&&(e.m==null||(Number.isInteger(e.m)&&e.m>=12&&e.m<=108));}
function normalize(e){return {type:e.type|| (e.m===null?'rest':'note'),m:e.m??null,d:e.d,tie:!!e.tie,triplet:!!e.triplet,count:Math.max(1,Math.min(64,Number(e.count)||1)),acc:e.acc??null};}
function persist(){try{localStorage.setItem('yasu-score-v5',JSON.stringify({seq,title:$('title').value,bpm:$('bpm').value,meter:$('meter').value,keySig:$('keySig').value,volume:$('volume').value,timbre:$('timbre').value}))}catch(e){}}
function snap(){undo.push(JSON.stringify(seq));if(undo.length>60)undo.shift()}
function stop(){token++;timers.forEach(clearTimeout);timers=[];nodes.forEach(n=>{try{n.stop()}catch(e){}});nodes=[];$('bar').style.width='0%';$('status').textContent='停止中'}
function add(e){stop();snap();const at=insertion==='before'&&selected>=0?selected:insertion==='after'&&selected>=0?selected+1:seq.length;seq.splice(at,0,e);selected=at;render()}
function addNote(m){add({type:m===null?'rest':'note',m,d:dur(),tie:false,triplet:$('triplet').checked,count:1})}
function addSpecial(type){if(type==='multi')add({type,m:null,d:beats()*Number($('multiCount').value),count:Number($('multiCount').value),tie:false});else add({type,m:null,d:beats(),count:1,tie:false})}
function pickUI(){ $('pickedName').textContent='選択中：'+label(picked)+'（実音）';$('picker').querySelectorAll('[data-midi]').forEach(x=>x.classList.toggle('chosen',Number(x.dataset.midi)===picked)) }
function picker(){let s='<svg viewBox="0 0 380 400" xmlns="http://www.w3.org/2000/svg"><rect width="380" height="400" fill="white"/>';for(let i=0;i<15;i++){const step=i-5+octaveShift*7,absolute=14+step,oct=Math.floor(absolute/7),letter=((absolute%7)+7)%7,m=pitch(letter,oct,Number($('acc').value)),y=380-i*25;if(m<12||m>108)continue;s+=`<g data-midi="${m}" tabindex="0" role="button" aria-label="${names[letter]}${oct}"><rect x="12" y="${y-12}" width="356" height="24" rx="6" fill="${i%2?'#eff6fa':'#fff'}"/><ellipse cx="65" cy="${y}" rx="10" ry="7" fill="#176a88"/><text x="102" y="${y+5}" font-size="17" fill="#244455">${names[letter]}${oct}${Number($('acc').value)===-1?'♭':Number($('acc').value)===1?'♯':Number($('acc').value)===99?'♮':keyAcc(letter)===-1?'♭':keyAcc(letter)===1?'♯':''}</text></g>`}s+='</svg>';$('picker').innerHTML=s;$('picker').querySelectorAll('[data-midi]').forEach(e=>{let fn=()=>{picked=Number(e.dataset.midi);pickUI()};e.onclick=fn;e.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();fn()}}});$('octLabel').textContent=(octaveShift>0?'+':'')+octaveShift+'オクターブ';pickUI()}
// v3.3: click-to-enter bass-clef staff and chromatic piano.
let directMode='staff';
function staffDirect(){
  // Bass clef: bottom line G2 (MIDI 43); each diatonic step is 6 SVG units.
  const W=680,H=214, baseY=151, diatonic=[0,2,4,5,7,9,11];
  let out=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="クリックして音符を入力するヘ音記号の五線譜"><rect width="${W}" height="${H}" fill="#fff"/>`;
  for(const y of [103,115,127,139,151])out+=`<line x1="48" y1="${y}" x2="${W-18}" y2="${y}" stroke="#506b7b" stroke-width="1.4"/>`;
  out+=`<text x="9" y="150" font-size="59" fill="#183145">𝄢</text><text x="57" y="41" font-size="14" fill="#476274">クリックで追加（ヘ音記号・実音）</text>`;
  for(let st=-5;st<=14;st++){
    const abs=2*7+4+st,oct=Math.floor(abs/7),letter=((abs%7)+7)%7,y=baseY-st*6;
    const m=pitch(letter,oct,Number($('acc').value));
    if(m<12||m>108)continue;
    if(y<103||y>151)out+=`<line x1="300" x2="398" y1="${y}" y2="${y}" stroke="#9db0ba" stroke-dasharray="3 3"/>`;
    out+=`<rect data-step="${st}" data-midi="${m}" role="button" tabindex="0" aria-label="${names[letter]}${oct} を追加" x="90" y="${y-3}" width="${W-118}" height="6" fill="transparent"/><circle cx="335" cy="${y}" r="2" fill="#176a88" opacity=".32" pointer-events="none"/>`;
  }
  out+='</svg>';$('directStaff').innerHTML=out;
  $('directStaff').querySelectorAll('[data-step]').forEach(el=>{
    const fn=()=>clickInsert(Number(el.dataset.midi));el.onclick=fn;el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();fn()}};
  });
}
function pianoDirect(){
  const low=36,high=72,whiteW=31,H=148,whites=[];
  for(let m=low;m<=high;m++)if(![1,3,6,8,10].includes(m%12))whites.push(m);
  const W=whites.length*whiteW;
  let out=`<svg viewBox="0 0 ${W} ${H}" role="group" aria-label="クリックで音符を入力するピアノ鍵盤"><rect width="${W}" height="${H}" fill="#f2f6f8"/>`;
  whites.forEach((m,i)=>{const x=i*whiteW;out+=`<rect data-key="${m}" role="button" tabindex="0" aria-label="${label(m)} を追加" x="${x+1}" y="1" width="${whiteW-2}" height="${H-3}" rx="3" fill="#fff" stroke="#849ca9"/><text x="${x+whiteW/2}" y="${H-12}" text-anchor="middle" font-size="10" fill="#2a5063" pointer-events="none">${pcn[m%12]}</text>`});
  whites.forEach((m,i)=>{const n=m+1;if(n<=high&&[1,3,6,8,10].includes(n%12)){const x=(i+1)*whiteW-11;out+=`<rect data-key="${n}" role="button" tabindex="0" aria-label="${label(n)} を追加" x="${x}" y="1" width="22" height="88" rx="3" fill="#263c4c" stroke="#172a36"/><text x="${x+11}" y="76" text-anchor="middle" font-size="9" fill="white" pointer-events="none">${pcn[n%12]}</text>`}});
  out+='</svg>';$('directPiano').innerHTML=out;
  $('directPiano').querySelectorAll('[data-key]').forEach(el=>{const fn=()=>clickInsert(Number(el.dataset.key));el.onclick=fn;el.onkeydown=ev=>{if(ev.key==='Enter'||ev.key===' '){ev.preventDefault();fn()}}});
}
function clickInsert(m){picked=m;addNote(m);pickUI();if($('clickPreview').checked)preview(m);$('clickHelp').textContent='追加：'+label(m)+' / '+round(dur())+'拍（挿入位置は③で指定できます）'}
function directRefresh(){staffDirect();pianoDirect()}
function directSet(mode){directMode=mode;$('directStaff').classList.toggle('hidden',mode!=='staff');$('directPiano').classList.toggle('hidden',mode!=='piano');$('entryStaff').classList.toggle('active',mode==='staff');$('entryPiano').classList.toggle('active',mode==='piano');$('clickHelp').textContent=mode==='staff'?'五線譜の線・間をクリックして音符を追加します。':'鍵盤をクリックして音符を追加します（C2〜C5）。'}
function shiftPitch(delta){let oct=Math.floor(picked/12)-1,pc=((picked%12)+12)%12,ix=[0,0,1,2,2,3,3,4,5,5,6,6][pc],diat=oct*7+ix+delta,o=Math.floor(diat/7),i=((diat%7)+7)%7;picked=Math.max(12,Math.min(108,pitch(i,o,Number($('acc').value))));pickUI()}
function noteY(m){const o=Math.floor(m/12)-1,pc=((m%12)+12)%12,i=[0,0,1,2,2,3,3,4,5,5,6,6][pc];return 132-((o-2)*7+i)*6}
function desc(e){if(e.type==='multi')return `${e.count}小節休み`;if(e.type==='repeat')return '前小節を反復';return `${label(e.m)} ${round(e.d)}拍${e.tie?' タイ':''}${e.triplet?' 3連符':''}`}
function render(){
const n=seq.length, step=45,w=Math.max(390,110+n*step), meter=$('meter').value;
let s=`<svg class="scoreSvg" width="${w}" height="188" viewBox="0 0 ${w} 188" xmlns="http://www.w3.org/2000/svg"><rect width="${w}" height="188" fill="white"/>`;
for(let y of [62,74,86,98,110])s+=`<line x1="8" x2="${w-8}" y1="${y}" y2="${y}" stroke="#536671"/>`;
s+=`<text x="10" y="102" font-size="36" fill="#183145">𝄢</text>`;
const k=Number($('keySig').value)||0;
if(k){const flatYs=[74,92,68,86],sharpYs=[86,68,92,74];for(let j=0;j<Math.abs(k);j++){const x=43+j*9,y=(k<0?flatYs:sharpYs)[j%4];s+=`<text x="${x}" y="${y}" font-size="17">${k<0?'♭':'♯'}</text>`}}
const meterX=49+Math.abs(k)*9;s+=`<text x="${meterX}" y="83" font-size="14">${meter==='6/8'?'6':beats()}</text><text x="${meterX}" y="102" font-size="14">${meter==='6/8'?'8':'4'}</text>`;
const starts=[],ys=[],ends=[],measures=[];let elapsed=0,measure=1;
seq.forEach((e,i)=>{const x=105+i*step, prev=elapsed;starts.push(prev);measures.push(Math.floor((prev+1e-6)/beats()));if(i>0&&Math.abs(prev/beats()-Math.round(prev/beats()))<.0001){s+=`<line x1="${x-21}" x2="${x-21}" y1="62" y2="110" stroke="#536671"/><text x="${x-18}" y="44" font-size="11">${++measure}</text>`}
if(e.type==='repeat')s+=`<text x="${x-12}" y="96" font-size="26" font-weight="bold">%</text>`;
else if(e.type==='multi')s+=`<line x1="${x-17}" y1="86" x2="${x+17}" y2="86" stroke="#233b49" stroke-width="6"/><text x="${x}" y="72" text-anchor="middle" font-size="14">${e.count}</text>`;
else if(e.m===null)s+=`<path d="M ${x-8} 79 h16 v6 h-16 z" fill="#233b49"/><text x="${x}" y="146" font-size="10" text-anchor="middle">${round(e.d)}拍</text>`;
else{const y=noteY(e.m)-3;ys[i]=y;if(y>116)for(let yy=122;yy<=y+2;yy+=12)s+=`<line x1="${x-13}" x2="${x+13}" y1="${yy}" y2="${yy}" stroke="#536671"/>`;if(y<56)for(let yy=50;yy>=y-2;yy-=12)s+=`<line x1="${x-13}" x2="${x+13}" y1="${yy}" y2="${yy}" stroke="#536671"/>`;
s+=`<ellipse cx="${x}" cy="${y}" rx="8" ry="5.5" fill="${e.d>=2&&!e.triplet?'white':'#233b49'}" stroke="#233b49" stroke-width="1.5"/>`;
if(e.d<4)s+=`<line x1="${x+8}" y1="${y}" x2="${x+8}" y2="${y-29}" stroke="#233b49" stroke-width="2"/>`;
if([3,1.5,.75,.375].some(d=>Math.abs(e.d-d)<.0001))s+=`<circle cx="${x+18}" cy="${y}" r="2.4" fill="#233b49"/>`;
if(e.tie)s+=`<path d="M ${x+8} ${y+7} Q ${x+25} ${y+22} ${x+41} ${y+7}" stroke="#176a88" stroke-width="2" fill="none"/>`;
s+=`<text x="${x}" y="157" font-size="10" text-anchor="middle">${label(e.m)}</text>`}
if(i===selected)s+=`<rect x="${x-19}" y="18" width="38" height="154" fill="#f5b94b" fill-opacity=".16" stroke="#b67b22" stroke-dasharray="4 3"/>`;
s+=`<rect data-index="${i}" x="${x-20}" y="17" width="40" height="156" fill="transparent"/>`;elapsed+=e.d;ends.push(elapsed)});
// Consecutive eighth notes in one measure get beams; three triplets get a common '3'.
const eligible=i=>seq[i]&&seq[i].type==='note'&&seq[i].m!=null&&Math.abs(seq[i].d-(seq[i].triplet?1/3:.5))<.001;
for(let i=0;i<n;){if(!eligible(i)){i++;continue}let j=i+1;while(j<n&&eligible(j)&&seq[j].triplet===seq[i].triplet&&measures[j]===measures[i]&&j-i<6)j++;
if(seq[i].triplet){let g=i;while(g+2<j){const x1=105+g*step+8,x2=105+(g+2)*step+8,y=Math.min(ys[g],ys[g+1],ys[g+2])-31;s+=`<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="#233b49" stroke-width="4"/><text x="${(x1+x2)/2}" y="${y-7}" text-anchor="middle" font-size="14" fill="#176a88">3</text>`;g+=3}for(let t=g;t<j;t++)s+=`<text x="${105+t*step}" y="25" font-size="13" fill="#176a88" text-anchor="middle">3</text>`}
else if(j-i>=2){let y=Math.min(...ys.slice(i,j))-30;s+=`<line x1="${105+i*step+8}" y1="${y}" x2="${105+(j-1)*step+8}" y2="${y}" stroke="#233b49" stroke-width="4"/>`}
else{const x=105+i*step+8,y=ys[i];s+=`<path d="M ${x} ${y-29} q 16 6 0 19" fill="none" stroke="#233b49" stroke-width="2"/>`}i=j}
s+='</svg>';$('score').innerHTML=s;$('score').querySelectorAll('[data-index]').forEach(e=>e.onclick=()=>{selected=Number(e.dataset.index);render()});$('chips').replaceChildren();seq.forEach((e,i)=>{let b=document.createElement('button');b.textContent=`${i+1}: ${desc(e)}`;if(i===selected)b.className='selected';b.onclick=()=>{selected=i;render()};$('chips').appendChild(b)});
let total=Math.max(1,Math.ceil(elapsed/beats()));$('count').textContent=`（${n}項目・約${total}小節）`;$('from').max=total;$('to').max=total;if(Number($('to').value)>total||Number($('to').value)<1)$('to').value=total;
let e=seq[selected];$('tie').checked=!!(e&&e.tie);$('tie').disabled=!(e&&e.type==='note');if(e&&e.type==='note'){$('editPitch').value=String(e.m);$('editDur').value=String(round(e.d))}['insertBefore','insertAfter'].forEach(id=>$(id).disabled=selected<0);['insertBefore','insertAfter','appendMode'].forEach(id=>$(id).classList.toggle('active',(id==='insertBefore'&&insertion==='before')||(id==='insertAfter'&&insertion==='after')||(id==='appendMode'&&insertion==='end')));persist()}
function setupPitchChoices(){const sel=$('editPitch');sel.innerHTML='<option value="null">休符</option>';for(let m=24;m<=84;m++){let o=document.createElement('option');o.value=m;o.textContent=label(m);sel.appendChild(o)}}
function initAudio(){let AC=window.AudioContext||window.webkitAudioContext;if(!AC)throw Error('AudioContext unavailable');if(!audio){audio=new AC();let compressor=audio.createDynamicsCompressor();master=audio.createGain();master.connect(compressor);compressor.connect(audio.destination)}master.gain.value=Number($('volume').value)/100;return audio.resume()}
function tone(m,t,len){if(m===null||len<=0)return;let osc=audio.createOscillator(),gain=audio.createGain(),filter=audio.createBiquadFilter(),hz=440*Math.pow(2,(m-69)/12),brass=$('timbre').value==='brass';osc.frequency.value=hz;if(brass)osc.setPeriodicWave(audio.createPeriodicWave(new Float32Array(9),new Float32Array([0,1,.7,.42,.25,.14,.08,.04,.02])));else osc.type='sine';filter.type='lowpass';filter.frequency.value=brass?Math.min(2500,Math.max(450,hz*13)):16000;gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.32,t+.025);gain.gain.setValueAtTime(.32,Math.max(t+.026,t+len-.06));gain.gain.exponentialRampToValueAtTime(.0001,t+len);osc.connect(filter);filter.connect(gain);gain.connect(master);osc.start(t);osc.stop(t+len+.03);nodes.push(osc)}
function expand(){let result=[],prior=[];for(let e of seq){if(e.type==='repeat'){if(prior.length){let copy=prior.map(x=>({...x}));result.push(...copy);prior=copy}else{let r={type:'rest',m:null,d:beats()};result.push(r);prior=[r]}}else if(e.type==='multi'){let r={type:'rest',m:null,d:e.d};result.push(r);prior=[r]}else{let x={...e};result.push(x);prior.push(x);if(prior.reduce((a,v)=>a+v.d,0)>=beats()-0.0001)prior=[x]}}return result}
async function preview(m){stop();if(m==null)return;let id=token;try{await initAudio();if(id!==token)return;tone(m,audio.currentTime+.02,.6);$('status').textContent='試聴：'+label(m)}catch(e){$('status').textContent='音声を再生できませんでした'}}
async function play(){stop();if(!seq.length){$('status').textContent='先に音符を入力してください';return}let id=token;try{await initAudio();if(id!==token)return;let beat=60/Math.min(240,Math.max(30,Number($('bpm').value)||100)),startMeasure=Number($('from').value)||1,endMeasure=Number($('to').value)||1,loop=$('loop').checked,items=[],elapsed=0;for(let e of expand()){let measure=Math.floor((elapsed+0.000001)/beats())+1;if(!loop||(measure>=startMeasure&&measure<=endMeasure))items.push(e);elapsed+=e.d}if(!items.length){$('status').textContent='指定した小節に音符がありません';return}let total=items.reduce((a,e)=>a+e.d,0)*beat;function schedule(){if(id!==token)return;let start=audio.currentTime+.08,t=0;for(let i=0;i<items.length;){let e=items[i],at=t,hold=e.d*beat,advance=1;if(e.type==='note'){while(items[i+advance-1]&&items[i+advance-1].tie&&items[i+advance]&&items[i+advance].type==='note'&&items[i+advance].m===e.m){hold+=items[i+advance].d*beat;advance++}tone(e.m,start+at,Math.max(.07,hold*(advance>1?1:.92)))}let shown=label(e.m),progress=Math.min(100,100*(at/total));timers.push(setTimeout(()=>{if(id===token){$('status').textContent='再生中：'+shown;$('bar').style.width=progress+'%'}},Math.max(0,(at+.08)*1000)));t+=hold;i+=advance}timers.push(setTimeout(()=>{if(id!==token)return;if(loop)schedule();else{$('status').textContent='再生終了';$('bar').style.width='100%'}},(total+.12)*1000))}schedule()}catch(e){$('status').textContent='音声再生に失敗しました'}}
$('staffMode').onclick=()=>{$('staffInput').classList.remove('hidden');$('solInput').classList.add('hidden');$('staffMode').classList.add('active');$('solMode').classList.remove('active')};$('solMode').onclick=()=>{$('staffInput').classList.add('hidden');$('solInput').classList.remove('hidden');$('staffMode').classList.remove('active');$('solMode').classList.add('active')};
names.forEach((name,i)=>{let b=document.createElement('button');b.textContent=name;b.onclick=()=>addNote(pitch(i,Number($('oct').value),Number($('solAcc').value)));$('solKeys').appendChild(b)});
$('entryStaff').onclick=()=>directSet('staff');$('entryPiano').onclick=()=>directSet('piano');$('acc').onchange=()=>{picker();directRefresh()};$('keySig').onchange=()=>{picker();directRefresh();render()};$('pitchDown').onclick=()=>shiftPitch(-1);$('pitchUp').onclick=()=>shiftPitch(1);$('pitchAdd').onclick=()=>addNote(picked);$('pitchPreview').onclick=()=>preview(picked);$('octDown').onclick=()=>{octaveShift=Math.max(-1,octaveShift-1);picker()};$('octUp').onclick=()=>{octaveShift=Math.min(2,octaveShift+1);picker()};$('insertBefore').onclick=()=>{insertion='before';render()};$('insertAfter').onclick=()=>{insertion='after';render()};$('appendMode').onclick=()=>{insertion='end';render()};$('rest').onclick=()=>addNote(null);$('multiAdd').onclick=()=>addSpecial('multi');$('repeatAdd').onclick=()=>addSpecial('repeat');$('tie').onchange=()=>{let e=seq[selected];if(e&&e.type==='note'){snap();e.tie=$('tie').checked;render()}};
$('apply').onclick=()=>{let e=seq[selected];if(!e||!['note','rest'].includes(e.type))return;stop();snap();e.m=$('editPitch').value==='null'?null:Number($('editPitch').value);e.type=e.m===null?'rest':'note';e.d=Number($('editDur').value);e.triplet=false;render()};$('preview').onclick=()=>{let e=seq[selected];if(e)preview(e.m)};$('delete').onclick=()=>{if(selected<0)return;stop();snap();seq.splice(selected,1);selected=Math.min(selected,seq.length-1);render()};$('undo').onclick=()=>{if(!undo.length)return;stop();seq=JSON.parse(undo.pop());selected=Math.min(selected,seq.length-1);render()};$('clear').onclick=()=>{if(seq.length&& !confirm('曲を全消去しますか？'))return;stop();snap();seq=[];selected=-1;render()};$('play').onclick=play;$('stop').onclick=stop;$('demo').onclick=()=>{stop();snap();seq=[0,0,7,7,9,9,7,5,5,4,4,2,2,0].map((v,i)=>({type:'note',m:48+v,d:i===6||i===13?2:1,tie:false,triplet:false}));selected=-1;render()};
$('volume').oninput=()=>{$('voltext').textContent=$('volume').value+'%';if(master)master.gain.value=Number($('volume').value)/100;persist()};
$('save').onclick=()=>{let blob=new Blob([JSON.stringify({version:5,title:$('title').value,bpm:Number($('bpm').value),meter:$('meter').value,keySig:$('keySig').value,events:seq},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='yasu-score-v5.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),2500)};
$('load').onclick=()=>$('file').click();$('file').onchange=async e=>{let f=e.target.files[0];if(!f)return;try{let data=JSON.parse(await f.text()),events=data.events||data.seq;if(!Array.isArray(events)||events.length>1200||!events.every(valid))throw Error('invalid');stop();snap();seq=events.map(normalize);$('title').value=String(data.title||'読み込んだ曲').slice(0,100);$('bpm').value=Math.max(30,Math.min(240,Number(data.bpm)||100));if(['2','3','4','6','6/8'].includes(String(data.meter)))$('meter').value=(String(data.meter)==='6'||data.meter==='6/8')?'6/8':String(data.meter);if(data.keySig!=null&&Math.abs(Number(data.keySig))<=4)$('keySig').value=String(data.keySig);selected=-1;picker();render();$('status').textContent='読み込み完了'}catch(err){alert('曲データを読み込めませんでした')}e.target.value=''};
['title','bpm','meter','timbre'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='meter'){$('meterHelp').textContent=$('meter').value==='6/8'?'6/8：8分音符6つ分（付点4分音符2拍）。テンポは4分音符換算で再生します。':$('meter').value+'/4：1小節に4分音符'+$('meter').value+'つ分。';stop()}render()}));window.addEventListener('blur',stop);document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()});
function online(){$('offline').textContent=navigator.onLine?'オンラインです。オフライン利用は事前に読み込みが必要です。':'オフラインです。保存済みの機能を利用できます。'}window.addEventListener('online',online);window.addEventListener('offline',online);
if('serviceWorker' in navigator&&location.protocol==='https:')navigator.serviceWorker.register('./sw.js').catch(()=>{});
try{let d=JSON.parse(localStorage.getItem('yasu-score-v5')||localStorage.getItem('yasu-score-v3')||'null');if(d&&Array.isArray(d.seq)){seq=d.seq.filter(valid).slice(0,1200).map(normalize);$('title').value=d.title||'新しい曲';$('bpm').value=d.bpm||100;$('meter').value=(String(d.meter)==='6'||d.meter==='6/8')?'6/8':(d.meter||'4');$('volume').value=d.volume||100;$('timbre').value=d.timbre||'brass';if(d.keySig!=null)$('keySig').value=String(d.keySig)}}catch(e){}
$('voltext').textContent=$('volume').value+'%';setupPitchChoices();picker();directRefresh();directSet('staff');render();online();
})();
