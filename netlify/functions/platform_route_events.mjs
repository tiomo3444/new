import { response, supabase } from "./_common.mjs";

export default async req => {
  try {
    const db = supabase();

    if (req.method === "GET") {
      const { data, error } = await db
        .from("route_events")
        .select("*")
        .order("event_date", { ascending: true })
        .order("after_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return response(data || []);
    }

    const body = await req.json();

    if (req.method === "POST") {
      if (!body.event_date) return response({ error: "請選擇日期" }, 400);
      const afterOrder = Number(body.after_order);
      if (!Number.isInteger(afterOrder) || afterOrder < 0 || afterOrder > 6) {
        return response({ error: "插入位置必須介於第 1 組前至第 6 組後" }, 400);
      }
      if (!body.location_name || !body.location_address) {
        return response({ error: "請選擇疊貨地點" }, 400);
      }

      const payload = {
        event_date: body.event_date,
        after_order: afterOrder,
        event_type: "reload",
        location_name: body.location_name,
        location_address: body.location_address,
        note: body.note || null
      };

      const { data, error } = await db
        .from("route_events")
        .insert(payload)
        .select("*")
        .single();
      if (error) throw error;
      return response({ ok: true, event: data }, 201);
    }

    if (req.method === "DELETE") {
      if (!body.id) return response({ error: "缺少 id" }, 400);
      const { error } = await db.from("route_events").delete().eq("id", body.id);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Method not allowed" }, 405);
  } catch (error) {
    return response({ error: error.message || "系統錯誤" }, 500);
  }
};
