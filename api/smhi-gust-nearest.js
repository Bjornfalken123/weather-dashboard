export default async function handler(req, res) {
  const lat = Number(req.query.lat);
  const lon = Number(req.query.lon);

  if (Number.isNaN(lat) || Number.isNaN(lon)) {
    return res.status(400).json({
      error: true,
      message: "lat och lon krävs"
    });
  }

  function toRad(deg) {
    return deg * Math.PI / 180;
  }

  function distanceKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) *
        Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function normalizeStationId(value) {
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
    const candidates = [
      item.latitude,
      item.lat,
      item.position?.latitude,
      item.position?.lat,
      item?.summary?.position?.latitude
    ];

    for (const value of candidates) {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
    return NaN;
  }

  function normalizeLon(item) {
    const candidates = [
      item.longitude,
      item.lon,
      item.position?.longitude,
      item.position?.lon,
      item?.summary?.position?.longitude
    ];

    for (const value of candidates) {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
    return NaN;
  }

  function extractStationArray(parameterJson) {
    if (Array.isArray(parameterJson?.station)) return parameterJson.station;
    if (Array.isArray(parameterJson?.stations)) return parameterJson.stations;
    if (Array.isArray(parameterJson?.resource)) return parameterJson.resource;
    return [];
  }

  function extractValueArray(latestJson) {
    if (Array.isArray(latestJson?.value)) return latestJson.value;
    if (Array.isArray(latestJson?.values)) return latestJson.values;
    return [];
  }

  function extractValueStationId(item) {
    return normalizeStationId(
      item.stationId ??
      item.station ??
      item.id ??
      item.key
    );
  }

  function extractStationMetaId(item) {
    return normalizeStationId(
      item.id ??
      item.key ??
      item.stationId ??
      item.station
    );
  }

  try {
    const parameterUrl =
      "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/21.json";

    const latestUrl =
      "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/21/station-set/all/period/latest-hour/data.json";

    const [parameterRes, latestRes] = await Promise.all([
      fetch(parameterUrl, {
        headers: {
          "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
        }
      }),
      fetch(latestUrl, {
        headers: {
          "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.comm"
        }
      })
    ]);

    const parameterText = await parameterRes.text();
    const latestText = await latestRes.text();

    if (!parameterRes.ok) {
      return res.status(parameterRes.status).json({
        error: true,
        source: "SMHI parameter",
        body: parameterText
      });
    }

    if (!latestRes.ok) {
      return res.status(latestRes.status).json({
        error: true,
        source: "SMHI latest-hour",
        body: latestText
      });
    }

    const parameterJson = JSON.parse(parameterText);
    const latestJson = JSON.parse(latestText);

    const stations = extractStationArray(parameterJson);
    const values = extractValueArray(latestJson);

    if (!stations.length) {
      return res.status(404).json({
        error: true,
        message: "Inga stationer hittades på parameternivån."
      });
    }

    if (!values.length) {
      return res.status(404).json({
        error: true,
        message: "Ingen aktuell byvindsdata hittades."
      });
    }

    const stationMap = new Map();

    for (const station of stations) {
      const stationId = extractStationMetaId(station);
      const stationLat = normalizeLat(station);
      const stationLon = normalizeLon(station);

      if (!stationId) continue;
      if (Number.isNaN(stationLat) || Number.isNaN(stationLon)) continue;

      stationMap.set(stationId, {
        stationId,
        stationName: normalizeName(station),
        latitude: stationLat,
        longitude: stationLon
      });
    }

    const joined = values
      .map((item) => {
        const stationId = extractValueStationId(item);
        if (!stationId) return null;

        const meta = stationMap.get(stationId);
        if (!meta) return null;

        return {
          stationId,
          stationName: meta.stationName,
          latitude: meta.latitude,
          longitude: meta.longitude,
          value: item.value,
          date: item.date,
          time: item.time,
          quality: item.quality,
          distanceKm: distanceKm(lat, lon, meta.latitude, meta.longitude)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (!joined.length) {
      return res.status(404).json({
        error: true,
        message: "Kunde inte matcha byvindsvärden med stationspositioner."
      });
    }

    const nearest = joined[0];

    return res.status(200).json({
      stationName: nearest.stationName,
      stationId: nearest.stationId,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      value: nearest.value,
      date: nearest.date,
      time: nearest.time,
      quality: nearest.quality,
      distanceKm: nearest.distanceKm
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
