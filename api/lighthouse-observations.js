const PARAMS = {
  temp: 1,
  windDir: 3,
  windSpeed: 4,
  pressure: 9,
  gust: 21
};

function extractLatest(data) {
  if (Array.isArray(data?.value) && data.value.length > 0) {
    return data.value[data.value.length - 1];
  }
  if (Array.isArray(data?.values) && data.values.length > 0) {
    return data.values[data.values.length - 1];
  }
  return null;
}

async function fetchLatestForParam(paramId, stationId, headers) {
  for (const period of ["latest-hour", "latest-day"]) {
    const url =
      `https://opendata-download-metobs.smhi.se/api/version/1.0/parameter/${paramId}` +
      `/station/${stationId}/period/${period}/data.json`;

    try {
      const response = await fetch(url, { headers });
      if (!response.ok) continue;

      const text = await response.text();
      const data = JSON.parse(text);
      const latest = extractLatest(data);

      if (latest && latest.value !== undefined && latest.value !== null && latest.value !== "") {
        return {
          value: latest.value,
          date: latest.date ?? null,
          time: latest.time ?? null,
          quality: latest.quality ?? null,
          period
        };
      }
    } catch {
      continue;
    }
  }

  return null;
}

export default async function handler(req, res) {
  const stationId = String(req.query.stationId || "").trim();

  if (!stationId) {
    return res.status(400).json({
      error: true,
      message: "stationId krävs"
    });
  }

  try {
    const headers = {
      "User-Agent": "weather-dashboard/1.0 bjorn.falkenang@gmail.com"
    };

    const [temp, windDir, windSpeed, pressure, gust] = await Promise.all([
      fetchLatestForParam(PARAMS.temp, stationId, headers),
      fetchLatestForParam(PARAMS.windDir, stationId, headers),
      fetchLatestForParam(PARAMS.windSpeed, stationId, headers),
      fetchLatestForParam(PARAMS.pressure, stationId, headers),
      fetchLatestForParam(PARAMS.gust, stationId, headers)
    ]);

    return res.status(200).json({
      stationId,
      observations: {
        temp,
        windDir,
        windSpeed,
        pressure,
        gust
      }
    });
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
