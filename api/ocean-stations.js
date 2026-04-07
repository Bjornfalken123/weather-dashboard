export default async function handler(req, res) {
  try {
    const url = "https://opendata-download-ocobs.smhi.se/api/version/latest/parameter/6.json";

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

    res.setHeader("Cache-Control", "s-maxage=1800, stale-while-revalidate=1800");

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      error: true,
      message: error.message
    });
  }
}
