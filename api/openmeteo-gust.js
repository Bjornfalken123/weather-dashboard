export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({
      error: true,
      message: "lat och lon krävs"
    });
  }

  try {
    const url =
      `https://api.open-meteo.com/v1/forecast` +
      `?latitude=${lat}&longitude=${lon}` +
      `&current=wind_gusts_10m` +
      `&hourly=wind_gusts_10m` +
      `&wind_speed_unit=ms` +
      `&timezone=auto&forecast_days=1`;

    const response = await fetch(url);
    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: true,
        source: "Open-Meteo",
        body: text
      });
    }

    const data = JSON.parse(text);

    const currentValue = data?.current?.wind_gusts_10m ?? null;
    const currentTime = data?.current?.time ?? null;

    return res.status(200).json({
      value: currentValue,
      time: currentTime,
      source: "Open-Meteo",
      unit: "m/s"
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
