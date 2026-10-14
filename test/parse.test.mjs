import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lineCoords, tracksFromGeoJSON, parseTrackText, kmlFromKmz, parseTrackBytes } from "../src/parse.ts";

let failures = 0;
function check(name, cond, detail, { fatal = true } = {}) {
  console.log(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
  if (!cond && fatal) failures++;
}

const GPX = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>TestTrack</name>
    <trkseg>
      <trkpt lat="47.1" lon="11.1"><ele>1000</ele></trkpt>
      <trkpt lat="47.2" lon="11.2"><ele>1100</ele></trkpt>
      <trkpt lat="47.3" lon="11.3"><ele>1200</ele></trkpt>
    </trkseg>
  </trk>
</gpx>`;

const KML = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>KmlLine</name>
      <LineString>
        <coordinates>11.1,47.1,900 11.2,47.2,950 11.3,47.3,980</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;

{
  const c = lineCoords([[11.5, 47.5, 800], [11.6, 47.6], ["x", 1]]);
  check("lineCoords: 2 gültige Punkte", c.length === 2);
  check("lineCoords: z übernommen", c[0].z === 800);
  check("lineCoords: fehlendes z → null", c[1].z === null);
}

{
  const gj = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "A" },
        geometry: {
          type: "MultiLineString",
          coordinates: [
            [[10, 50], [11, 51]],
            [[12, 52, 700], [13, 53, 710]],
          ],
        },
      },
    ],
  };
  const { tracks, warnings } = tracksFromGeoJSON(gj, "multi.geojson");
  check("geojson: MultiLine → 2 Spuren", tracks.length === 2, `n=${tracks.length}`);
  check("geojson: Namen nummeriert", tracks[0].name.includes("(1)") && tracks[1].name.includes("(2)"));
  check("geojson: Höhe auf Teil 2", tracks[1].coords[0].z === 700);
  check("geojson: keine Warnung", warnings.length === 0);
}

{
  const gj = {
    type: "Feature",
    properties: {
      name: "TimedLine",
      coordTimes: ["2024-06-01T10:00:00Z", "2024-06-01T10:00:30Z"],
    },
    geometry: {
      type: "LineString",
      coordinates: [[11.1, 47.1, 800], [11.2, 47.2, 810]],
    },
  };
  const { tracks } = tracksFromGeoJSON(gj, "t.geojson");
  check("geojson: coordTimes", tracks[0]?.coords[0].t === Date.parse("2024-06-01T10:00:00Z"));
  check("geojson: coordTimes 2", tracks[0]?.coords[1].t === Date.parse("2024-06-01T10:00:30Z"));
}

{
  const { tracks } = await parseTrackText(GPX, "flight.gpx");
  check("gpx: eine Spur", tracks.length === 1, `n=${tracks.length}`);
  check("gpx: Name", tracks[0]?.name === "TestTrack", tracks[0]?.name);
  check("gpx: 3 Punkte mit ele", tracks[0]?.coords.length === 3 && tracks[0].coords[0].z === 1000);
}

{
  const GPX_TIME = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Timed</name>
    <trkseg>
      <trkpt lat="47.1" lon="11.1"><ele>1000</ele><time>2024-06-01T10:00:00Z</time></trkpt>
      <trkpt lat="47.2" lon="11.2"><ele>1100</ele><time>2024-06-01T10:01:00Z</time></trkpt>
      <trkpt lat="47.3" lon="11.3"><ele>1200</ele><time>2024-06-01T10:02:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
  const { tracks } = await parseTrackText(GPX_TIME, "timed.gpx");
  const ts = tracks[0]?.coords.map((c) => c.t);
  check("gpx: Zeiten übernommen", ts?.length === 3 && ts.every((t) => Number.isFinite(t)), String(ts));
  check("gpx: erste Zeit UTC", ts?.[0] === Date.parse("2024-06-01T10:00:00Z"));
  check("gpx: 60s Abstand", ts?.[1] - ts?.[0] === 60_000);
}

{
  const GPX_CLONE = `<?xml version="1.0"?>
<gpx version="1.1" creator="test">
  <trk><name>Clone</name>
    <trkseg>
      <trkpt lat="47.1" lon="11.1"><time>2024-06-01T10:00:00Z</time></trkpt>
      <trkpt lat="47.1" lon="11.1"><ele>1000</ele><time>2024-06-01T10:00:00Z</time></trkpt>
      <trkpt lat="47.2" lon="11.2"><ele>1100</ele><time>2024-06-01T10:01:00Z</time></trkpt>
      <trkpt lat="47.2" lon="11.2"><ele>1100</ele><time>2024-06-01T10:02:00Z</time></trkpt>
    </trkseg>
  </trk>
</gpx>`;
  const { tracks } = await parseTrackText(GPX_CLONE, "clone.gpx");
  const coords = tracks[0]?.coords;
  check("gpx: Klon entfernt", coords?.length === 3, `n=${coords?.length}`);
  check("gpx: Höhe vom Klon", coords?.[0].z === 1000, String(coords?.[0].z));
  check(
    "gpx: Stillstand bleibt",
    coords?.[1].lat === coords?.[2].lat && coords[2].t - coords[1].t === 60_000,
  );
}

{
  const { tracks } = await parseTrackText(KML, "line.kml");
  check("kml: eine Spur", tracks.length === 1, `n=${tracks.length}`);
  check("kml: Name", tracks[0]?.name === "KmlLine", tracks[0]?.name);
  check("kml: Höhe", tracks[0]?.coords[0].z === 900, String(tracks[0]?.coords[0].z));
  check("kml: ohne FlightPack keine Zeit", tracks[0]?.coords.every((c) => c.t == null));
}

{
  const FP = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <description>Track created by Ultramagic FlightPack - Starting at time 13_08_2026 06_29_23 -
      Sampling period is 3 seconds - Flight duration is 58 min</description>
    <Placemark>
      <name>FpLine</name>
      <LineString>
        <coordinates>
          15.63343,48.44636,319
          15.63342,48.44637,320
          15.63341,48.44638,321
        </coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  const { tracks, warnings } = await parseTrackText(FP, "fp.kml");
  const ts = tracks[0]?.coords.map((c) => c.t);
  const t0 = Date.parse("2026-08-13T04:29:23Z");
  check("flightpack: eine Spur", tracks.length === 1, `n=${tracks.length}`);
  check("flightpack: keine Warnung", warnings.length === 0, warnings.join("; "));
  check("flightpack: t0 CEST→UTC", ts?.[0] === t0, String(ts?.[0]));
  check("flightpack: 3s Raster", ts?.[1] - ts?.[0] === 3000 && ts?.[2] - ts?.[1] === 3000);
}

{
  const HOT = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
  <Document>
    <Placemark>
      <name>Flight Path</name>
      <description>Flight Path Recorded by the Hot Air app (iOS and Android)</description>
      <LineString>
        <coordinates>15.1,47.1,300 15.2,47.2,310</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>Balloon</name>
      <gx:Track>
        <when>2026-10-02T05:43:13.000Z</when>
        <when>2026-10-02T05:43:23.000Z</when>
        <when>2026-10-02T05:43:33.000Z</when>
        <gx:coord>15.1 47.1 300</gx:coord>
        <gx:coord>15.2 47.2 310</gx:coord>
        <gx:coord>15.3 47.3 320</gx:coord>
      </gx:Track>
    </Placemark>
  </Document>
</kml>`;
  const { tracks, warnings } = await parseTrackText(HOT, "hotair.kml");
  const t0 = Date.parse("2026-10-02T05:43:13.000Z");
  const t1 = Date.parse("2026-10-02T05:43:23.000Z");
  const t2 = Date.parse("2026-10-02T05:43:33.000Z");
  const ts = tracks[0]?.coords.map((c) => c.t);
  check("hotair: nur gx:Track", tracks.length === 1, `n=${tracks.length} ${tracks.map((d) => d.name).join(",")}`);
  check("hotair: Name Balloon", tracks[0]?.name === "Balloon", tracks[0]?.name);
  check("hotair: Punkte zeitgestempelt", ts?.[0] === t0 && ts?.[1] === t1 && ts?.[2] === t2, String(ts));
  check(
    "hotair: Hilfslinie verworfen",
    warnings.some((w) => /unzeitgestempelte Hilfslinie/i.test(w)),
    warnings.join("; "),
  );
}

{
  const ANP = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <description>Flight recorded by Air Navigation Pro for iPhone and iPad</description>
    <Placemark>
      <name>Departure 2026-10-01T15:13:30Z</name>
      <Point><coordinates>15.1,47.1,0</coordinates></Point>
    </Placemark>
    <Placemark>
      <name>2026-10-01T15%3A13%3A29Z</name>
      <LineString>
        <coordinates>15.1,47.1,294 15.2,47.2,300 15.3,47.3,280</coordinates>
      </LineString>
    </Placemark>
    <Placemark>
      <name>Arrival 2026-10-01T16:04:46Z</name>
      <Point><coordinates>15.3,47.3,0</coordinates></Point>
    </Placemark>
  </Document>
</kml>`;
  const { tracks, warnings } = await parseTrackText(ANP, "anp.kml");
  const t0 = Date.parse("2026-10-01T15:13:30Z");
  const t1 = Date.parse("2026-10-01T16:04:46Z");
  const mid = Math.round(t0 + (t1 - t0) / 2);
  const ts = tracks[0]?.coords.map((c) => c.t);
  check("anp: eine Spur", tracks.length === 1, `n=${tracks.length}`);
  check("anp: Name dekodiert", tracks[0]?.name === "2026-10-01T15:13:29Z", tracks[0]?.name);
  check("anp: Endpunkte", ts?.[0] === t0 && ts?.[2] === t1, String(ts));
  check("anp: Mittelpunkt", ts?.[1] === mid, String(ts?.[1]));
  check(
    "anp: Hinweis gleichmäßig",
    warnings.some((w) => /gleichmäßig zwischen Abflug und Ankunft/i.test(w)),
    warnings.join("; "),
  );
}

{
  const { tracks, warnings } = await parseTrackText('{"type":"Point","coordinates":[1,2]}', "p.geojson");
  check("point-only: keine Linien", tracks.length === 0);
  check("point-only: Warnung", warnings.length > 0);
}

{
  const { zipSync, strToU8 } = await import("fflate");
  const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>
    <Placemark>
      <name>KmzLine</name>
      <LineString>
        <coordinates>11.1,47.1,900 11.2,47.2,950 11.3,47.3,980</coordinates>
      </LineString>
    </Placemark>
  </Document>
</kml>`;
  const kmz = zipSync({ "doc.kml": strToU8(kml) });
  const extracted = await kmlFromKmz(kmz);
  check("kmz: doc.kml extrahiert", /KmzLine/.test(extracted.kmlText));
  const { tracks } = await parseTrackBytes(kmz, "flight.kmz");
  check("kmz: eine Spur", tracks.length === 1, `n=${tracks.length}`);
  check("kmz: Name", tracks[0]?.name === "KmzLine", tracks[0]?.name);
  check("kmz: Höhe", tracks[0]?.coords[0].z === 900, String(tracks[0]?.coords[0].z));
}

const IGC_HAPPY = [
  "AXXXABC",
  "HFDTE150717",
  "HFPLTPILOTINCHARGE:Test Pilot",
  "HFGIDGLIDERID:D-TEST",
  "B1026555103888N00703115EA0065700751",
  "B1026565103890N00703120EA0065800752",
  "B1026575103892N00703125EA0065900753",
].join("\n");

{
  const { tracks, warnings } = await parseTrackText(IGC_HAPPY, "flight.igc");
  check("igc: eine Spur", tracks.length === 1, `n=${tracks.length}`);
  check("igc: Name aus GID", tracks[0]?.name === "D-TEST", tracks[0]?.name);
  check("igc: 3 Punkte", tracks[0]?.coords.length === 3);
  check("igc: GPS-Höhe", tracks[0]?.coords[0].z === 751, String(tracks[0]?.coords[0].z));
  check("igc: t in ms", tracks[0]?.coords[0].t === Date.parse("2017-07-15T10:26:55Z"));
  check("igc: 1s Abstand", tracks[0]?.coords[1].t - tracks[0]?.coords[0].t === 1000);
  check("igc: sniff ohne Extra-Warnung", warnings.length === 0, warnings.join("; "));
}

{
  const igc = [
    "AXXXABC",
    "HFDTE150717",
    "B1026555103888N00703115EA0065700751",
    "B1026565103890N00703120EV0065800752",
    "B1026575103892N00703125EA0065900753",
  ].join("\n");
  const { tracks, warnings } = await parseTrackText(igc, "dropv.igc");
  check("igc V: 2 gültige Punkte", tracks[0]?.coords.length === 2);
  check("igc V: Warnung", warnings.some((w) => /ungültige GPS-Fixes/i.test(w)), warnings.join("; "));
  check("igc V: GPS-Höhen der A-Fixes", tracks[0]?.coords[0].z === 751 && tracks[0]?.coords[1].z === 753);
}

{
  const igc = [
    "AXXXABC",
    "HFDTE150717",
    "B1026555103888N00703115EA0065700000",
    "B1026565103890N00703120EA0065800000",
  ].join("\n");
  const { tracks } = await parseTrackText(igc, "press.igc");
  check("igc GPS00000: Druckhöhe", tracks[0]?.coords[0].z === 657 && tracks[0]?.coords[1].z === 658);
}

{
  const igc = [
    "AXXXABC",
    "HFDTE150717",
    "B2359005103888N00703115EA0065700751",
    "B0000015103890N00703120EA0065800752",
  ].join("\n");
  const { tracks } = await parseTrackText(igc, "wrap.igc");
  const t0 = tracks[0]?.coords[0].t;
  const t1 = tracks[0]?.coords[1].t;
  check("igc midnight: erster Tag", t0 === Date.parse("2017-07-15T23:59:00Z"));
  check("igc midnight: +1 Tag", t1 === Date.parse("2017-07-16T00:00:01Z"), String(t1));
}

{
  const igc = [
    "AXXXABC",
    "HFDTE150717",
    "B1026555103888N00703115EV0065700751",
    "B1026565103890N00703120EV0065800752",
  ].join("\n");
  const { tracks, warnings } = await parseTrackText(igc, "allv.igc");
  check("igc all-V: keine Spur", tracks.length === 0);
  check("igc all-V: Warnung Linien", warnings.some((w) => /Keine Linienzüge/i.test(w)), warnings.join("; "));
}

{
  const { tracks, warnings } = await parseTrackText(
    '{"type":"Point","coordinates":[1,2]}',
    "n.igc",
  );
  check("igc Dateiname: nicht als GeoJSON", tracks.length === 0);
  check(
    "igc Dateiname: IGC-Fehler",
    warnings.some((w) => /IGC-Parsefehler/i.test(w)),
    warnings.join("; "),
  );
}

{
  const { tracks } = await parseTrackText(IGC_HAPPY, "unnamed.txt");
  check("igc sniff ohne .igc", tracks.length === 1 && tracks[0]?.coords.length === 3);
}

{
  const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), "fixtures/igc");
  const files = (await readdir(fixtureDir)).filter((f) => f.toLowerCase().endsWith(".igc")).sort();
  check("igc fixtures: Dateien vorhanden", files.length >= 12, `n=${files.length}`);
  for (const f of files) {
    const text = await readFile(join(fixtureDir, f), "utf8");
    const { tracks, warnings } = await parseTrackText(text, f);
    const n = tracks[0]?.coords?.length ?? 0;
    const c0 = tracks[0]?.coords?.[0];
    check(
      `igc fixture ${f}: Spur mit ≥2 Punkten`,
      tracks.length === 1 && n >= 2,
      `tracks=${tracks.length} pts=${n} ${warnings[0] || ""}`,
    );
    check(
      `igc fixture ${f}: lat/lon/t`,
      Number.isFinite(c0?.lat) && Number.isFinite(c0?.lon) && Number.isFinite(c0?.t),
      `lat=${c0?.lat} lon=${c0?.lon} t=${c0?.t}`,
    );
  }
}


{
  const sampleDir = join(dirname(fileURLToPath(import.meta.url)), "..", "samples");
  const files = (await readdir(sampleDir))
    .filter((f) => /\.(gpx|kml|kmz|igc|geojson)$/i.test(f))
    .sort();
  check("samples: vier Flüge", files.length === 4, files.join(", "), { fatal: false });
  for (const f of files) {
    const buf = await readFile(join(sampleDir, f));
    const { tracks, warnings } = await parseTrackBytes(buf, f);
    const coords = tracks[0]?.coords || [];
    const timed = coords.filter((c) => Number.isFinite(c.t)).length;
    check(
      `sample ${f}: Spur`,
      tracks.length >= 1 && coords.length >= 2,
      `tracks=${tracks.length} pts=${coords.length} ${warnings[0] || ""}`,
    );
    check(
      `sample ${f}: Zeiten`,
      timed >= 2,
      `timed=${timed}/${coords.length}`,
    );
  }
}

console.log(failures ? `\n${failures} Fehler.` : "\nAlle Parser-Tests bestanden.");
process.exit(failures ? 1 : 0);
