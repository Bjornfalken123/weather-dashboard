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

  try {
    // SMHI metobs parameter 21 = Byvind
    // station-set/all + latest-hour = stationer som faktiskt har aktuell data
    const url =
      "https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/21/station-set/all/period/latest-hour/data.json";

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
    const values = Array.isArray(data?.value) ? data.value : [];

    if (!values.length) {
      return res.status(404).json({
        error: true,
        message: "Ingen byvindsdata hittades."
      });
    }

    // station-set/all/latest-hour brukar ge en rad per station med metadata i varje post
    const enriched = values
      .map((item) => {
        const stationLat = Number(item.latitude ?? data?.latitude);
        const stationLon = Number(item.longitude ?? data?.longitude);

        if (Number.isNaN(stationLat) || Number.isNaN(stationLon)) return null;

        return {
          stationName: item.stationName || item.name || "Okänd station",
          stationId: item.stationId || item.station || item.id || null,
          latitude: stationLat,
          longitude: stationLon,
          value: item.value,
          date: item.date,
          time: item.time,
          quality: item.quality,
          distanceKm: distanceKm(lat, lon, stationLat, stationLon)
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm);

    if (!enriched.length) {
      return res.status(404).json({
        error: true,
        message: "Kunde inte tolka stationernas positioner."
      });
    }

    // Strikt närhet först, för att undvika helt fel plats
    const nearestWithin50 = enriched.find((s) => s.distanceKm <= 50);
    const nearestWithin100 = enriched.find((s) => s.distanceKm <= 100);
    const nearest = nearestWithin50 || nearestWithin100 || enriched[0];

    return res.status(200).json({
      stationName: nearest.stationName,
      stationId: nearest.stationId,
      latitude: nearest.latitude,
      longitude: nearest.longitude,
      value: nearest.value,
      date: nearest.date,
      time: nearest.time,
      quality: nearest.quality,
      distanceKm: nearest.distanceKm,
      radiusRule: nearestWithin50 ? "50km" : nearestWithin100 ? "100km" : "fallback"
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
