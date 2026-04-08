const SMHI_LATEST_RADAR =
  "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp/latest.png";

function formatLabelSv(date) {
  return new Intl.DateTimeFormat("sv-SE", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Stockholm"
  }).format(date).replace(".", "");
}

export default async function handler(req, res) {
  try {
    const upstream = await fetch(SMHI_LATEST_RADAR, {
      headers: {
        "User-Agent": "KustvaderRadar/1.0"
      }
    });

    if (!upstream.ok) {
      throw new Error(`SMHI radar returned ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || "image/png";
    const arrayBuffer = await upstream.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${contentType};base64,${base64}`;

    const now = new Date();

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      source: "SMHI",
      frames: [
        {
          label: formatLabelSv(now),
          imageUrl: dataUrl,
          timestamp: now.toISOString()
        }
      ]
    });
  } catch (error) {
    console.error("radar/frames error:", error);

    return res.status(500).json({
      message: "Det gick inte att hämta radarbild från SMHI",
      details: error?.message || "okänt fel"
    });
  }
}
