const SMHI_RADAR_DOWNLOAD_API =
  "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";

const SMHI_RADAR_METADATA_API =
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

function buildLabelFromEntry(entry, index) {
  const date =
    safeDate(entry?.updated) ||
    safeDate(entry?.timestamp) ||
    safeDate(entry?.validTime) ||
    safeDate(entry?.date);

  if (date) {
    return formatLabelSv(date);
  }

  return `Bild ${index + 1}`;
}

function collectPngEntries(node, results = []) {
  if (!node) return results;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectPngEntries(item, results);
    }
    return results;
  }

  if (typeof node !== "object") {
    return results;
  }

  const link = typeof node.link === "string" ? node.link : null;
  const key = typeof node.key === "string" ? node.key : null;

  if (link && (link.includes(".png") || key === "png")) {
    results.push({
      link,
      updated: node.updated || null,
      timestamp: node.timestamp || null,
      validTime: node.validTime || null,
      date: node.date || null
    });
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectPngEntries(value, results);
    }
  }

  return results;
}

function dedupeEntries(entries) {
  const seen = new Set();
  const out = [];

  for (const entry of entries) {
    if (!entry?.link) continue;
    if (seen.has(entry.link)) continue;
    seen.add(entry.link);
    out.push(entry);
  }

  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "KustvaderRadar/1.0",
      "Accept": "application/json"
    }
  });

  if (!res.ok) {
    throw new Error(`SMHI json returned ${res.status}`);
  }

  const text = await res.text();

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Expected JSON but got: ${text.slice(0, 120)}`);
  }
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

function normalizeDownloadUrl(url) {
  if (!url || typeof url !== "string") return null;

  if (url.startsWith("http://") || url.startsWith("https://")) {
    return url.replace("https://opendata.smhi.se/radar", "https://opendata-download-radar.smhi.se");
  }

  if (url.startsWith("/")) {
    return `https://opendata-download-radar.smhi.se${url}`;
  }

  return null;
}

function collectPngLinksFromMetadata(node, results = []) {
  if (!node) return results;

  if (Array.isArray(node)) {
    for (const item of node) {
      collectPngLinksFromMetadata(item, results);
    }
    return results;
  }

  if (typeof node !== "object") return results;

   const link = normalizeDownloadUrl(node.link || node.href || node.url || null);
  const key = typeof node.key === "string" ? node.key : null;
  const type = typeof node.type === "string" ? node.type : "";

  const looksLikePng =
    (link && link.toLowerCase().includes(".png")) ||
    key === "png" ||
    type.toLowerCase() === "image/png";

  if (looksLikePng && link) {
    results.push({
      link,
      updated: node.updated || null,
      timestamp: node.timestamp || null,
      validTime: node.validTime || null,
      date: node.date || null
    });
  }

  for (const value of Object.values(node)) {
    if (value && typeof value === "object") {
      collectPngLinksFromMetadata(value, results);
    }
  }

  return results;
}

async function fetchFramesFromMetadata() {
  const metadataJson = await fetchJson(SMHI_RADAR_METADATA_API);

  const allEntries = dedupeEntries(collectPngLinksFromMetadata(metadataJson));
  if (!allEntries.length) {
    return [];
  }

  const sorted = allEntries.sort((a, b) => {
    const aTime =
      safeDate(a.updated)?.getTime() ||
      safeDate(a.timestamp)?.getTime() ||
      safeDate(a.validTime)?.getTime() ||
      safeDate(a.date)?.getTime() ||
      0;

    const bTime =
      safeDate(b.updated)?.getTime() ||
      safeDate(b.timestamp)?.getTime() ||
      safeDate(b.validTime)?.getTime() ||
      safeDate(b.date)?.getTime() ||
      0;

    return aTime - bTime;
  });

  const latestEight = sorted.slice(-8);

  const frames = [];
  for (let i = 0; i < latestEight.length; i++) {
    const entry = latestEight[i];

    try {
      const imageUrl = await fetchAsDataUrl(entry.link);
      frames.push({
        label: buildLabelFromEntry(entry, i),
        imageUrl,
        timestamp:
          entry.updated ||
          entry.timestamp ||
          entry.validTime ||
          entry.date ||
          null
      });
    } catch {
      // hoppa över trasig frame
    }
  }

  return frames;
}

export default async function handler(req, res) {
  try {
       let frames = [];
    let debugSource = "metadata_api";
    let usedFallback = false;

    try {
      frames = await fetchFramesFromMetadata();
    } catch (error) {
      debugSource = `metadata_api_failed: ${error?.message || "unknown"}`;
      frames = [];
    }

    if (!frames.length) {
      usedFallback = true;
      const now = new Date();
      const latestImageUrl = await fetchAsDataUrl(SMHI_LATEST_RADAR);

      frames = [
        {
          label: formatLabelSv(now),
          imageUrl: latestImageUrl,
          timestamp: now.toISOString()
        }
      ];
    }

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      source: "SMHI",
      frames,
            debug: {
        frameCount: frames.length,
        usedFallback,
        source: debugSource,
        metadataUrl: SMHI_RADAR_METADATA_API
      }
    });
  } catch (error) {
    console.error("radar/frames error:", error);

    return res.status(500).json({
      message: "Det gick inte att hämta radarbild från SMHI",
      details: error?.message || "okänt fel"
    });
  }
}
