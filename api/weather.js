export default async function handler(req, res) {
  const lat = Number(req.query.lat || 59.3293).toFixed(4);
  const lon = Number(req.query.lon || 18.0686).toFixed(4);

  const url = `https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${lat}&lon=${lon}`;

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: true,
        body: text
      });
    }

    const data = JSON.parse(text);

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
