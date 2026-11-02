/* v4.1 learning guides: concert-pitch note fingering and rhythmic prompts.
   Reference fingering only. Always allow manual overrides. */
(function(root){
 'use strict';
 const configs={
  tuba:{base:22,kind:'valve',name:'B♭管チューバ'},
  brass:{base:22,kind:'valve',name:'B♭管チューバ（参考）'},
  euphonium:{base:34,kind:'valve',name:'B♭管ユーフォニアム'},
  trumpet:{base:46,kind:'valve',name:'B♭管トランペット'},
  cornet:{base:46,kind:'valve',name:'B♭管コルネット'},
  altohorn:{base:39,kind:'valve',name:'E♭管アルトホルン'},
  frenchhorn:{base:29,kind:'valve',name:'F管ホルン（シングルF管想定）'},
  trombone:{base:34,kind:'slide',name:'B♭管トロンボーン'},
 };
 // Semitone reductions of equal-tempered approximate valve lengths.
 const valveSets=[{delta:0,label:'0',cost:0},{delta:1,label:'2',cost:1},{delta:2,label:'1',cost:1},{delta:3,label:'1・2',cost:2},{delta:3,label:'3',cost:2.6},{delta:4,label:'2・3',cost:3},{delta:5,label:'1・3',cost:2.7},{delta:6,label:'1・2・3',cost:4}];
 const slideSets=Array.from({length:7},(_,i)=>({delta:i,label:String(i+1)+'位置',cost:i*.15}));
 function fingering(midi,timbre,override){
  if(typeof override==='string'&&override.trim())return override.trim().slice(0,16);
  const cfg=configs[timbre];if(!cfg||!Number.isInteger(midi))return '';
  const sets=cfg.kind==='slide'?slideSets:valveSets;
  let best=null;
  // Harmonic 1 is a pedal tone; 2..12 are usable partials. Higher partials
  // are progressively less preferable, and partial 7/11 are poorly tempered.
  for(let h=1;h<=12;h++){
   const open=Math.round(cfg.base+12*Math.log2(h));
   for(const v of sets){
    if(open-v.delta!==midi)continue;
    const score=v.cost+(h===1?2:0)+(h>6?(h-6)*.65:0)+([7,11].includes(h)?2:0);
    if(!best||score<best.score)best={label:v.label,score};
   }
  }
  return best?best.label:'要確認';
 }
 function rhythmWord(event){
  if(event.type==='multi'||event.type==='repeat')return '';
  if(event.triplet)return event.m==null?'（休）':'タ（3連）';
  const d=Number(event.d)||0;
  const note=event.m!=null;
  const pairs=[[4,'ターーーー'],[3,'ターーー'],[2,'ターアン'],[1.5,'ターア'],[1,'タン'],[.75,'タァ'],[.5,'タ'],[.25,'チ'],[.125,'チ']];
  const found=pairs.find(x=>Math.abs(x[0]-d)<.0001);
  return note?(found?found[1]:'♪'):(found?'休 '+found[1]:'休');
 }
 function beatCount(start,meter){
  const b=meter==='6/8'?3:Number(meter)||4;
  const pos=((start%b)+b)%b;
  if(meter==='6/8'){
   const i=Math.round(pos*2);
   if(Math.abs(pos*2-i)<.015)return ['1','と','ら','2','と','ら'][i%6];
  }
  const whole=Math.floor(pos+1e-6),sub=pos-whole;
  if(Math.abs(sub)<.015)return String(whole+1);
  if(Math.abs(sub-.5)<.015)return 'と';
  if(Math.abs(sub-.25)<.015)return 'e';
  if(Math.abs(sub-.75)<.015)return 'a';
  if(Math.abs(sub-1/3)<.02)return '3連②';
  if(Math.abs(sub-2/3)<.02)return '3連③';
  return (whole+1)+'+'+Number(sub.toFixed(2));
 }
 const api={fingering,rhythmWord,beatCount,configs};
 root.scoreGuide=api;
 if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
