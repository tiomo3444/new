import { response, supabase } from "./_common.mjs";

async function upsertStaff(db, name) {
  const { data: found } = await db.from("staff").select("id").eq("name", name).maybeSingle();
  if (found?.id) return found.id;
  const { data, error } = await db.from("staff").insert({ name }).select("id").single();
  if (error) throw error;
  return data.id;
}

async function insertCustomer(db, name, phone, address) {
  const { data, error } = await db
    .from("customers")
    .insert({ name, phone: phone || null, address })
    .select("id")
    .single();
  if (error) throw error;
  return data.id;
}

function cleanTime(value) {
  return value ? String(value).slice(0, 5) : "";
}

function isMorningRequest(body) {
  if (body.requested_period === "希望上午送達") return true;
  if (body.constraint_type !== "硬性限制") return false;
  const early = cleanTime(body.earliest_time);
  const late = cleanTime(body.latest_time);
  if (body.requested_period === "指定時段" && early && early < "12:00") return true;
  if (body.requested_period === "指定時間前" && late && late <= "12:00") return true;
  return false;
}

async function activeForDate(db, date, excludeId = null) {
  let query = db
    .from("deliveries")
    .select("id,delivery_order,requested_period,constraint_type,earliest_time,latest_time,status,created_at")
    .eq("delivery_date", date)
    .neq("status", "已取消");
  if (excludeId) query = query.neq("id", excludeId);
  const { data, error } = await query.order("delivery_order", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

async function ensureMorningAvailable(db, body, excludeId = null) {
  if (!isMorningRequest(body)) return;
  const existing = await activeForDate(db, body.delivery_date, excludeId);
  if (existing.some(isMorningRequest)) {
    throw new Error("此日期已有一組上午配送，上午時段每日僅能安排一組");
  }
}


function isAfternoonRequest(body) {
  if (body.requested_period === "希望下午送達") return true;
  if (body.constraint_type !== "硬性限制") return false;
  const early = cleanTime(body.earliest_time);
  const late = cleanTime(body.latest_time);
  if (body.requested_period === "指定時間後" && early && early >= "12:00") return true;
  if (body.requested_period === "指定時段" && early && early >= "12:00") return true;
  if (body.requested_period === "指定時間前" && late && late > "12:00") return true;
  return false;
}

function toMinutes(value) {
  const t = cleanTime(value);
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function requestedRange(body) {
  if (body.constraint_type !== "硬性限制") return null;
  const early = toMinutes(body.earliest_time);
  const late = toMinutes(body.latest_time);
  if (body.requested_period === "指定時間後" && early !== null) return [early, 1440];
  if (body.requested_period === "指定時間前" && late !== null) return [0, late];
  if (body.requested_period === "指定時段" && early !== null && late !== null) return [early, late];
  if (body.requested_period === "希望上午送達") return [0, 720];
  if (body.requested_period === "希望下午送達") return [720, 1440];
  return null;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

async function ensureNotBlocked(db, body, excludeId = null) {
  const { data: blocks, error } = await db
    .from("schedule_blocks")
    .select("id,block_type,start_time,end_time,reason")
    .eq("block_date", body.delivery_date);
  if (error) throw error;
  const list = blocks || [];

  const allDay = list.find(b => b.block_type === "all_day");
  if (allDay) throw new Error(`此日期整天無法配送${allDay.reason ? `：${allDay.reason}` : ""}`);

  const morningBlocked = list.some(b => b.block_type === "morning");
  const afternoonBlocked = list.some(b => b.block_type === "afternoon");

  if (isMorningRequest(body) && morningBlocked) {
    throw new Error("此日期上午無法配送，請改選下午或其他日期");
  }
  if (isAfternoonRequest(body) && afternoonBlocked) {
    throw new Error("此日期下午無法配送，請改選上午或其他日期");
  }

  const range = requestedRange(body);
  if (range) {
    const conflict = list.find(b => {
      if (b.block_type !== "custom") return false;
      const start = toMinutes(b.start_time) ?? 0;
      const end = toMinutes(b.end_time) ?? 1440;
      return overlaps(range[0], range[1], start, end);
    });
    if (conflict) throw new Error("客戶指定時間與自訂禁排時段衝突");
  }

  if (!isMorningRequest(body) && !isAfternoonRequest(body)) {
    const existing = await activeForDate(db, body.delivery_date, excludeId);
    const morningUsed = existing.some(isMorningRequest);
    if (morningBlocked && afternoonBlocked) throw new Error("此日期上午與下午皆無法配送");
    if (afternoonBlocked && morningUsed) throw new Error("此日期下午無法配送，且上午名額已使用");
  }
}

async function nextOrder(db, date, excludeId = null) {
  const data = await activeForDate(db, date, excludeId);
  const used = new Set(data.map(x => x.delivery_order).filter(Boolean));
  for (let i = 1; i <= 6; i++) if (!used.has(i)) return i;
  throw new Error("此日期已安排 6 組配送，請改選其他日期");
}

async function assignMorningFirst(db, date, excludeId = null) {
  const others = await activeForDate(db, date, excludeId);
  if (others.length >= 6) throw new Error("此日期已安排 6 組配送，無法再新增上午配送");

  // 先暫時清空順序，避免唯一索引衝突，再依原順序排到第 2 組以後。
  for (const row of others) {
    const { error } = await db.from("deliveries").update({ delivery_order: null }).eq("id", row.id);
    if (error) throw error;
  }
  for (let i = 0; i < others.length; i++) {
    const { error } = await db.from("deliveries").update({ delivery_order: i + 2 }).eq("id", others[i].id);
    if (error) throw error;
  }
  return 1;
}

async function overview(db) {
  const { data, error } = await db
    .from("delivery_overview")
    .select("*")
    .order("delivery_date", { ascending: true })
    .order("delivery_order", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data || [];
}

export default async req => {
  try {
    const db = supabase();

    if (req.method === "GET") return response(await overview(db));

    const body = await req.json();

    if (req.method === "POST") {
      for (const field of ["delivery_date", "customer_name", "delivery_address", "sales_name"]) {
        if (!String(body[field] || "").trim()) return response({ error: `缺少欄位：${field}` }, 400);
      }
      if (!Array.isArray(body.items) || !body.items.length) {
        return response({ error: "請至少選擇一個商品" }, 400);
      }

      await ensureMorningAvailable(db, body);
      await ensureNotBlocked(db, body);
      const customerId = await insertCustomer(db, body.customer_name, body.customer_phone, body.delivery_address);
      const staffId = await upsertStaff(db, body.sales_name);
      const order = isMorningRequest(body)
        ? await assignMorningFirst(db, body.delivery_date)
        : await nextOrder(db, body.delivery_date);

      const payload = {
        customer_id: customerId,
        customer_name_snapshot: body.customer_name,
        customer_phone_snapshot: body.customer_phone || null,
        delivery_address_snapshot: body.delivery_address,
        sales_staff_id: staffId,
        sales_name_snapshot: body.sales_name,
        delivery_date: body.delivery_date,
        delivery_order: order,
        requested_period: body.requested_period || "無指定",
        constraint_type: body.constraint_type || "優先條件",
        earliest_time: body.earliest_time || null,
        latest_time: body.latest_time || null,
        service_minutes: Number(body.service_minutes || 0),
        status: body.status || "待確認",
        notes: body.notes || null
      };

      const { data: delivery, error } = await db.from("deliveries").insert(payload).select("id").single();
      if (error) throw error;

      const items = body.items.map(item => ({ ...item, delivery_id: delivery.id }));
      const { error: itemError } = await db.from("delivery_items").insert(items);
      if (itemError) {
        await db.from("deliveries").delete().eq("id", delivery.id);
        throw itemError;
      }
      const tasks = (body.tasks || []).map((task, index) => ({ ...task, delivery_id: delivery.id, task_order: index + 1 }));
      if (tasks.length) {
        const { error: taskError } = await db.from("delivery_tasks").insert(tasks);
        if (taskError) {
          await db.from("deliveries").delete().eq("id", delivery.id);
          throw taskError;
        }
      }
      return response({ ok: true, id: delivery.id }, 201);
    }

    if (req.method === "PUT") {
      if (!body.id) return response({ error: "缺少 id" }, 400);

      await ensureMorningAvailable(db, body, body.id);
      await ensureNotBlocked(db, body, body.id);
      const staffId = await upsertStaff(db, body.sales_name);

      let order;
      if (isMorningRequest(body)) {
        const { data: current, error: currentError } = await db
          .from("deliveries")
          .select("delivery_date,delivery_order")
          .eq("id", body.id)
          .single();
        if (currentError) throw currentError;

        // 先將自己移出原順序，再把它插入第 1 組。
        const { error: clearError } = await db.from("deliveries").update({ delivery_order: null }).eq("id", body.id);
        if (clearError) throw clearError;
        order = await assignMorningFirst(db, body.delivery_date, body.id);
      } else {
        order = body.delivery_order || await nextOrder(db, body.delivery_date, body.id);
      }

      const payload = {
        customer_name_snapshot: body.customer_name,
        customer_phone_snapshot: body.customer_phone || null,
        delivery_address_snapshot: body.delivery_address,
        sales_staff_id: staffId,
        sales_name_snapshot: body.sales_name,
        delivery_date: body.delivery_date,
        delivery_order: order,
        requested_period: body.requested_period || "無指定",
        constraint_type: body.constraint_type || "優先條件",
        earliest_time: body.earliest_time || null,
        latest_time: body.latest_time || null,
        service_minutes: Number(body.service_minutes || 0),
        status: body.status || "待確認",
        notes: body.notes || null
      };

      const { data: updated, error } = await db
        .from("deliveries")
        .update(payload)
        .eq("id", body.id)
        .select("id,status,delivery_date,delivery_order")
        .single();
      if (error) throw error;
      if (!updated?.id) throw new Error("找不到要更新的配送資料");

      const { error: deleteItemsError } = await db.from("delivery_items").delete().eq("delivery_id", body.id);
      if (deleteItemsError) throw deleteItemsError;

      const items = (body.items || []).map(item => ({ ...item, delivery_id: body.id }));
      if (items.length) {
        const { error: itemError } = await db.from("delivery_items").insert(items);
        if (itemError) throw itemError;
      }

      const { error: deleteTasksError } = await db.from("delivery_tasks").delete().eq("delivery_id", body.id);
      if (deleteTasksError) throw deleteTasksError;
      const tasks = (body.tasks || []).map((task, index) => ({ ...task, delivery_id: body.id, task_order: index + 1 }));
      if (tasks.length) {
        const { error: taskError } = await db.from("delivery_tasks").insert(tasks);
        if (taskError) throw taskError;
      }
      return response({ ok: true, delivery: updated });
    }

    if (req.method === "PATCH") {
      if (!body.id) return response({ error: "缺少 id" }, 400);
      const allowed = ["待確認", "已確認", "需改期", "配送中", "已完成", "已取消"];
      if (!allowed.includes(body.status)) return response({ error: "無效的配送狀態" }, 400);

      const { data: updated, error } = await db
        .from("deliveries")
        .update({ status: body.status })
        .eq("id", body.id)
        .select("id,status")
        .single();
      if (error) throw error;
      return response({ ok: true, delivery: updated });
    }

    if (req.method === "DELETE") {
      if (!body.id) return response({ error: "缺少 id" }, 400);
      const { error } = await db.from("deliveries").delete().eq("id", body.id);
      if (error) throw error;
      return response({ ok: true });
    }

    return response({ error: "Method not allowed" }, 405);
  } catch (error) {
    return response({ error: error.message || "系統錯誤" }, 500);
  }
};
