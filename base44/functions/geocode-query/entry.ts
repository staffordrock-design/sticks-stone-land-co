// Official US Census Geocoder — free, no API key, no scraping.
// https://geocoding.geo.census.gov/geocoder/
export default async function (req) {
  try {
    const body = await req.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    if (!query) {
      return Response.json({ error: "query required" }, { status: 400 });
    }

    const params = new URLSearchParams({
      address: query,
      benchmark: "Public_AR_Current",
      format: "json",
    });

    const response = await fetch(
      `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?${params}`
    );
    if (!response.ok) {
      return Response.json(
        { error: `Census geocoder returned ${response.status}` },
        { status: 502 }
      );
    }

    const data = await response.json();
    const matches = data?.result?.addressMatches || [];
    if (!matches.length) {
      return Response.json({ matches: [], message: "No address match found" });
    }

    const results = matches.slice(0, 5).map((m) => ({
      matched_address: m.matchedAddress,
      lat: m.coordinates?.y,
      lng: m.coordinates?.x,
      county: m.addressComponents?.county,
      state: m.addressComponents?.state,
      city: m.addressComponents?.city,
      zip: m.addressComponents?.zip,
    }));

    return Response.json({ matches: results });
  } catch (error) {
    console.error("geocode-query error:", error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}