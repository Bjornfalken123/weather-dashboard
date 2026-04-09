const SMHI_RADAR_BASE =
  "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";

const SMHI_LATEST_RADAR = `${SMHI_RADAR_BASE}/latest.png`;

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

function pad(value) {
  return String(value).padStart(2, "0");
}

function toStockholmParts(date) {
  const formatter = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Stockholm",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });

  const parts = Object.fromEntries(
    formatter.formatToParts(date).map((part) => [part.type, part.value])
  );

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute
  };
}

function floorToFiveMinutes(date) {
  const d = new Date(date);
  d.setUTCSeconds(0, 0);
  d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5);
  return d;
}

function buildCandidateUrls(date) {
  const p = toStockholmParts(date);
  const hhmm = `${p.hour}${p.minute}`;

  return [
    `${SMHI_RADAR_BASE}/${p.year}/${p.month}/${p.day}/${hhmm}.png`,
    `${SMHI_RADAR_BASE}/${p.year}/${p.month}/${p.day}/${hhmm}/png`,
    `${SMHI_RADAR_BASE}/${p.year}/${p.month}/${p.day}/${hhmm}`,
    `${SMHI_RADAR_BASE}/${p.year}/${p.month}/${p.day}/${hhmm}.png?format=png`
  ];
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

async function fetchFrameForTime(date) {
  const urls = buildCandidateUrls(date);

  for (const url of urls) {
    try {
      const imageUrl = await fetchAsDataUrl(url);

      return {
        label: formatLabelSv(date),
        imageUrl,
        timestamp: date.toISOString()
      };
    } catch {
      // testa nästa kandidat-url
    }
  }

  return null;
}

export default async function handler(req, res) {
  try {
    const now = new Date();
    const latestRounded = floorToFiveMinutes(now);

    const frames = [];
    const wantedFrames = 8;

    for (let i = wantedFrames - 1; i >= 0; i--) {
      const candidateTime = new Date(latestRounded.getTime() - i * 5 * 60 * 1000);
      const frame = await fetchFrameForTime(candidateTime);

      if (frame) {
        frames.push(frame);
      }
    }

    if (!frames.length) {
      const latestImageUrl = await fetchAsDataUrl(SMHI_LATEST_RADAR);
      frames.push({
        label: formatLabelSv(now),
        imageUrl: latestImageUrl,
        timestamp: now.toISOString()
      });
    }

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      source: "SMHI",
      frames
    });
  } catch (error) {
    console.error("radar/frames error:", error);

    return res.status(500).json({
      message: "Det gick inte att hämta radarbild från SMHI",
      details: error?.message || "okänt fel"
    });
  }
}
