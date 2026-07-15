import { response, supabase } from "./_common.mjs";

// 商品與固定撿貨地點屬於表單基本設定，允許未輸入 PIN 時載入。
// 配送資料的新增、讀取、修改與刪除仍由 schedules.mjs 驗證 SHARED_PIN。
export default async () => {
  try {
    const db = supabase();
    const [
      { data: products, error: productError },
      { data: locations, error: locationError }
    ] = await Promise.all([
      db.from("products")
        .select("id,name,sort_order")
        .eq("is_active", true)
        .order("sort_order"),
      db.from("pickup_locations")
        .select("id,name,address,location_type,sort_order")
        .eq("is_active", true)
        .order("sort_order")
    ]);

    if (productError) throw productError;
    if (locationError) throw locationError;

    return response({ products: products || [], locations: locations || [] });
  } catch (error) {
    return response({ error: error.message || "商品設定讀取失敗" }, 500);
  }
};
