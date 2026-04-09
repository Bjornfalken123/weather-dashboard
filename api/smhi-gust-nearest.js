const SMHI_RADAR_DOWNLOAD_API =
  "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";

const SMHI_LATEST_RADAR = `${SMHI_RADAR_DOWNLOAD_API}/latest.png`;

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

function safeDate(value) {
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

async function fetchAsDataUrl(url) {
  const upstream = await fetch(url, {
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

  return `data:${contentType};base64,${base64}`;
}

export default async function handler(req, res) {
  try {
    const now = new Date();
    const imageUrl = await fetchAsDataUrl(SMHI_LATEST_RADAR);

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      source: "SMHI",
      frames: [
        {
          label: formatLabelSv(now),
          imageUrl,
          timestamp: now.toISOString()
        }
      ],
      debug: {
        frameCount: 1,
        usedFallback: false,
        source: "latest_radar_image",
        metadataUrl: SMHI_LATEST_RADAR
      }
    });
  } catch (error) {
    console.error("smhi-gust-nearest reused as radar error:", error);

    return res.status(500).json({
      message: "Det gick inte att hämta radarbild från SMHI",
      details: error?.message || "okänt fel"
    });
  }
}
