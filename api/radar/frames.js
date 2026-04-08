const SMHI_RADAR_ROOT =
  "https://opendata-download-radar.smhi.se/api/version/latest/area/sweden/product/comp";

function pad2(value) {
  return String(value).padStart(2, "0");
}

function buildDayUrl(date) {
  const year = date.getUTCFullYear();
  const month = pad2(date.getUTCMonth() + 1);
  const day = pad2(date.getUTCDate());
  return `${SMHI_RADAR_ROOT}/${year}/${month}/${day}`;
}

function makeAbsoluteUrl(baseUrl, maybeRelative) {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function uniqBy(arr, keyFn) {
  const seen = new Set();
  const out = [];

  for (const item of arr) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }

  return out;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "KustvaderRadar/1.0"
    }
  });

  if (!res.ok) {
    throw new Error(`Fetch failed ${res.status} for ${url}`);
  }

  return await res.text();
}

function extractLinksFromJson(json, baseUrl) {
  const results = [];

  function walk(node) {
    if (!node) return;

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    if (typeof node !== "object") return;

    const possibleLink =
      node.link ||
      node.href ||
      node.url ||
      node.path ||
      null;

    const possibleKey =
      node.key ||
      node.name ||
      node.id ||
      null;

    if (possibleLink) {
      const absolute = makeAbsoluteUrl(baseUrl, possibleLink);
      if (absolute) {
        results.push({
          key: possibleKey || absolute.split("/").pop(),
          link: absolute
        });
      }
    }

    for (const value of Object.values(node)) {
      walk(value);
    }
  }

  walk(json);
  return results;
}

function extractLinksFromHtml(html, baseUrl) {
  const results = [];
  const hrefRegex = /href=["']([^"']+)["']/gi;
  let match;

  while ((match = hrefRegex.exec(html)) !== null) {
    const href = match[1];
    if (!href || href.startsWith("#")) continue;

    const absolute = makeAbsoluteUrl(baseUrl, href);
    if (!absolute) continue;

    results.push({
      key: absolute.split("/").pop(),
      link: absolute
    });
  }

  return results;
}

async function listCollectionLinks(url) {
  const text = await fetchText(url);

  try {
    const json = JSON.parse(text);
    const links = extractLinksFromJson(json, url);
    if (links.length) return uniqBy(links, (x) => x.link);
  } catch {}

  const htmlLinks = extractLinksFromHtml(text, url);
  return uniqBy(htmlLinks, (x) => x.link);
}

function isPngUrl(url) {
  return /\.png($|\?)/i.test(url);
}

function extractTimestampFromUrl(url) {
  const name = url.split("/").pop() || "";

  const patterns = [
    /(\d{4})(\d{2})(\d{2})[_-]?(\d{2})(\d{2})(\d{2})?/,
    /(\d{4})-(\d{2})-(\d{2})[_T-](\d{2})[:\-]?(\d{2})(?:[:\-]?(\d{2}))?/
  ];

  for (const pattern of patterns) {
    const match = name.match(pattern);
    if (!match) continue;

    const [, y, m, d, hh, mm, ss] = match;
    const iso = `${y}-${m}-${d}T${hh}:${mm}:${ss || "00"}Z`;
    const date = new Date(iso);

    if (!Number.isNaN(date.getTime())) {
      return date;
    }
  }

  return null;
}

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

async function collectPngsForDay(dayUrl) {
  let links = [];

  try {
    links = await listCollectionLinks(dayUrl);
  } catch {
    return [];
  }

  const pngs = links
    .map((item) => item.link)
    .filter(isPngUrl)
    .filter((url) => !/latest\.png/i.test(url));

  return uniqBy(pngs, (x) => x);
}

export default async function handler(req, res) {
  try {
    const framesRequested = Math.max(
      1,
      Math.min(36, Number(req.query.limit || 18))
    );

    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    const candidateDayUrls = [
      buildDayUrl(now),
      buildDayUrl(yesterday)
    ];

    let allPngs = [];

    for (const dayUrl of candidateDayUrls) {
      const dayPngs = await collectPngsForDay(dayUrl);
      allPngs.push(...dayPngs);
    }

    allPngs = uniqBy(allPngs, (x) => x);

    const dated = allPngs
      .map((url) => ({
        url,
        date: extractTimestampFromUrl(url)
      }))
      .filter((item) => item.date instanceof Date);

    dated.sort((a, b) => a.date - b.date);

    let recentFrames = dated.slice(-framesRequested).map((item) => ({
      label: formatLabelSv(item.date),
      imageUrl: `/api/radar/image?url=${encodeURIComponent(item.url)}`,
      sourceUrl: item.url,
      timestamp: item.date.toISOString()
    }));

    if (!recentFrames.length) {
      const latestSource = `${SMHI_RADAR_ROOT}/latest.png`;
      const fallbackDate = new Date();

      recentFrames = [
        {
          label: formatLabelSv(fallbackDate),
          imageUrl: `/api/radar/image?url=${encodeURIComponent(latestSource)}`,
          sourceUrl: latestSource,
          timestamp: fallbackDate.toISOString()
        }
      ];
    }

    res.setHeader("Cache-Control", "no-store");

    return res.status(200).json({
      source: "SMHI",
      frames: recentFrames
    });
  } catch (error) {
    console.error("radar/frames error:", error);

    return res.status(500).json({
      message: "Det gick inte att hämta radarbilder från SMHI",
      details: error?.message || "okänt fel"
    });
  }
}
