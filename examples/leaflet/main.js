import L from "leaflet";
import { parseTrackBytes } from "../../src/index.ts";

const map = L.map("map").setView([47.3, 11.4], 8);
L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap",
}).addTo(map);

const status = document.getElementById("status");
let line = null;

document.getElementById("file").addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;
  const { tracks, warnings } = await parseTrackBytes(await file.arrayBuffer(), file.name);
  const track = tracks[0];
  if (line) map.removeLayer(line);
  if (!track) {
    status.textContent = warnings[0] || "No track.";
    return;
  }
  line = L.polyline(track.coords.map((c) => [c.lat, c.lon]), { color: "#174e94" }).addTo(map);
  map.fitBounds(line.getBounds(), { padding: [24, 24] });
  const timed = track.coords.filter((c) => c.t != null).length;
  status.textContent = `${track.name}: ${track.coords.length} points, ${timed} with time.`;
});
