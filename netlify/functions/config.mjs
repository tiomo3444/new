export default async () => {
  return Response.json({
    defaultOrigin: process.env.DEFAULT_ORIGIN || "高雄市仁武區成功路152號",
    mapsEnabled: Boolean(process.env.GOOGLE_MAPS_API_KEY),
    sharedPinEnabled: Boolean(process.env.SHARED_PIN)
  }, { headers: { "Cache-Control": "no-store" } });
};
