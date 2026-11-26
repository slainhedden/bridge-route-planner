const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { classify, routeAdvisories, duration, makeCoverageCheck } = require('./route_matching.js');
const routeBoundaries = require('./route_boundaries.json');

const settings = { height: (13 * 12 + 9) * .0254 };
const hit = (road, cardinal = 'S', distance = 0) => ({ road, cardinal, distance });
const bridge = (facility, feature, state, under, deck, prefix = null, number = null) =>
  [0, 0, null, '', facility, feature, state, '', under, deck, prefix, number, ''];

describe('road and level matching', () => {
  it('does not apply Pendleton Avenue clearance to I-5 above it', () => {
    const pendleton = bridge('I-5', 'Pendleton Ave', 'WA', 3.84, null, '1', '00005');
    assert.deepEqual(classify(pendleton, [hit('Interstate 5')], settings), []);
    assert.equal(classify(pendleton, [hit('Pendleton Avenue')], settings)[0].status, 'conflict');
  });

  it('lists the 0.31 m I-35 report as suspect, not as a conflict', () => {
    const stassney = bridge('IH35N T/A@STASSNEY', 'IH 35 ML', 'TX', .31, null, '1', '00035');
    assert.equal(classify(stassney, [hit('I 35', 'N')], settings)[0].status, 'suspect');
  });

  it('lists the 0.12 m I-16 source reading as suspect, not as a conflict', () => {
    const i16 = bridge('SR 86', 'I-16 (SR 404)', 'GA', .12, null);
    assert.equal(classify(i16, [hit('I-16')], settings)[0].status, 'suspect');
  });

  it('selects separate Storrow eastbound under and westbound deck measurements', () => {
    const storrow = bridge('STORRW DR WB', 'STORROW DR EB', 'MA', 3.05, 3.35);
    for (const [cardinal, side, meters] of [['E', 'under', 3.05], ['W', 'on', 3.35]]) {
      const results = classify(storrow, [hit('Storrow Drive', cardinal)], settings);
      assert.deepEqual(results.map(r => [r.status, r.side, r.meters]), [['conflict', side, meters]]);
    }
  });

  it('puts an unmatched or ambiguous road pair in the check list', () => {
    const wacker = bridge('Upper Wacker Dr', 'Lower Wacker Dr', 'IL', 3.65, null);
    assert.deepEqual(classify(wacker, [hit('Upper Wacker Drive')], settings), []);
    assert.equal(classify(wacker, [hit('Wacker Drive')], settings)[0].status, 'check');
    assert.equal(classify(wacker, [hit('Lower Wacker Drive')], settings)[0].status, 'conflict');
  });
});

describe('international coverage', () => {
  const coverage = makeCoverageCheck(routeBoundaries);

  it('finds Canada even when neither endpoint is in Canada', () => {
    const route = [[-122.67, 48.99], [-122.67, 49.01], [-122.65, 49.01], [-122.65, 48.99]];
    const result = coverage(route);
    assert.deepEqual(result.countries, ['Canada']);
    assert.equal(result.outside.length, 1);
  });

  it('distinguishes San Diego from a route into Mexico', () => {
    assert.deepEqual(coverage([[-117.16, 32.72], [-117.04, 32.56]]).countries, []);
    assert.deepEqual(coverage([[-117.04, 32.56], [-117.03, 32.53]]).countries, ['Mexico']);
  });
});

describe('advisories and timing', () => {
  it('warns for Grand Central Parkway and identifies the Jewel Avenue crossing', () => {
    const step = {
      name: 'Grand Central Pkwy', distance: 900,
      geometry: { coordinates: [[-73.842, 40.728], [-73.835, 40.722]] },
    };
    const { restrictions, crossings } = routeAdvisories([step]);
    assert.equal(restrictions[0].name, 'Grand Central Parkway');
    assert.match(crossings[0].name, /Jewel Avenue/);
    step.name = 'Jewel Avenue';
    assert.deepEqual(routeAdvisories([step]), { restrictions: [], crossings: [] });
    assert.equal(duration(2123 * 60), '35 hr 23 min');
  });
});
