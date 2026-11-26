#!/usr/bin/env python3
import argparse
import json
from pathlib import Path


HERE = Path(__file__).resolve().parent


def main():
    parser = argparse.ArgumentParser(description="Inline the 2025 low-clearance points into the planner.")
    parser.add_argument("--input", type=Path, default=HERE / "output/low_clearance.geojson")
    parser.add_argument("--out", type=Path, default=HERE / "route_planner.html")
    args = parser.parse_args()
    data = json.loads(args.input.read_text(encoding="utf-8"))
    points = []
    for feature in data["features"]:
        lon, lat = feature["geometry"]["coordinates"]
        p = feature["properties"]
        points.append([
            round(lat, 5), round(lon, 5), p["truck_relevant_min_meters"], p["structure_number"],
            p["facility_carried"], p["features_intersected"], p["state"], p["truck_relevant_min_item"],
        ])
    packed = json.dumps(points, ensure_ascii=False, separators=(",", ":"), allow_nan=False)
    template = (HERE / "route_planner.template.html").read_text(encoding="utf-8")
    args.out.write_text(template.replace("__BRIDGE_DATA__", packed.replace("<", "\\u003c")),
                        encoding="utf-8")
    print(f"{args.out}: {len(points):,} bridge records, {args.out.stat().st_size:,} bytes")


if __name__ == "__main__":
    main()
