import { response,authorized,supabase } from "./_common.mjs";
export default async req=>{
  try{
    if(!authorized(req)) return response({error:"PIN 錯誤"},401);
    const db=supabase();
    const [{data:products,error:e1},{data:locations,error:e2}]=await Promise.all([
      db.from("products").select("id,name,sort_order").eq("is_active",true).order("sort_order"),
      db.from("pickup_locations").select("id,name,address,location_type,sort_order").eq("is_active",true).order("sort_order")
    ]);
    if(e1) throw e1;if(e2) throw e2;
    return response({products,locations});
  }catch(e){return response({error:e.message||"系統錯誤"},500)}
};
