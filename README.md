# @mhaberler/track-parser

Turn a GPX, KML, KMZ, GeoJSON, or IGC file into a named GPS line. Each point has a latitude, a longitude, a height, and a time when the file has one.

```ts
import { parseTrackBytes } from "@mhaberler/track-parser";

const { tracks, warnings } = await parseTrackBytes(bytes, "flight.gpx");
```

`tracks` is a list of `{ name, sourceName, coords }`. A point is `{ lat, lon, z, t? }`. `z` is metres above mean sea level, or `null` when the file has no height. `t` is Unix milliseconds. It is set when the file has a per-point time, or when the parser can rebuild one.

`warnings` is a list of German sentences for the calling UI. An empty `tracks` list means nothing drawable was found; the reason is in `warnings`.

## Timed tracks

These keep a time on every point, or the parser can rebuild one.

- **GPX** keeps each `<time>`.
- **KML and KMZ** with `gx:Track` or `<when>` keep those timestamps. A KMZ is unzipped first; `doc.kml` wins when several KML files are inside. **Hot Air** stores the timed path as `gx:Track` and repeats it as untimed helper lines; the helper lines are dropped.
- **GeoJSON** keeps `coordTimes`, `times`, or `coordinateProperties.times`.
- **IGC** uses the B-record timestamps. Height is GPS altitude when it is present, otherwise pressure altitude. Invalid (`V`) fixes are dropped.
- **Ultramagic FlightPack** has no point times. The document description has a start clock and a sampling period. The parser treats that clock as local time at the first point and steps forward by the period.
- **Air Navigation Pro** has no point times. Departure and arrival placemark names are the endpoint instants. The parser stamps the track evenly between them and percent-decodes the track name.

## Hopeless for times

**Flytec Balloon KML** is a `LineString` with altitude and no per-point time. The only clocks are minute labels on placemarks (`Takeoff: 6:13`, `Landing: 7:35`, `Duration: 01:21 h`, and `at 7:00` on a marker). Those labels are UTC minutes. Takeoff is earlier than the first logged sample, the sampling period is absent, and the interval is not constant, so the points cannot be given faithful times. The matching IGC file has the real timestamps. Use that.

A GPX, KML, or GeoJSON line that simply has no timestamps stays untimed. The geometry is still returned.

Two fixes at the same latitude and longitude are collapsed. The later height and time are kept when the first fix omitted them. A real hover (same place, later time) stays. On a Flytec KML the landing hover collapses, because those points share a position and have no time to tell them apart.

## Install

```sh
bun add @mhaberler/track-parser
```

Until the package is on npm, a sibling checkout works:

```json
"@mhaberler/track-parser": "file:../track-parser"
```

Build the `dist` entry before that link is used: `bun run build`.

## Publish

npm ships `dist` and this readme. `dist` is not in git. `npm publish` runs `prepublishOnly`, which tests and builds first. `publishConfig.access` is `public`, so the scoped name needs no extra flag.

Log in as the owner of `@mhaberler`, bump `version` in `package.json`, then:

```sh
npm publish --dry-run
npm publish
```

## Develop

```sh
bun install
bun test
bun run example
```

`bun run example` serves `examples/leaflet` on port 5175: one file input and one polyline. Leaflet is an example dependency, not a dependency of the parser.
