import WebSocket from "ws";

export default async function handler(req, res) {
  const { bbox } = req.query;

  if (!bbox) {
    return res.status(400).json({ error: "bbox required" });
  }

  const [minLon, minLat, maxLon, maxLat] = String(bbox).split(",").map(Number);

  if ([minLon, minLat, maxLon, maxLat].some((v) => Number.isNaN(v))) {
    return res.status(400).json({ error: "invalid bbox" });
  }

  const API_KEY = process.env.AISSTREAM_API_KEY;

  if (!API_KEY) {
    return res.status(500).json({ error: "AISSTREAM_API_KEY missing" });
  }

  const vessels = new Map();
  let finished = false;

  function done(status, payload, ws, resolve) {
    if (finished) return;
    finished = true;
    try { if (ws) ws.close(); } catch (e) {}
    res.status(status).json(payload);
    resolve();
  }

  return new Promise((resolve) => {
    const ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

    ws.on("open", () => {
      ws.send(JSON.stringify({
        APIKey: API_KEY,
        BoundingBoxes: [[[minLat, minLon], [maxLat, maxLon]]],
        FilterMessageTypes: [
          "PositionReport",
          "StandardClassBPositionReport",
          "ExtendedClassBPositionReport"
        ]
      }));

      setTimeout(() => {
        done(200, { vessels: Array.from(vessels.values()) }, ws, resolve);
      }, 2200);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        const payload = msg && msg.Message ? msg.Message : null;
        if (!payload) return;

        const report =
          payload.PositionReport ||
          payload.StandardClassBPositionReport ||
          payload.ExtendedClassBPositionReport;

        if (!report) return;

        const mmsi = report.UserID || report.MMSI || null;
        const lat = report.Latitude;
        const lon = report.Longitude;

        if (lat == null || lon == null) return;

        vessels.set(String(mmsi || `${lat}:${lon}`), {
          mmsi: mmsi || null,
          lat,
          lon,
          cog: report.Cog || 0,
          sog: report.Sog || null,
          name: null
        });
      } catch (e) {}
    });

    ws.on("error", () => {
      done(200, { vessels: [] }, ws, resolve);
    });

    ws.on("close", () => {
      done(200, { vessels: Array.from(vessels.values()) }, null, resolve);
    });
  });
}
