import { response, supabase } from "./_common.mjs";

export default async req => {
  try {
    const db = supabase();

    if (req.method === "GET") {
      const { data, error } = await db
        .from("route_plans")
        .select("id,route_date,origin_name,origin_address,first_arrival_time,status,notes,created_at,updated_at")
        .order("route_date", { ascending: true });
      if (error) throw error;
      return response(data || []);
    }

    const body = await req.json();

    if (req.method === "PUT") {
      if (!body.route_date) return response({ error: "請選擇日期" }, 400);
      if (!body.first_arrival_time) return response({ error: "請填寫第一站時間" }, 400);

      const payload = {
        route_date: body.route_date,
        first_arrival_time: body.first_arrival_time,
        origin_name: "高雄倉庫",
        origin_address: "高雄市仁武區成功路152號"
      };

      const { data, error } = await db
        .from("route_plans")
        .upsert(payload, { onConflict: "route_date" })
        .select("*")
        .single();
      if (error) throw error;
      return response({ ok: true, route_plan: data });
    }

    return response({ error: "Method not allowed" }, 405);
  } catch (error) {
    return response({ error: error.message || "系統錯誤" }, 500);
  }
};
