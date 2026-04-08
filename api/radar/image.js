export default async function handler(req, res) {
  try {
    const rawUrl = req.query.url;

    if (!rawUrl || typeof rawUrl !== "string") {
      return res.status(400).send("Missing url");
    }

    const decodedUrl = decodeURIComponent(rawUrl);

    if (!decodedUrl.startsWith("https://opendata-download-radar.smhi.se/")) {
      return res.status(400).send("Invalid radar source");
    }

    const upstream = await fetch(decodedUrl, {
      headers: {
        "User-Agent": "KustvaderRadar/1.0"
      }
    });

    if (!upstream.ok) {
      return res.status(upstream.status).send("Radar image fetch failed");
    }

    const arrayBuffer = await upstream.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    res.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
    res.setHeader("Cache-Control", "public, max-age=120, s-maxage=120");
    return res.status(200).send(buffer);
  } catch (error) {
    console.error("radar/image error:", error);
    return res.status(500).send("Radar proxy failed");
  }
}
