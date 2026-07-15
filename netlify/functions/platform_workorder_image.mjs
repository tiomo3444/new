import { response, supabase } from "./_common.mjs";

function authorized(req) {
  const pin = process.env.WORK_ORDER_PIN;
  return !!pin && req.headers.get("x-workorder-pin") === pin;
}

export default async req => {
  try {
    if (!authorized(req)) return response({ error: "主管密碼錯誤" }, 401);
    if (req.method !== "POST") return response({ error: "Method not allowed" }, 405);

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string") return response({ error: "請選擇圖片" }, 400);
    if (!String(file.type || "").startsWith("image/")) return response({ error: "只允許上傳圖片" }, 400);

    const ext = String(file.name || "jpg").split(".").pop().replace(/[^a-zA-Z0-9]/g, "") || "jpg";
    const path = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}.${ext}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const db = supabase();

    const { error } = await db.storage.from("work-order-images")
      .upload(path, bytes, { contentType: file.type, upsert: false });
    if (error) throw error;

    const { data } = db.storage.from("work-order-images").getPublicUrl(path);
    return response({ ok: true, url: data.publicUrl });
  } catch (error) {
    return response({ error: error.message || "圖片上傳失敗" }, 500);
  }
};
