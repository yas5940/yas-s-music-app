/* v4.0 beta: Google Identity Services + Picker + Drive file operations.
   No OAuth client secret is used or stored. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const storeKey='yasu-score-cloud-v4-settings';
let token='',tokenClient=null,folderId='',folderName='',gisReady=null,pickerReady=null;
const status=t=>{$('cloudStatus').textContent=t};
const safeName=t=>String(t||'楽譜').replace(/[\\/:*?"<>|\x00-\x1f]/g,'_').slice(0,70);
const client=()=>String($('cloudClientId').value||'').trim();
const key=()=>String($('cloudApiKey').value||'').trim();
const projectNumber='89068515662'; // Google Cloud project number from OAuth client ID
function saveSettings(){
 try{localStorage.setItem(storeKey,JSON.stringify({clientId:client(),apiKey:key(),folderId,folderName}))}catch(e){}
}
function restoreSettings(){
 try{const d=JSON.parse(localStorage.getItem(storeKey)||'{}');
   $('cloudClientId').value=d.clientId||'89068515662-n5dqvi40v6ut4prb5qm00lqb4vkbudlg.apps.googleusercontent.com';
   $('cloudApiKey').value=d.apiKey||'';folderId=d.folderId||'';folderName=d.folderName||'';
   showFolder();
 }catch(e){}
}
function showFolder(){$('cloudFolderName').textContent=folderId?'保存先：'+folderName+'（選択済み）':'保存先：未選択'}
function script(src){return new Promise((resolve,reject)=>{
 const existing=[...document.scripts].find(x=>x.src===src);
 if(existing&&existing.dataset.ready==='1')return resolve();
 const el=existing||document.createElement('script');
 if(!existing){el.src=src;el.async=true;document.head.appendChild(el)}
 el.addEventListener('load',()=>{el.dataset.ready='1';resolve()},{once:true});
 el.addEventListener('error',()=>reject(Error('Googleのライブラリを読み込めませんでした')),{once:true});
 })}
async function ensureGIS(){
 if(!gisReady)gisReady=script('https://accounts.google.com/gsi/client').catch(e=>{gisReady=null;throw e});
 await gisReady;
 if(!window.google?.accounts?.oauth2)throw Error('Googleログインの初期化に失敗しました');
}
async function ensurePicker(){
 if(!pickerReady)pickerReady=script('https://apis.google.com/js/api.js').then(()=>new Promise((resolve,reject)=>{
   window.gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Google Pickerを開けません'))});
 })).catch(e=>{pickerReady=null;throw e});
 await pickerReady;
}
function requestToken(interactive=true){
 return new Promise(async(resolve,reject)=>{
  try{
   if(!client().endsWith('.apps.googleusercontent.com'))throw Error('OAuthクライアントIDを確認してください');
   await ensureGIS();
   if(!tokenClient){
    tokenClient=google.accounts.oauth2.initTokenClient({
     client_id:client(),scope:'https://www.googleapis.com/auth/drive.file',
     callback:()=>{}
    });
   }
   tokenClient.callback=(response)=>{
     if(response.error)return reject(Error('ログインに失敗：'+response.error));
     token=response.access_token;status('Googleにログインしました。保存先フォルダを選択してください。');resolve(token);
   };
   tokenClient.error_callback=()=>reject(Error('ログインが中断されました。ポップアップ設定を確認してください'));
   tokenClient.requestAccessToken({prompt:interactive?'consent':''});
  }catch(e){reject(e)}
 });
}
async function authorized(){if(!token)await requestToken();return token}
async function drive(path,options={}){
 await authorized();
 const req=()=>fetch('https://www.googleapis.com/'+(path.startsWith('upload/')?path:'drive/v3/'+path),{
  ...options,headers:{Authorization:'Bearer '+token,...(options.headers||{})}
 });
 let r=await req();
 if(r.status===401){token='';await requestToken();r=await req()}
 if(!r.ok){let body='';try{body=(await r.json()).error?.message||''}catch(e){}
   throw Error('Google Drive API '+r.status+(body?'：'+body:''));}
 return r;
}
async function pickerFolder(){
 await authorized();if(!key())throw Error('Picker APIキーを入力してください');
 await ensurePicker();
 const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS)
   .setIncludeFolders(true).setSelectFolderEnabled(true);
 const p=new google.picker.PickerBuilder().addView(view)
   .setOAuthToken(token).setDeveloperKey(key()).setAppId(projectNumber)
   .setTitle('楽譜の保存先フォルダを選択')
   .setCallback(async data=>{
    if(data.action!==google.picker.Action.PICKED)return;
    const item=data.docs?.[0];if(!item?.id)return;
    folderId=item.id;folderName=item.name||'選択したフォルダ';saveSettings();showFolder();
    status('フォルダを選択しました。クラウド保存できます。');
    try{await refresh()}catch(e){status('フォルダ選択完了。ただし一覧取得：'+e.message)}
   }).build();
 p.setVisible(true);
}
async function refresh(){
 if(!folderId)throw Error('先に保存先フォルダを選んでください');
 const q="'"+folderId.replace(/'/g,"\\'")+"' in parents and trashed = false and mimeType = 'application/json'";
 const params=new URLSearchParams({q,fields:'nextPageToken,files(id,name,modifiedTime)',page_size:'100',orderBy:'modifiedTime desc'});
 // Drive API expects pageSize (camelCase).
 params.delete('page_size');params.set('pageSize','100');
 const r=await drive('files?'+params);
 const data=await r.json();const select=$('cloudFiles');select.replaceChildren();
 const files=data.files||[];
 if(!files.length){const opt=document.createElement('option');opt.value='';opt.textContent='このフォルダにアプリから保存したJSONはありません';select.append(opt)}
 files.forEach(f=>{const o=document.createElement('option');o.value=f.id;o.textContent=f.name+'（'+new Date(f.modifiedTime).toLocaleString('ja-JP')+'）';select.append(o)});
 status(files.length+'件の楽譜を表示しました。※このアプリにアクセス権があるファイルのみ表示します。');
}
async function save(){
 if(!folderId)throw Error('先に保存先フォルダを選んでください');
 if(!confirm('現在の楽譜をGoogleドライブに新しいファイルとして保存しますか？'))return;
 const data=window.scoreV4API.exportScoreData();
 const name=safeName(data.title)+'_'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';
 const metadata={name,mimeType:'application/json',parents:[folderId]};
 const boundary='yasu-score-v4-boundary-'+Date.now();
 const json=JSON.stringify(data,null,2);
 const body=new Blob([
   '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
   JSON.stringify(metadata),
   '\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',
   json,
   '\r\n--'+boundary+'--'
 ],{type:'multipart/related; boundary='+boundary});
 const r=await drive('upload/drive/v3/files?uploadType=multipart&fields=id,name',{
   method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body
 });
 const saved=await r.json();status('保存完了：'+saved.name);await refresh();status('☁️ 保存完了：'+saved.name);
}
async function load(){
 const id=$('cloudFiles').value;if(!id)throw Error('読み込む楽譜を選択してください');
 if(!confirm('現在の編集中の楽譜を置き換えます。先にJSONでバックアップしましたか？'))return;
 const r=await drive('files/'+encodeURIComponent(id)+'?alt=media');
 const data=await r.json();window.scoreV4API.importScoreData(data);
 status('☁️ 読み込み完了：'+$('title').value);
}
function bind(id,fn){$(id).onclick=async()=>{try{status('処理中…');await fn()}catch(e){status('⚠️ '+e.message)}}}
restoreSettings();
// Preload libraries so mobile Safari can open Google's consent popup directly on a tap.
ensureGIS().catch(()=>{});ensurePicker().catch(()=>{});
$('cloudClientId').addEventListener('change',()=>{token='';tokenClient=null;saveSettings()});
$('cloudApiKey').addEventListener('change',saveSettings);
bind('cloudConnect',async()=>{await requestToken(true);saveSettings()});
bind('cloudFolder',pickerFolder);
bind('cloudSave',save);bind('cloudRefresh',refresh);bind('cloudLoad',load);
bind('cloudDisconnect',async()=>{
 if(token&&window.google?.accounts?.oauth2)google.accounts.oauth2.revoke(token,()=>{});
 token='';tokenClient=null;status('ログアウトしました。保存先設定は端末に残っています。');
});
})();
