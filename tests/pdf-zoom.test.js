/**
 * Tests for os/apps/pdf/engine/zoom.js + viewport.js
 * Pure math — no DOM, no pdf.js.
 */
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
    PRESETS, FIT_MODES, MIN_ZOOM, MAX_ZOOM,
    stepZoom, findNearestPreset, clampZoom,
    zoomToFit, levelFromString, formatLevel, pinchAnchor,
} from '../os/apps/pdf/engine/zoom.js';
import {
    pageCssWidth, visiblePages, scrollYForPage, zoomAnchored, pickDefaultMode,
} from '../os/apps/pdf/engine/viewport.js';

const PAGE = { width: 600, height: 800 };
const STAGE = { width: 1200, height: 900 };

describe('zoom — clamping', () => {
    test('clamps below MIN', () => assert.equal(clampZoom(0.1), MIN_ZOOM));
    test('clamps above MAX', () => assert.equal(clampZoom(20), MAX_ZOOM));
    test('rejects NaN', () => assert.equal(clampZoom(NaN), 1.0));
});

describe('stepZoom', () => {
    test('snaps preset → next preset on +', () => {
        assert.equal(stepZoom(1.0, 1), 1.25);
    });
    test('snaps preset → previous preset on -', () => {
        assert.equal(stepZoom(1.0, -1), 0.75);
    });
    test('multiplies when far from any preset', () => {
        // 1.1 is 10% off 1.0 (snap window is 5%) → no snap, multiply by 1.25
        const r = stepZoom(1.1, 1);
        assert.ok(Math.abs(r - 1.375) < 1e-9, `expected ~1.375, got ${r}`);
    });
    test('snaps when within tolerance', () => {
        // 0.97 is within 5% of 1.0 → snaps, then steps to 1.25
        const r = stepZoom(0.97, 1);
        assert.equal(r, 1.25);
    });
    test('clamps at MAX', () => {
        assert.equal(stepZoom(MAX_ZOOM, 1), MAX_ZOOM);
    });
});

describe('findNearestPreset', () => {
    test('matches exact preset', () => assert.equal(findNearestPreset(1.0), 1.0));
    test('matches within tolerance', () => assert.equal(findNearestPreset(0.97), 1.0));
    test('returns null when far off', () => assert.equal(findNearestPreset(1.1), null));
    test('returns null beyond all presets', () => assert.equal(findNearestPreset(5.5), null));
});

describe('zoomToFit', () => {
    test('numeric mode passes through', () => {
        assert.equal(zoomToFit({ mode: 1.5, pageBaseViewport: PAGE, stage: STAGE }), 1.5);
    });
    test('actual = 1.0', () => {
        assert.equal(zoomToFit({ mode: 'actual', pageBaseViewport: PAGE, stage: STAGE }), 1.0);
    });
    test('fit-width single', () => {
        // innerW = 1200 - 48 = 1152, perPage = 1152, zoom = 1152/600 = 1.92
        assert.equal(zoomToFit({ mode: 'fit-width', pageBaseViewport: PAGE, stage: STAGE, padding: 24 }), 1.92);
    });
    test('fit-width spread divides by 2', () => {
        // innerW = 1152, gap=14 → perPage = (1152-14)/2 = 569, zoom = 569/600 ≈ 0.948
        const r = zoomToFit({ mode: 'fit-width', pageBaseViewport: PAGE, stage: STAGE, padding: 24, spread: true });
        assert.ok(r > 0.94 && r < 0.96);
    });
    test('fit-page chooses min(width-fit, height-fit)', () => {
        // innerH = 900 - 48 = 852, zoomH = 852/800 = 1.065 → smaller than 1.92 → pick height
        assert.equal(zoomToFit({ mode: 'fit-page', pageBaseViewport: PAGE, stage: STAGE, padding: 24 }), 1.065);
    });
    test('returns 1.0 with bad inputs', () => {
        assert.equal(zoomToFit({ mode: 'fit-width', pageBaseViewport: null, stage: STAGE }), 1.0);
    });
});

describe('levelFromString', () => {
    test('percent', () => assert.equal(levelFromString('150%'), 1.5));
    test('decimal', () => assert.equal(levelFromString('0.75'), 0.75));
    test('integer < 8 treated as factor', () => assert.equal(levelFromString('2'), 2.0));
    test('integer > 8 treated as percent', () => assert.equal(levelFromString('150'), 1.5));
    test('actual', () => assert.equal(levelFromString('Actual'), 1.0));
    test('100% is 1.0', () => assert.equal(levelFromString('100%'), 1.0));
    test('fit width', () => assert.equal(levelFromString('Fit width'), 'fit-width'));
    test('fit-page', () => assert.equal(levelFromString('fit-page'), 'fit-page'));
    test('garbage returns null', () => assert.equal(levelFromString('xyz'), null));
});

describe('formatLevel', () => {
    test('numeric 0.75 → 75%', () => assert.equal(formatLevel(0.75), '75%'));
    test('numeric 1.0 → 100%', () => assert.equal(formatLevel(1.0), '100%'));
    test('keyword fit-width', () => assert.equal(formatLevel('fit-width'), 'Fit width'));
    test('keyword fit-page', () => assert.equal(formatLevel('fit-page'), 'Fit page'));
});

describe('pinchAnchor', () => {
    test('factor = d1/d0', () => {
        const r = pinchAnchor({ d0: 100, d1: 150, mid0: { x: 0, y: 0 }, mid1: { x: 0, y: 0 } });
        assert.equal(r.zoomFactor, 1.5);
    });
    test('mid translation', () => {
        const r = pinchAnchor({ d0: 100, d1: 100, mid0: { x: 10, y: 20 }, mid1: { x: 50, y: 80 } });
        assert.equal(r.zoomFactor, 1);
        assert.equal(r.dx, 40);
        assert.equal(r.dy, 60);
    });
});

describe('viewport.pageCssWidth', () => {
    test('numeric zoom multiplies base width', () => {
        const w = pageCssWidth({ pageBaseViewport: PAGE, stage: STAGE, zoom: 2, mode: 'single' });
        assert.equal(w, 1200);
    });
    test('fit fallback when zoom is non-numeric', () => {
        const w = pageCssWidth({ pageBaseViewport: PAGE, stage: STAGE, zoom: 'fit-width', mode: 'spread' });
        // Falls back to spread fit-width math
        assert.equal(w, (1152 - 14) / 2);
    });
});

describe('viewport.visiblePages', () => {
    const boxes = [{ height: 800 }, { height: 800 }, { height: 800 }, { height: 800 }, { height: 800 }];

    test('first page only at top', () => {
        const r = visiblePages({ pageBoxes: boxes, scrollTop: 0, viewportH: 600, overscan: 0 });
        assert.deepEqual(r, { first: 1, last: 1 });
    });
    test('mid-doc spans 2-3 pages', () => {
        const r = visiblePages({ pageBoxes: boxes, scrollTop: 1700, viewportH: 600, overscan: 0 });
        // y for page 3 = 1600..2400; viewport 1700..2300 → page 3 only
        assert.deepEqual(r, { first: 3, last: 3 });
    });
    test('overscan widens range', () => {
        const r = visiblePages({ pageBoxes: boxes, scrollTop: 1700, viewportH: 600, overscan: 1 });
        assert.deepEqual(r, { first: 2, last: 4 });
    });
    test('past the end clamps to last', () => {
        const r = visiblePages({ pageBoxes: boxes, scrollTop: 99999, viewportH: 600 });
        assert.equal(r.last, 5);
    });
});

describe('viewport.scrollYForPage', () => {
    const boxes = [{ height: 800, gap: 10 }, { height: 800, gap: 10 }, { height: 800, gap: 10 }];

    test('page 1 → 0', () => assert.equal(scrollYForPage(boxes, 1), 0));
    test('page 2 → first page height + gap', () => assert.equal(scrollYForPage(boxes, 2), 810));
    test('page 3 → 2x (height + gap)', () => assert.equal(scrollYForPage(boxes, 3), 1620));
});

describe('viewport.zoomAnchored', () => {
    test('keeps anchor under cursor on 2x zoom', () => {
        // anchor at (300, 200) in stage coords; current scroll (0,0); old zoom 1, new zoom 2
        // Expected new scroll = (0+300)*2 - 300 = 300
        const r = zoomAnchored({
            anchor: { x: 300, y: 200 },
            scroll: { scrollLeft: 0, scrollTop: 0 },
            oldZoom: 1, newZoom: 2,
        });
        assert.equal(r.scrollLeft, 300);
        assert.equal(r.scrollTop, 200);
    });
    test('returns scroll unchanged on bad zoom', () => {
        const r = zoomAnchored({
            anchor: { x: 0, y: 0 },
            scroll: { scrollLeft: 100, scrollTop: 50 },
            oldZoom: 0, newZoom: 2,
        });
        assert.deepEqual(r, { scrollLeft: 100, scrollTop: 50 });
    });
});

describe('viewport.pickDefaultMode', () => {
    test('narrow portrait → continuous', () => {
        const r = pickDefaultMode({ stage: { width: 400, height: 800 }, pageBaseViewport: PAGE });
        assert.equal(r, 'continuous');
    });
    test('narrow landscape → single', () => {
        const r = pickDefaultMode({ stage: { width: 800, height: 600 }, pageBaseViewport: PAGE });
        assert.equal(r, 'single');
    });
    test('wide landscape with portrait page → spread', () => {
        const r = pickDefaultMode({ stage: { width: 1400, height: 900 }, pageBaseViewport: PAGE });
        assert.equal(r, 'spread');
    });
    test('wide landscape with landscape page → single (avoid weird spread)', () => {
        const r = pickDefaultMode({ stage: { width: 1400, height: 900 }, pageBaseViewport: { width: 800, height: 600 } });
        assert.equal(r, 'single');
    });
});

describe('exported constants', () => {
    test('FIT_MODES', () => assert.deepEqual([...FIT_MODES], ['fit-width', 'fit-page', 'actual']));
    test('PRESETS sorted ascending', () => {
        for (let i = 1; i < PRESETS.length; i++) {
            assert.ok(PRESETS[i] > PRESETS[i - 1]);
        }
    });
});
