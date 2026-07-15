const json = (data, status = 200) => Response.json(data, { status, headers: { "Cache-Control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  if (!apiKey) return json({ error: "尚未設定 GOOGLE_MAPS_API_KEY" }, 503);

  try {
    const { origin, destination } = await req.json();
    if (!origin || !destination) return json({ error: "缺少出發地或配送地址" }, 400);

    const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask": "routes.duration,routes.distanceMeters,routes.staticDuration"
      },
      body: JSON.stringify({
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "DRIVE",
        routingPreference: "TRAFFIC_AWARE",
        languageCode: "zh-TW",
        units: "METRIC"
      })
    });

    const payload = await response.json();
    if (!response.ok) return json({ error: payload?.error?.message || "Google 路線查詢失敗" }, response.status);
    const route = payload.routes?.[0];
    if (!route) return json({ error: "查無可用路線" }, 404);
    const seconds = Number(String(route.duration || route.staticDuration || "0s").replace("s", ""));
    return json({
      travelMinutes: Math.max(1, Math.ceil(seconds / 60)),
      distanceKm: Math.round((route.distanceMeters || 0) / 100) / 10
    });
  } catch (error) {
    return json({ error: error.message || "路線查詢發生錯誤" }, 500);
  }
};
