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

  function normalizeId(value) {
    if (value === null || value === undefined) return null;
    return String(value).trim();
  }

  function normalizeLat(item) {
    const candidates = [
      item.latitude,
      item.lat,
      item.position?.latitude,
      item.position?.lat,
      item.summary?.position?.latitude
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
      item.summary?.position?.longitude
    ];

    for (const value of candidates) {
      const n = Number(value);
      if (!Number.isNaN(n)) return n;
    }
    return NaN;
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

  function extractStationArray(parameterJson) {
    if (Array.isArray(parameterJson?.station)) return parameterJson.station;
    if (Array.isArray(parameterJson?.stations)) return parameterJson.stations;
    if (Array.isArray(parameterJson?.resource)) return parameterJson.resource;
    return [];
  }

  function extractLatestValue(dataJson) {
    if (Array.isArray(dataJson?.value) && dataJson.value.length > 0) {
      return dataJson.value[dataJson.value.length - 1];
    }
    if (Array.isArray(dataJson?.values) && dataJson.values.length > 0) {
      return dataJson.values[dataJson.values.length - 1];
    }
    return null;
  }

  try {
    // SMHI metobs parameter 21 = Byvind
    const parameterUrl =
      "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/21.json";

    const parameterRes = await fetch(parameterUrl, {
      headers: {
        "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
      }
    });

    const parameterText = await parameterRes.text();

    if (!parameterRes.ok) {
      return res.status(parameterRes.status).json({
        error: true,
        source: "SMHI parameter",
        body: parameterText
      });
    }

    const parameterJson = JSON.parse(parameterText);
    const stations = extractStationArray(parameterJson);

    if (!stations.length) {
      return res.status(404).json({
        error: true,
        message: "Inga byvindsstationer hittades på parameternivån."
      });
    }

    const rankedStations = stations
      .map((station) => {
        const stationId = normalizeId(
          station.id ?? station.key ?? station.stationId ?? station.station
        );
        const stationLat = normalizeLat(station);
        const stationLon = normalizeLon(station);

        if (!stationId) return null;
        if (Number.isNaN(stationLat) || Number.isNaN(stationLon)) return null;

        return {
          stationId,
          stationName: normalizeName(station),
          latitude: stationLat,
          longitude: stationLon,
          distanceKm: distanceKm(lat, lon, stationLat, stationLon)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (!rankedStations.length) {
      return res.status(404).json({
        error: true,
        message: "Kunde inte läsa stationernas positioner."
      });
    }

    // Prova de närmaste stationerna en och en
    const candidates = rankedStations.slice(0, 20);

    for (const station of candidates) {
      const dataUrl =
        `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/21/station/${station.stationId}/period/latest-hour/data.json`;

      try {
        const dataRes = await fetch(dataUrl, {
          headers: {
            "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
          }
        });

        if (!dataRes.ok) {
          continue;
        }

        const dataText = await dataRes.text();
        const dataJson = JSON.parse(dataText);
        const latest = extractLatestValue(dataJson);

        if (!latest) {
          continue;
        }

        if (latest.value === null || latest.value === undefined || latest.value === "") {
          continue;
        }

        return res.status(200).json({
          stationName: station.stationName,
          stationId: station.stationId,
          latitude: station.latitude,
          longitude: station.longitude,
          value: latest.value,
          date: latest.date ?? null,
          time: latest.time ?? null,
          quality: latest.quality ?? null,
          distanceKm: station.distanceKm
        });
      } catch {
        continue;
      }
    }

    return res.status(404).json({
      error: true,
      message: "Ingen närliggande station med byvind senaste timmen hittades."
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
