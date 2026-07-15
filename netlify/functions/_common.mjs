import { createClient } from "@supabase/supabase-js";

export function response(data,status=200){
  return Response.json(data,{status,headers:{"Cache-Control":"no-store"}});
}
export function authorized(req){
  const required=process.env.SHARED_PIN;
  return !required || req.headers.get("x-shared-pin")===required;
}
export function supabase(){
  const url=process.env.SUPABASE_URL;
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!url||!key) throw new Error("尚未設定 SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
