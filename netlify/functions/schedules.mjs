import { response,authorized,supabase } from "./_common.mjs";

async function upsertStaff(db,name){
  const {data:found}=await db.from("staff").select("id").eq("name",name).maybeSingle();
  if(found?.id)return found.id;
  const {data,error}=await db.from("staff").insert({name}).select("id").single();
  if(error)throw error;return data.id;
}
async function insertCustomer(db,name,phone,address){
  const {data,error}=await db.from("customers").insert({name,phone:phone||null,address}).select("id").single();
  if(error)throw error;return data.id;
}
async function nextOrder(db,date,excludeId=null){
  let q=db.from("deliveries").select("delivery_order").eq("delivery_date",date).neq("status","已取消");
  if(excludeId)q=q.neq("id",excludeId);
  const {data,error}=await q;if(error)throw error;
  const used=new Set((data||[]).map(x=>x.delivery_order).filter(Boolean));
  for(let i=1;i<=6;i++)if(!used.has(i))return i;
  return null;
}
async function overview(db){
  const {data,error}=await db.from("delivery_overview").select("*").order("delivery_date",{ascending:true}).order("delivery_order",{ascending:true,nullsFirst:false});
  if(error)throw error;return data||[];
}

export default async req=>{
  try{
    if(!authorized(req))return response({error:"PIN 錯誤"},401);
    const db=supabase();
    if(req.method==="GET")return response(await overview(db));
    const body=await req.json();
    if(req.method==="POST"){
      for(const f of ["delivery_date","customer_name","delivery_address","sales_name"]){if(!String(body[f]||"").trim())return response({error:`缺少欄位：${f}`},400)}
      if(!Array.isArray(body.items)||!body.items.length)return response({error:"請至少選擇一個商品"},400);
      const customerId=await insertCustomer(db,body.customer_name,body.customer_phone,body.delivery_address);
      const staffId=await upsertStaff(db,body.sales_name);
      const order=await nextOrder(db,body.delivery_date);
      const payload={
        customer_id:customerId,customer_name_snapshot:body.customer_name,customer_phone_snapshot:body.customer_phone||null,delivery_address_snapshot:body.delivery_address,
        sales_staff_id:staffId,sales_name_snapshot:body.sales_name,delivery_date:body.delivery_date,delivery_order:order,
        requested_period:body.requested_period||"無指定",constraint_type:body.constraint_type||"優先條件",earliest_time:body.earliest_time||null,latest_time:body.latest_time||null,
        service_minutes:Number(body.service_minutes||0),status:body.status||"待確認",notes:body.notes||null
      };
      const {data:delivery,error}=await db.from("deliveries").insert(payload).select("id").single();if(error)throw error;
      const items=body.items.map(i=>({...i,delivery_id:delivery.id}));
      const {error:itemError}=await db.from("delivery_items").insert(items);
      if(itemError){await db.from("deliveries").delete().eq("id",delivery.id);throw itemError}
      return response({ok:true,id:delivery.id},201);
    }
    if(req.method==="PUT"){
      if(!body.id)return response({error:"缺少 id"},400);
      const staffId=await upsertStaff(db,body.sales_name);
      let order=body.delivery_order||await nextOrder(db,body.delivery_date,body.id);
      const payload={
        customer_name_snapshot:body.customer_name,customer_phone_snapshot:body.customer_phone||null,delivery_address_snapshot:body.delivery_address,
        sales_staff_id:staffId,sales_name_snapshot:body.sales_name,delivery_date:body.delivery_date,delivery_order:order,
        requested_period:body.requested_period||"無指定",constraint_type:body.constraint_type||"優先條件",earliest_time:body.earliest_time||null,latest_time:body.latest_time||null,
        service_minutes:Number(body.service_minutes||0),status:body.status||"待確認",notes:body.notes||null
      };
      const {data:updated,error}=await db.from("deliveries")
        .update(payload)
        .eq("id",body.id)
        .select("id,status,delivery_date,delivery_order")
        .single();
      if(error)throw error;
      if(!updated?.id)throw new Error("找不到要更新的配送資料");
      const {error:delError}=await db.from("delivery_items").delete().eq("delivery_id",body.id);if(delError)throw delError;
      const items=(body.items||[]).map(i=>({...i,delivery_id:body.id}));
      if(items.length){const {error:itemError}=await db.from("delivery_items").insert(items);if(itemError)throw itemError}
      return response({ok:true,delivery:updated});
    }
    if(req.method==="PATCH"){
      if(!body.id)return response({error:"缺少 id"},400);
      const allowed=["待確認","已確認","需改期","配送中","已完成","已取消"];
      if(!allowed.includes(body.status))return response({error:"無效的配送狀態"},400);
      const {data:updated,error}=await db.from("deliveries")
        .update({status:body.status})
        .eq("id",body.id)
        .select("id,status")
        .single();
      if(error)throw error;
      if(!updated?.id)throw new Error("找不到要更新的配送資料");
      return response({ok:true,delivery:updated});
    }
    if(req.method==="DELETE"){
      if(!body.id)return response({error:"缺少 id"},400);
      const {error}=await db.from("deliveries").delete().eq("id",body.id);if(error)throw error;
      return response({ok:true});
    }
    return response({error:"Method not allowed"},405);
  }catch(e){return response({error:e.message||"系統錯誤"},500)}
};
