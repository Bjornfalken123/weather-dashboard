const PARAMS = {
  temp: 1,
  windDir: 3,
  windSpeed: 4,
  pressure: 9,
  gust: 21
};

function normalizeId(value) {
  if (value === null || value === undefined) return null;
  return String(value).trim();
}

function normalizeName(item) {
  return (
    item.name ||
    item.stationName ||
    item.station_name ||
    item.title ||
    "Okänd station"
  );
}

function normalizeLat(item) {
  const values = [
    item.latitude,
    item.lat,
    item.position?.latitude,
    item.position?.lat,
    item.summary?.position?.latitude
  ];
  for (const v of values) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

function normalizeLon(item) {
  const values = [
    item.longitude,
    item.lon,
    item.position?.longitude,
    item.position?.lon,
    item.summary?.position?.longitude
  ];
  for (const v of values) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return NaN;
}

function extractStations(data) {
  if (Array.isArray(data?.station)) return data.station;
  if (Array.isArray(data?.stations)) return data.stations;
  if (Array.isArray(data?.resource)) return data.resource;
  return [];
}

function extractValues(data) {
  if (Array.isArray(data?.value)) return data.value;
  if (Array.isArray(data?.values)) return data.values;
  return [];
}

export default async function handler(req, res) {
  try {
    const headers = {
      "User-Agent": "weather-dashboard/1.0 dinmail@example.com"
    };

    const stationUrls = Object.values(PARAMS).map(
      (param) => `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${param}.json`
    );

    const activeWindUrl =
      `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${PARAMS.windSpeed}/station-set/all/period/latest-hour/data.json`;

    const responses = await Promise.all([
      ...stationUrls.map((url) => fetch(url, { headers })),
      fetch(activeWindUrl, { headers })
    ]);

    const texts = await Promise.all(responses.map((r) => r.text()));

    const stationTexts = texts.slice(0, stationUrls.length);
    const activeWindText = texts[texts.length - 1];

    const stationMaps = new Map();

    stationTexts.forEach((text) => {
      const json = JSON.parse(text);
      const stations = extractStations(json);

      stations.forEach((station) => {
        const id = normalizeId(
          station.id ?? station.key ?? station.stationId ?? station.station
        );
        const lat = normalizeLat(station);
        const lon = normalizeLon(station);

        if (!id || Number.isNaN(lat) || Number.isNaN(lon)) return;

        if (!stationMaps.has(id)) {
          stationMaps.set(id, {
            id,
            name: normalizeName(station),
            latitude: lat,
            longitude: lon,
            hasCurrentWind: false
          });
        }
      });
    });

    try {
      const activeWindJson = JSON.parse(activeWindText);
      const activeWindValues = extractValues(activeWindJson);

      const activeIds = new Set(
        activeWindValues
          .map((item) => normalizeId(item.station ?? item.stationId ?? item.id ?? item.key))
          .filter(Boolean)
      );

      for (const [id, station] of stationMaps.entries()) {
        station.hasCurrentWind = activeIds.has(id);
        stationMaps.set(id, station);
      }
    } catch {
      // lämna hasCurrentWind som false
    }

    const stations = Array.from(stationMaps.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "sv")
    );

    res.setHeader("Cache-Control", "s-maxage=900, stale-while-revalidate=900");
    return res.status(200).json({ stations });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
