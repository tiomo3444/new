import { response, supabase } from "./_common.mjs";

export default async req => {
  try {
    const db = supabase();

    if (req.method === "GET") {
      const { data, error } = await db
        .from("schedule_blocks")
        .select("*")
        .order("block_date", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return response(data || []);
    }

    const body = await req.json();

    if (req.method === "POST") {
      if (!body.block_date) return response({ error: "請選擇日期" }, 400);
      const allowed = ["morning", "afternoon", "all_day", "custom"];
      if (!allowed.includes(body.block_type)) return response({ error: "無效的禁排類型" }, 400);
      if (body.block_type === "custom") {
        if (!body.start_time || !body.end_time) return response({ error: "自訂時段需填寫開始與結束時間" }, 400);
        if (body.start_time >= body.end_time) return response({ error: "結束時間必須晚於開始時間" }, 400);
      }
      const payload = {
        block_date: body.block_date,
        block_type: body.block_type,
        start_time: body.block_type === "custom" ? body.start_time : null,
        end_time: body.block_type === "custom" ? body.end_time : null,
        reason: body.reason || null
      };
      const { data, error } = await db.from("schedule_blocks").insert(payload).select("*").single();
      if (error) throw error;
      return response({ ok: true, block: data }, 201);
    }

    if (req.method === "DELETE") {
      if (!body.id) return response({ error: "缺少 id" }, 400);
      const { error } = await db.from("schedule_blocks").delete().eq("id", body.id);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Method not allowed" }, 405);
  } catch (error) {
    return response({ error: error.message || "系統錯誤" }, 500);
  }
};
