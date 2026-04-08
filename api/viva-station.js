export default async function handler(req, res) {
  const stationId = String(req.query.stationId || "").trim();

  if (!stationId) {
    return res.status(400).json({
      error: true,
      message: "stationId saknas"
    });
  }

  try {
    const url = `https://services.viva.sjofartsverket.se:8080/output/vivaoutputservice.svc/vivastation/${encodeURIComponent(stationId)}`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 viva-station"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: true,
        source: "VIVA",
        body: text
      });
    }

    const data = JSON.parse(text);
    const rawStation = data?.GetSingleStationResult || null;
    const samples = Array.isArray(rawStation?.Samples) ? rawStation.Samples : [];

    return res.status(200).json({
      station: {
        ID: rawStation?.ID ?? stationId,
        Name: rawStation?.Name || "Okänd station",
        Lat: Number(rawStation?.Lat),
        Lon: Number(rawStation?.Lon),
        Samples: samples
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
