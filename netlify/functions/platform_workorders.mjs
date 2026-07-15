import { response, supabase } from "./_common.mjs";

function authorized(req) {
  const pin = process.env.WORK_ORDER_PIN;
  return !!pin && req.headers.get("x-workorder-pin") === pin;
}

async function listWorkorders(db, month) {
  let query = db.from("work_orders").select("*")
    .order("work_order_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (month && /^\d{4}-\d{2}$/.test(month)) {
    const [year, mon] = month.split("-").map(Number);
    const start = `${month}-01`;
    const next = mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, "0")}-01`;
    query = query.gte("work_order_date", start).lt("work_order_date", next);
  }

  const { data, error } = await query;
  if (error) throw error;

  const deliveryIds = [...new Set((data || []).map(w => w.delivery_id).filter(Boolean))];
  const labels = {};
  if (deliveryIds.length) {
    const { data: deliveries, error: deliveryError } = await db
      .from("delivery_overview")
      .select("id,delivery_date,delivery_order,sales_name,customer_name")
      .in("id", deliveryIds);
    if (deliveryError) throw deliveryError;
    for (const d of deliveries || []) {
      labels[d.id] = `${d.delivery_date}｜第${d.delivery_order || "-"}站｜${d.sales_name || ""} ${d.customer_name || ""}`.trim();
    }
  }
  return (data || []).map(w => ({ ...w, delivery_label: w.delivery_id ? labels[w.delivery_id] || "" : "" }));
}

export default async req => {
  try {
    if (!authorized(req)) return response({ error: "主管密碼錯誤" }, 401);
    const db = supabase();
    const url = new URL(req.url);

    if (req.method === "GET") return response(await listWorkorders(db, url.searchParams.get("month")));

    const body = await req.json();

    if (req.method === "POST") {
      if (!body.work_order_date || !body.order_number) return response({ error: "請填寫工單日期與訂單編號" }, 400);
      const payload = {
        work_order_date: body.work_order_date,
        work_order_status: body.work_order_status || "待補工單",
        delivery_id: body.delivery_id || null,
        order_number: body.order_number,
        original_amount: Number(body.original_amount || 0),
        adjusted_amount: Number(body.adjusted_amount || 0),
        supervisor_name: body.supervisor_name || null,
        supervisor_confirmed: !!body.supervisor_confirmed,
        confirmed_at: body.supervisor_confirmed ? new Date().toISOString() : null,
        notes: body.notes || null,
        image_url: body.image_url || null
      };
      const { data, error } = await db.from("work_orders").insert(payload).select("*").single();
      if (error) throw error;
      return response({ ok: true, work_order: data }, 201);
    }

    if (req.method === "PUT") {
      if (!body.id) return response({ error: "缺少工單 id" }, 400);
      const payload = {
        work_order_date: body.work_order_date,
        work_order_status: body.work_order_status,
        delivery_id: body.delivery_id || null,
        order_number: body.order_number,
        original_amount: Number(body.original_amount || 0),
        adjusted_amount: Number(body.adjusted_amount || 0),
        supervisor_name: body.supervisor_name || null,
        supervisor_confirmed: !!body.supervisor_confirmed,
        confirmed_at: body.supervisor_confirmed ? new Date().toISOString() : null,
        notes: body.notes || null
      };
      if (body.image_url) payload.image_url = body.image_url;
      const { data, error } = await db.from("work_orders").update(payload).eq("id", body.id).select("*").single();
      if (error) throw error;
      return response({ ok: true, work_order: data });
    }

    if (req.method === "DELETE") {
      if (!body.id) return response({ error: "缺少工單 id" }, 400);
      const { error } = await db.from("work_orders").delete().eq("id", body.id);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Method not allowed" }, 405);
  } catch (error) {
    return response({ error: error.message || "系統錯誤" }, 500);
  }
};
