'use strict';

const routeMatching = (() => {
  const foot = .3048, inch = .0254, cutoff = 4.4196;
  const stateRoute = '(?:STATE\\s+(?:HIGHWAY|ROUTE)|S\\.?R\\.?|S\\.?H\\.?|ST)';
  const direction = /\b(NORTHBOUND|SOUTHBOUND|EASTBOUND|WESTBOUND|[NSEW]B(?:L)?)\b/g;
  const aliases = {
    ST: 'STREET', RD: 'ROAD', AV: 'AVENUE', AVE: 'AVENUE', DR: 'DRIVE', BLVD: 'BOULEVARD',
    HWY: 'HIGHWAY', PKWY: 'PARKWAY', LN: 'LANE', CTR: 'CENTER', N: 'NORTH',
    S: 'SOUTH', E: 'EAST', W: 'WEST', STRW: 'STORROW', STRRW: 'STORROW', STORRW: 'STORROW',
  };

  function refs(text, state) {
    const expression = new RegExp('\\b(INTERSTATE|I\\.?H\\.?|I|U\\.?S\\.?|'+ stateRoute +
      '|' + state + ')\\s*[- .]?\\s*0*(\\d{1,4})([A-Z]?)\\b', 'g');
    return [...text.matchAll(expression)].map(([, prefix, number, suffix]) =>
      (prefix.startsWith('I') && prefix !== state ? 'I' : prefix === 'INTERSTATE' ? 'I'
       : /^U\.?S\.?$/.test(prefix) ? 'US' : state) + '-' + Number(number) + suffix);
  }

  function roadParts(text, state, fallbackRef) {
    const raw = (text || '').toUpperCase();
    const parts = raw.split(/\s*(?:[\/;&@]|\bAND\b|\s+-\s+)\s*/).map(part => {
      const dirs = [...part.matchAll(direction)].map(match => match[0][0]);
      const roadRefs = refs(part, state);
      const ramp = /\b(?:RAMPS?|RMP|RPS|ONRP|OFRP|OFFRP)\b/.test(part);
      const name = part.replace(direction, ' ').replace(
        new RegExp('\\b(?:INTERSTATE|I\\.?H\\.?|I|U\\.?S\\.?|' + stateRoute + '|' + state +
          ')\\s*[- .]?\\s*\\d{1,4}[A-Z]?\\b', 'g'), ' ')
        .replace(/\b(?:HWY|HIGHWAY|RAMPS?|RMP|RPS|ONRP|OFRP|OFFRP)\b/g, ' ')
        .replace(/\b(?:ON|OFF)$/g, '').replace(/[^A-Z0-9]+/g, ' ').trim().split(/\s+/)
        .map(word => aliases[word] || word).join(' ');
      return { name: name === 'STORROW' ? 'STORROW DRIVE' : name, refs: roadRefs, dirs, ramp };
    });
    if (fallbackRef && !parts.some(part => part.refs.includes(fallbackRef))) {
      parts.push({ refs: [fallbackRef], name: '', dirs: parts[0].dirs, ramp: parts[0].ramp });
    }
    return parts;
  }

  function inventoryRef(prefix, number, state) {
    const type = { '1': 'I', '2': 'US', '3': state }[prefix];
    return type && /^\d{1,5}[A-Z]?$/.test(number || '') && parseInt(number, 10)
      ? type + '-' + number.replace(/^0+/, '') : null;
  }

  function roadMatches(parts, step, cardinal) {
    return parts.some(a => step.some(b => {
      if (a.dirs.length && cardinal && !a.dirs.includes(cardinal)) return false;
      if (a.ramp && !b.ramp) return false;
      return (a.name && a.name === b.name) || a.refs.some(ref => b.refs.includes(ref));
    }));
  }

  function bridgeRoads(b) {
    return {
      on: roadParts(b[4], b[6], inventoryRef(b[10], b[11], b[6])),
      under: roadParts(b[6] === 'NY' && /\b907M\b/i.test(b[5] || '')
        ? 'Grand Central Parkway' : b[5], b[6]),
    };
  }

  function classify(bridge, nearestSegments, settings) {
    const roads = bridgeRoads(bridge);
    const nearest = nearestSegments.reduce((best, s) => s.distance < best.distance ? s : best);
    const measured = [['under', bridge[8]], ['on', bridge[9]]]
      .filter(([, m]) => m !== null && m < Math.min(settings.height, cutoff) - 1e-9);
    const matching = { on: null, under: null };
    for (const segment of nearestSegments) {
      if (segment.distance > nearest.distance + 8) continue;
      const parts = roadParts(segment.road, bridge[6]);
      for (const side of ['on', 'under']) {
        if (roadMatches(roads[side], parts, segment.cardinal)
            && (!matching[side] || matching[side].distance > segment.distance)) matching[side] = segment;
      }
    }
    return measured.flatMap(([side, meters]) => {
      const other = side === 'on' ? 'under' : 'on';
      if (!matching[side] && matching[other]) return [];
      const relevant = matching[side] || nearest;
      const suspect = meters < (roads[side].some(p => p.refs.some(ref => /^(I|US)-/.test(ref)))
        ? 8 * foot : 6 * foot);
      const status = suspect ? 'suspect'
        : matching[side] && !matching[other] ? 'conflict' : 'check';
      return [{ ...relevant, side, meters, status }];
    });
  }

  function duration(seconds) {
    const minutes = Math.round(seconds / 60);
    return minutes < 60 ? minutes + ' min' : Math.floor(minutes / 60) + ' hr ' + minutes % 60 + ' min';
  }

  function makeCoverageCheck(countries) {
    function bbox(ring) {
      return ring.reduce(([left, bottom, right, top], [x, y]) =>
        [Math.min(left, x), Math.min(bottom, y), Math.max(right, x), Math.max(top, y)],
      [Infinity, Infinity, -Infinity, -Infinity]);
    }

    function inRing(x, y, ring) {
      let inside = false;
      for (let i = 1; i < ring.length; i++) {
        const [ax, ay] = ring[i - 1], [bx, by] = ring[i];
        if ((ay > y) !== (by > y) && x < ax + (bx - ax) * (y - ay) / (by - ay)) inside = !inside;
      }
      return inside;
    }

    const prepared = Object.entries(countries).map(([country, polygons]) =>
      [country, bbox(polygons.flatMap(rings => rings[0])),
        polygons.map(([outer, ...holes]) => [bbox(outer), outer, holes])]);
    const contains = ([left, bottom, right, top], x, y) => x >= left && x <= right && y >= bottom && y <= top;
    return points => {
      const found = new Set(), outside = [];
      let current = null;
      for (let i = 1; i < points.length; i++) {
        const [ax, ay] = points[i - 1], [bx, by] = points[i];
        const dx = bx - ax, dy = by - ay;
        if (Math.abs(dx) > 180) continue;
        const steps = Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / .005);
        for (let sample = 0; sample < steps; sample++) {
          const t = (sample + .5) / steps, x = ax + t * dx, y = ay + t * dy;
          const match = prepared.find(([, bounds, polygons]) => contains(bounds, x, y) &&
            polygons.some(([box, outer, holes]) => contains(box, x, y) &&
              inRing(x, y, outer) && !holes.some(hole => inRing(x, y, hole))));
          if (match) {
            found.add(match[0]);
            if (!current) {
              current = [[ax + sample * dx / steps, ay + sample * dy / steps]];
              outside.push(current);
            }
            current.push([ax + (sample + 1) * dx / steps, ay + (sample + 1) * dy / steps]);
          } else {
            current = null;
          }
        }
      }
      return { countries: [...found], outside };
    };
  }

  const sources = {
    boston: 'https://www.mass.gov/news/dcr-launches-annual-storrowing-public-awareness-campaign-ahead-of-move-in-day-in-greater-boston',
    nyc: 'https://www.nyc.gov/html/dot/html/motorist/parkway-restrictions.shtml',
    longIsland: 'https://www.governor.ny.gov/news/governor-hochul-highlights-new-measures-deter-wrong-way-driving-and-bridge-strikes-long-island',
    chicago: 'https://www.chicago.gov/content/dam/city/depts/cdot/Hansen8/FAQ/CDOT_Truck_Travel_Permit_Travel_LSD_Boulevards.pdf',
  };
  const areas = [
    [[42.30, -71.25, 42.43, -71.01], 'MA', 'Cars only', sources.boston, [
      'Storrow Drive', 'James Jackson Storrow Memorial Drive', 'Soldiers Field Road', 'Memorial Drive',
    ]],
    [[40.45, -74.30, 41.02, -73.64], 'NY', 'Commercial vehicle restrictions', sources.nyc, [
      'Belt Parkway', 'FDR Drive', 'Franklin Delano Roosevelt Drive', 'Henry Hudson Parkway',
      'Cross Island Parkway', 'Jackie Robinson Parkway', 'Bronx River Parkway', 'Hutchinson River Parkway',
      'Mosholu Parkway', 'Pelham Parkway', 'Ocean Parkway', 'Korean War Veterans Parkway',
      'Grand Central Parkway', 'Harlem River Drive',
    ]],
    [[40.53, -73.80, 41.05, -72.79], 'NY', 'Truck restrictions', sources.longIsland, [
      'Southern State Parkway', 'Northern State Parkway', 'Meadowbrook State Parkway', 'Meadowbrook Parkway',
      'Wantagh State Parkway', 'Wantagh Parkway', 'Bethpage State Parkway', 'Sagtikos State Parkway',
      'Sunken Meadow State Parkway', 'Robert Moses State Parkway', 'Heckscher State Parkway',
    ]],
    [[41.75, -87.68, 42.02, -87.51], 'IL', 'Truck permit or restriction may apply', sources.chicago, [
      'DuSable Lake Shore Drive', 'North DuSable Lake Shore Drive', 'South DuSable Lake Shore Drive',
      'Lake Shore Drive', 'North Lake Shore Drive', 'South Lake Shore Drive',
    ]],
  ];
  const documented = [
    [[40.7239, -73.8402, 40.7272, -73.8360], 'NY', 'Grand Central Parkway', 'Jewel Avenue over Grand Central Parkway',
      'NYSDOT identified an over-height strike-prevention site here in 2016. NBI 2025 record 000000001065010 reports 4.29 m (about 14 ft 1 in); its reference point is offset from the crossing. This is not a posted height.',
      'https://www.dot.ny.gov/news/press-releases/2016/2016-11-07'],
    [[42.3515, -71.1114, 42.3538, -71.1098], 'MA', 'Storrow Drive', 'Boston University Bridge crossing',
      'A 2017 report documented an 11 ft sign on westbound Storrow Drive. The NBI highway record does not provide this roadway underclearance. Verify current signs; do not assume the same height applies eastbound.',
      'https://whdh.com/news/truck-destroyed-trying-to-pass-under-boston-university-bridge/'],
  ];

  function enters(points, [south, west, north, east]) {
    return points.some(([lon, lat], i) => {
      const [x, y] = points[Math.max(0, i - 1)];
      return Math.max(lon, x) >= west && Math.min(lon, x) <= east &&
        Math.max(lat, y) >= south && Math.min(lat, y) <= north;
    });
  }

  function routeAdvisories(steps) {
    const restrictions = new Map(), crossings = new Map();
    for (const step of steps) {
      if (!step.name || !step.distance) continue;
      const points = step.geometry.coordinates;
      for (const [bounds, state, rule, source, names] of areas) {
        if (!enters(points, bounds)) continue;
        const parts = roadParts(step.name, state);
        for (const name of names) {
          if (roadMatches(roadParts(name, state), parts)) restrictions.set(name, { name, rule, source });
        }
      }
      for (const [bounds, state, road, name, note, source] of documented) {
        if (enters(points, bounds) && roadMatches(roadParts(road, state), roadParts(step.name, state))) {
          crossings.set(name, { name, note, source });
        }
      }
    }
    return { restrictions: [...restrictions.values()], crossings: [...crossings.values()] };
  }

  return { classify, duration, makeCoverageCheck, roadParts, routeAdvisories, foot, inch, cutoff };
})();

if (typeof module === 'object') module.exports = routeMatching;
