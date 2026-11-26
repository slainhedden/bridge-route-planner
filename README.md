Low Bridge Route Check (local)

Run:  python3 -m http.server 8000   (from this folder), then open http://localhost:8000
Or just double-click index.html. All 9,925 low-clearance bridges are embedded in index.html.
Needs internet for map tiles (OpenStreetMap), routing (OSRM demo server) and address search (Nominatim).
To test on a phone on the same Wi-Fi: open http://<this-computer's-LAN-IP>:8000

make_planner.py inlines route_matching.js and the 2025 low-clearance GeoJSON into route_planner.template.html. To rebuild: `python3 make_planner.py --input /path/to/low_clearance.geojson --out index.html`.
Run matcher tests with `node --test test_route_matching.cjs`.
Caveats: car routes, not truck routing; highway bridges only (no rail overpasses); "flagged" = within the buffer of the route, verify on site.
Advanced settings default to a 3 in safety margin and a 100 ft route buffer. No matching records is not an all-clear.

The matcher uses the nearest OSRM step names and refs to compare the road on the bridge with the road below. If the road or level isn't clear, nearby records appear separately. Measurements below 8 ft on identifiable Interstate/US routes or below 6 ft elsewhere are suspect, not counted as conflicts. The restriction and documented crossing advisories cover selected corridors only and link to their sources. A car route with no advisory is not verified for trucks.

Enter feet and inches, decimal feet with the inches set to zero, or meters. Changing an endpoint, height, margin or buffer clears the screen; submit again to check the new input. Saved truck settings and the last five screen inputs are held only in the open tab. Use **Fit route** to return to the route overview after inspecting a conflict, and the inventory checkbox to show or hide nearby catalog points.
