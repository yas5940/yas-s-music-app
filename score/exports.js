/* v4.0 beta: standard MIDI type 0 and PCM WAV export for single melody. */
(()=>{'use strict';
const $=id=>document.getElementById(id),api=()=>window.scoreV4API;
const download=(blob,filename)=>{const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)};
const filename=ext=>(api().exportScoreData().title||'楽譜').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,60)+'.'+ext;
const variable=n=>{n=Math.max(0,Math.floor(n));const a=[n&127];while(n>>=7)a.unshift((n&127)|128);return a};
const word=n=>[(n>>>8)&255,n&255];const dword=n=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
function midi(){
 const events=api().getAudioEvents(),out=[];let ticks=0,tempo=0;
 const push=(t,priority,bytes)=>out.push({t:Math.max(0,Math.round(t)),priority,bytes});
 for(const e of events){
   const nextTempo=api().getTempoAt(e._measure||1);
   if(nextTempo!==tempo){tempo=nextTempo;const micro=Math.round(60000000/tempo);push(ticks,0,[0xff,0x51,0x03,(micro>>16)&255,(micro>>8)&255,micro&255])}
   const duration=Math.round(e.d*480);
   if(e.type==='note'&&Number.isInteger(e.m)){
     push(ticks,2,[0x90,e.m,95]);push(ticks+Math.max(1,duration-1),1,[0x80,e.m,0]);
   }
   ticks+=duration;
 }
 out.sort((a,b)=>a.t-b.t||a.priority-b.priority);
 let last=0;const track=[];
 track.push(0,0xff,0x03,0x0a,...new TextEncoder().encode('Yasu Score').slice(0,10));
 for(const e of out){track.push(...variable(e.t-last),...e.bytes);last=e.t}
 track.push(...variable(ticks-last),0xff,0x2f,0);
 const header=[77,84,104,100,0,0,0,6,0,0,0,1,...word(480)];
 const bytes=new Uint8Array([...header,77,84,114,107,...dword(track.length),...track]);
 download(new Blob([bytes],{type:'audio/midi'}),filename('mid'));
 $('status').textContent='MIDIファイルを書き出しました（再生先により音色が変わります）';
}
function wavBytes(buffer){
 const sampleRate=buffer.sampleRate,channels=1,length=buffer.length,bytes=new ArrayBuffer(44+length*2),view=new DataView(bytes);
 let p=0;const str=t=>{for(const c of t)view.setUint8(p++,c.charCodeAt(0))};
 const u16=n=>{view.setUint16(p,n,true);p+=2},u32=n=>{view.setUint32(p,n,true);p+=4};
 str('RIFF');u32(36+length*2);str('WAVEfmt ');u32(16);u16(1);u16(channels);u32(sampleRate);u32(sampleRate*2);u16(2);u16(16);str('data');u32(length*2);
 const samples=buffer.getChannelData(0);
 for(let i=0;i<samples.length;i++){const v=Math.max(-1,Math.min(1,samples[i]));view.setInt16(p,v<0?v*32768:v*32767,true);p+=2}
 return new Blob([bytes],{type:'audio/wav'});
}
async function wav(){
 const events=api().getAudioEvents();if(!events.length)throw Error('先に音符を入力してください');
 const timed=[];let t=0;
 for(const e of events){const d=e.d*60/api().getTempoAt(e._measure||1);timed.push({e,t,d});t+=d}
 if(t>180)throw Error('WAVは現在3分以内の曲に対応しています。長い曲はMIDIで保存してください');
 const rate=22050,Offline=window.OfflineAudioContext||window.webkitOfflineAudioContext;
 if(!Offline)throw Error('このブラウザではWAV音声合成が利用できません');
 const ctx=new Offline(1,Math.ceil((t+.4)*rate),rate);
 const compressor=ctx.createDynamicsCompressor();compressor.threshold.value=-14;compressor.ratio.value=12;compressor.connect(ctx.destination);
 const preset={tuba:[.85,.43,.2,.09],trumpet:[.8,.65,.36,.18],cornet:[.85,.51,.25,.1],altohorn:[.85,.43,.2,.09],frenchhorn:[.9,.4,.17,.06],brass:[.85,.43,.2,.09],sine:[1]};
 const harm=preset[api().getTimbre()]||preset.brass;
 const real=new Float32Array(harm.length+1),imag=new Float32Array(harm.length+1);harm.forEach((v,i)=>imag[i+1]=v);
 const wave=ctx.createPeriodicWave(real,imag);
 const vol=Number($('volume').value)/100;
 const level=.18*Math.min(1.5,Math.max(0,vol*2));
 for(const {e,t:start,d} of timed){
   if(e.type!=='note'||!Number.isInteger(e.m))continue;
   const osc=ctx.createOscillator(),gain=ctx.createGain();osc.frequency.value=440*Math.pow(2,(e.m-69)/12);
   osc.setPeriodicWave(wave);
   const attack=Math.min(.04,d*.25),end=start+Math.max(.03,d*.92);
   gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(level,start+attack);
   gain.gain.setValueAtTime(level,Math.max(start+attack,end-.07));gain.gain.linearRampToValueAtTime(0,end);
   osc.connect(gain);gain.connect(compressor);osc.start(start);osc.stop(end+.005);
 }
 $('status').textContent='WAVを書き出し中…（数秒かかることがあります）';
 const rendered=await ctx.startRendering();download(wavBytes(rendered),filename('wav'));
 $('status').textContent='WAVを書き出しました。音色はアプリの再生音に近づけた簡易合成です。';
}
$('exportMidi').onclick=()=>{try{midi()}catch(e){$('status').textContent='MIDI保存失敗：'+e.message}};
$('exportWav').onclick=async()=>{const b=$('exportWav');b.disabled=true;try{await wav()}catch(e){$('status').textContent='WAV保存失敗：'+e.message}finally{b.disabled=false}};
})();
