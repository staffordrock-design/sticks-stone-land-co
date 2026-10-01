import { secrets } from 'base44:runtime';

const PACKAGE='com.ssrockholdings.quarrymarketplace';
const PRODUCT='ssrockholdings_professional_monthly';
const NONCE='audit-after-permission-20261001';

function b64url(input: Uint8Array|string){
  const bytes=typeof input==='string'?new TextEncoder().encode(input):input;
  let s=''; for(const b of bytes)s+=String.fromCharCode(b);
  return btoa(s).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
}
async function token(){
  const raw=secrets.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if(!raw) throw new Error('missing service account secret');
  const key=JSON.parse(raw), now=Math.floor(Date.now()/1000);
  const h=b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const p=b64url(JSON.stringify({iss:key.client_email,scope:'https://www.googleapis.com/auth/androidpublisher',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3600}));
  const u=h+'.'+p;
  const pem=key.private_key.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const der=Uint8Array.from(atob(pem),c=>c.charCodeAt(0));
  const ck=await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const sig=new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',ck,new TextEncoder().encode(u)));
  const jwt=u+'.'+b64url(sig);
  const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})});
  if(!r.ok) throw new Error('oauth '+r.status+' '+(await r.text()).slice(0,400));
  return (await r.json()).access_token;
}
async function gf(tok:string,url:string,init:any={}){
  const r=await fetch(url,{...init,headers:{authorization:'Bearer '+tok,'content-type':'application/json',...(init.headers||{})}});
  const t=await r.text(); let d:any=null; try{d=t?JSON.parse(t):null}catch{d={raw:t.slice(0,1000)}}
  return {ok:r.ok,status:r.status,data:d};
}
export default async function(req:Request){
  const body=await req.json().catch(()=>({}));
  if(body?.nonce!==NONCE) return Response.json({error:'forbidden'},{status:403});
  try{
    const tok=await token();
    const base='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+PACKAGE;
    const sub=await gf(tok,base+'/subscriptions/'+PRODUCT);
    const all=await gf(tok,base+'/subscriptions');
    const edit=await gf(tok,base+'/edits',{method:'POST',body:'{}'});
    let tracks:any=null;
    if(edit.ok&&edit.data?.id){
      tracks=await gf(tok,base+'/edits/'+edit.data.id+'/tracks');
      await gf(tok,base+'/edits/'+edit.data.id,{method:'DELETE'});
    }
    return Response.json({
      sub:{ok:sub.ok,status:sub.status,data:sub.ok?sub.data:{error:sub.data?.error?.message||sub.data}},
      all:{ok:all.ok,status:all.status,data:all.ok?all.data:{error:all.data?.error?.message||all.data}},
      edit:{ok:edit.ok,status:edit.status,error:edit.ok?null:(edit.data?.error?.message||edit.data)},
      tracks:tracks?.ok?tracks.data:{status:tracks?.status,error:tracks?.data?.error?.message||tracks?.data}
    });
  }catch(e:any){return Response.json({error:e?.message||String(e)},{status:500})}
}