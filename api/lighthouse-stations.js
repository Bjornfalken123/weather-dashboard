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
      "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
    };

    const stationUrls = Object.values(PARAMS).map(
      (param) => `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${param}.json`
    );

    const latestHourUrls = Object.values(PARAMS).map(
      (param) =>
        `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${param}/station-set/all/period/latest-hour/data.json`
    );

    const responses = await Promise.all([
      ...stationUrls.map((url) => fetch(url, { headers })),
      ...latestHourUrls.map((url) => fetch(url, { headers }))
    ]);

    const texts = await Promise.all(responses.map((r) => r.text()));

    const stationTexts = texts.slice(0, stationUrls.length);
    const latestTexts = texts.slice(stationUrls.length);

    const stationMap = new Map();

    // Bygg stationslista från parameternivåer
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

        if (!stationMap.has(id)) {
          stationMap.set(id, {
            id,
            name: normalizeName(station),
            latitude: lat,
            longitude: lon,
            hasCurrentWind: false // används av UI, men betyder nu "har aktuell data"
          });
        }
      });
    });

    // Union av alla stationer som har latest-hour-data i minst en parameter
    const activeIds = new Set();

    latestTexts.forEach((text) => {
      try {
        const json = JSON.parse(text);
        const values = extractValues(json);

        values.forEach((item) => {
          const id = normalizeId(
            item.station ?? item.stationId ?? item.id ?? item.key
          );
          if (id) activeIds.add(id);
        });
      } catch {
        // ignorera felaktigt svar för en parameter
      }
    });

    for (const [id, station] of stationMap.entries()) {
      station.hasCurrentWind = activeIds.has(id);
      stationMap.set(id, station);
    }

    const stations = Array.from(stationMap.values()).sort((a, b) =>
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
