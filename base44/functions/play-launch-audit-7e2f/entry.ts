import { secrets } from 'base44:runtime';

const PACKAGE = 'com.ssrockholdings.quarrymarketplace';
const PRODUCT = 'ssrockholdings_professional_monthly';
const NONCE = 'ssrock-audit-20261001-9f31c2';

function b64url(input: Uint8Array | string) {
  const bytes = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

async function accessToken() {
  const raw = secrets.get('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON');
  if (!raw) throw new Error('GOOGLE_PLAY_SERVICE_ACCOUNT_JSON secret missing');
  const key = JSON.parse(raw);
  const now = Math.floor(Date.now()/1000);
  const header = b64url(JSON.stringify({alg:'RS256',typ:'JWT'}));
  const payload = b64url(JSON.stringify({
    iss:key.client_email,
    scope:'https://www.googleapis.com/auth/androidpublisher',
    aud:'https://oauth2.googleapis.com/token',
    iat:now, exp:now+3600
  }));
  const unsigned = header+'.'+payload;
  const pem = key.private_key.replace('-----BEGIN PRIVATE KEY-----','').replace('-----END PRIVATE KEY-----','').replace(/\s/g,'');
  const der = Uint8Array.from(atob(pem), c=>c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey('pkcs8',der,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
  const signature = new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',cryptoKey,new TextEncoder().encode(unsigned)));
  const jwt = unsigned+'.'+b64url(signature);
  const res = await fetch('https://oauth2.googleapis.com/token',{
    method:'POST',
    headers:{'content-type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:jwt})
  });
  if(!res.ok) throw new Error('OAuth '+res.status+': '+(await res.text()).slice(0,500));
  return (await res.json()).access_token;
}

async function gfetch(token:string, path:string, init:any={}) {
  const url='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/'+PACKAGE+path;
  const res=await fetch(url,{...init,headers:{authorization:'Bearer '+token,'content-type':'application/json',...(init.headers||{})}});
  const text=await res.text();
  let data:any=null; try{data=text?JSON.parse(text):null}catch{data={raw:text.slice(0,800)}}
  return {ok:res.ok,status:res.status,data};
}

export default async function(req:Request) {
  try {
    const body=await req.json().catch(()=>({}));
    if(body?.nonce!==NONCE) return Response.json({error:'forbidden'},{status:403});
    const token=await accessToken();

    const sub=await gfetch(token,'/subscriptions/'+PRODUCT);
    const edit=await gfetch(token,'/edits',{method:'POST',body:'{}'});
    let tracks:any=null, listing:any=null, details:any=null;
    if(edit.ok && edit.data?.id){
      const id=edit.data.id;
      tracks=await gfetch(token,'/edits/'+id+'/tracks');
      listing=await gfetch(token,'/edits/'+id+'/listings/en-US');
      details=await gfetch(token,'/edits/'+id+'/details');
      await gfetch(token,'/edits/'+id,{method:'DELETE'});
    }

    const safeSub = sub.ok ? {
      productId:sub.data?.productId,
      packageName:sub.data?.packageName,
      listings:sub.data?.listings,
      basePlans:sub.data?.basePlans,
      taxAndComplianceSettings:sub.data?.taxAndComplianceSettings
    } : {status:sub.status,error:sub.data?.error?.message||sub.data};

    const safeTracks = tracks?.ok ? (tracks.data?.tracks||[]).map((t:any)=>({
      track:t.track,
      releases:(t.releases||[]).map((r:any)=>({
        name:r.name,status:r.status,versionCodes:r.versionCodes,userFraction:r.userFraction,
        releaseNotes:r.releaseNotes
      }))
    })) : tracks ? {status:tracks.status,error:tracks.data?.error?.message||tracks.data} : null;

    const safeListing = listing?.ok ? {
      language:listing.data?.language,title:listing.data?.title,
      shortDescription:listing.data?.shortDescription,
      fullDescription:listing.data?.fullDescription
    } : listing ? {status:listing.status,error:listing.data?.error?.message||listing.data} : null;

    const safeDetails = details?.ok ? {
      defaultLanguage:details.data?.defaultLanguage,
      contactEmail:details.data?.contactEmail,
      contactWebsite:details.data?.contactWebsite,
      contactPhone:details.data?.contactPhone
    } : details ? {status:details.status,error:details.data?.error?.message||details.data} : null;

    return Response.json({
      oauth:true,
      subscription:{ok:sub.ok,...safeSub},
      edit:{ok:edit.ok,status:edit.status,error:edit.ok?null:(edit.data?.error?.message||edit.data)},
      tracks:safeTracks,
      listing:safeListing,
      details:safeDetails
    });
  } catch(e:any) {
    return Response.json({error:e?.message||String(e)},{status:500});
  }
}