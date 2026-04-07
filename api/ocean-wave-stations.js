export default async function handler(req, res) {
  try {
    const url =
      "https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/1.json";

    const response = await fetch(url, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
      }
    });

    const text = await response.text();

    if (!response.ok) {
      return res.status(response.status).json({
        error: true,
        source: "SMHI",
        body: text
      });
    }

    const data = JSON.parse(text);

    const stations = Array.isArray(data?.station)
      ? data.station
      : Array.isArray(data?.stations)
      ? data.stations
      : Array.isArray(data?.resource)
      ? data.resource
      : [];

    const cleaned = stations
      .map((station) => {
        const id = String(
          station.id ?? station.key ?? station.stationId ?? station.station ?? ""
        ).trim();

        const latitude = Number(
          station.latitude ??
          station.lat ??
          station.position?.latitude ??
          station.position?.lat
        );

        const longitude = Number(
          station.longitude ??
          station.lon ??
          station.position?.longitude ??
          station.position?.lon
        );

        if (!id || Number.isNaN(latitude) || Number.isNaN(longitude)) {
          return null;
        }

        return {
          id,
          name: station.name || "Okänd station",
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
