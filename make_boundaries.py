"""Build the planner's approximate Canada/Mexico boundary data."""

import json
from pathlib import Path
from urllib.request import urlopen


SOURCE = ("https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/"
          "geojson/ne_10m_admin_0_countries.geojson")


def simplify(points):
    start, end = points[0], points[-1]
    dx, dy = end[0] - start[0], end[1] - start[1]
    length = dx * dx + dy * dy
    best = 0.002 ** 2
    split = None
    for i, (x, y) in enumerate(points[1:-1], 1):
        x, y = x - start[0], y - start[1]
        t = min(1, max(0, (x * dx + y * dy) / length)) if length else 0
        distance = (x - t * dx) ** 2 + (y - t * dy) ** 2
        if distance > best:
            best, split = distance, i
    if split is None:
        return [start, end]
    return simplify(points[:split + 1])[:-1] + simplify(points[split:])


def main():
    with urlopen(SOURCE, timeout=30) as response:
        source = json.load(response)
    countries = {}
    for feature in source["features"]:
        name = feature["properties"]["ADMIN"]
        if name not in {"Canada", "Mexico"}:
            continue
        countries[name] = [
            rings for polygon in feature["geometry"]["coordinates"]
            if (rings := [
                [[round(value, 4) for value in point] for point in ring]
                for source_ring in polygon if len(ring := simplify(source_ring)) >= 4
            ])
        ]
    output = Path(__file__).with_name("route_boundaries.json")
    output.write_text(json.dumps(countries, separators=(",", ":")) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
