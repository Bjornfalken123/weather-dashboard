
import WebSocket from "ws";

export default async function handler(req, res) {
  const { bbox } = req.query;

  if (!bbox) {
    return res.status(400).json({ error: "bbox required" });
  }

  const [minLon, minLat, maxLon, maxLat] = bbox.split(",").map(Number);

  const API_KEY = process.env.AISSTREAM_API_KEY;

  const vessels = new Map();

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

      // samla data i 2 sek
      setTimeout(() => {
        ws.close();
      }, 2000);
    });

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data);
        const report = msg.Message?.PositionReport;

        if (!report) return;

        const mmsi = report.UserID;

        vessels.set(mmsi, {
          mmsi,
          lat: report.Latitude,
          lon: report.Longitude,
          cog: report.Cog,
          sog: report.Sog
        });

      } catch (e) {}
    });

    ws.on("close", () => {
      res.status(200).json({
        vessels: Array.from(vessels.values())
      });
      resolve();
    });

    ws.on("error", () => {
      res.status(500).json({ vessels: [] });
      resolve();
    });
  });
}
