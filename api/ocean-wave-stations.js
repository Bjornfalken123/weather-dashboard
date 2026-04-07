export default async function handler(req, res) {
  try {
    const stationsUrl =
      "https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/1.json";
    const latestHourUrl =
      "https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/1/station-set/all/period/latest-hour/data.json";

    const [stationsRes, latestRes] = await Promise.all([
      fetch(stationsUrl, {
        headers: {
          "User-Agent": "weather-dashboard/1.0 bjorn.falkkenang@gmail.com"
        }
      }),
      fetch(latestHourUrl, {
        headers: {
          "User-Agent": "weather-dashboard/1.0 bjorn.falkkenang@gmail.com"
        }
      })
    ]);

    const stationsText = await stationsRes.text();
    const latestText = await latestRes.text();

    if (!stationsRes.ok) {
      return res.status(stationsRes.status).json({
        error: true,
        source: "SMHI stations",
        body: stationsText
      });
    }

    const stationsData = JSON.parse(stationsText);
    const allStations = Array.isArray(stationsData?.station)
      ? stationsData.station
      : Array.isArray(stationsData?.stations)
      ? stationsData.stations
      : Array.isArray(stationsData?.resource)
      ? stationsData.resource
      : [];

    let activeIds = new Set();

    if (latestRes.ok) {
      const latestData = JSON.parse(latestText);
      const values = Array.isArray(latestData?.value)
        ? latestData.value
        : Array.isArray(latestData?.values)
        ? latestData.values
        : [];

      activeIds = new Set(
        values
          .map((item) =>
            String(
              item.station ??
                item.stationId ??
                item.id ??
                item.key ??
                ""
            ).trim()
          )
          .filter(Boolean)
      );
    }

    const stations = allStations
      .map((station) => {
        const id = String(
          station.id ??
            station.key ??
            station.stationId ??
            station.station ??
            ""
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
          longitude,
          hasLatestData: activeIds.has(id)
        };
      })
      .filter(Boolean);

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=900");

    return res.status(200).json({
      stations
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
