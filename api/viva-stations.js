export default async function handler(req, res) {
  try {
    const url = "https://services.viva.sjofartsverket.se:8080/output/vivaoutputservice.svc/vivastation";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 viva-stations"
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
    const stations = Array.isArray(data?.GetStationsResult?.Stations)
      ? data.GetStationsResult.Stations
      : [];

    const cleaned = stations
      .map((station) => {
        const id = String(station?.ID ?? "").trim();
        const latitude = Number(station?.Lat);
        const longitude = Number(station?.Lon);

        if (!id || Number.isNaN(latitude) || Number.isNaN(longitude)) {
          return null;
        }

        return {
          id,
          name: station?.Name || "Okänd station",
          latitude,
          longitude
        };
      })
      .filter(Boolean);

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=1800");
    return res.status(200).json({ stations: cleaned });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
