// Freehand track editor: the visitor draws the centerline in one stroke,
// we smooth it, close the loop, and validate drivability. Pointer events
// only (mouse, touch, pen); every visual change goes through
// requestRender — no polling, no free-running loop.

import { chaikinClosed, resampleClosed, validateCenterline, SAMPLE_SPACING } from '../sim/track.js';
import { WORLD } from '../tracks/presets.js';

export const CUSTOM_WIDTH = 58;
const MIN_PERIMETER = 500; // world px
const MAX_CLOSE_GAP_RATIO = 0.3; // stroke must end near its start

export function createEditor({ canvas, worldFromEvent, requestRender, onStatus, onDraftChange }) {
  const draft = {
    points: [],
    closed: false,
    badIndex: -1,
    width: CUSTOM_WIDTH,
    valid: false,
  };
  let drawing = false;
  let activePointer = -1; // a second finger must not corrupt the stroke

  function reset() {
    draft.points = [];
    draft.closed = false;
    draft.badIndex = -1;
    draft.valid = false;
    onDraftChange(false);
  }

  function onPointerDown(e) {
    if (!e.isPrimary || drawing) return;
    e.preventDefault();
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort: drawing still works without it.
    }
    reset();
    drawing = true;
    activePointer = e.pointerId;
    draft.points.push(worldFromEvent(e));
    onStatus('Continuez la boucle et revenez au point de départ…');
    requestRender();
  }

  function onPointerMove(e) {
    if (!drawing || e.pointerId !== activePointer) return;
    const p = worldFromEvent(e);
    const last = draft.points[draft.points.length - 1];
    if (Math.hypot(p.x - last.x, p.y - last.y) < 4) return;
    draft.points.push(p);
    requestRender();
  }

  function onPointerUp(e) {
    if (!drawing || e.pointerId !== activePointer) return;
    drawing = false;
    activePointer = -1;
    finishStroke();
  }

  function perimeterOf(pts) {
    let d = 0;
    for (let i = 1; i < pts.length; i++) {
      d += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    }
    return d;
  }

  // A freehand stroke rarely meets its own start tangentially: the hand
  // overshoots or hooks inward. Cut the tail at the point of the final
  // stretch that comes closest to the start, so the closing seam is as
  // short and straight as possible.
  function trimTail(pts) {
    const head = pts[0];
    const from = Math.floor(pts.length * 0.6);
    let bestI = pts.length - 1;
    let bestD = Infinity;
    for (let i = from; i < pts.length; i++) {
      const d = Math.hypot(pts[i].x - head.x, pts[i].y - head.y);
      if (d < bestD) {
        bestD = d;
        bestI = i;
      }
    }
    return pts.slice(0, bestI + 1);
  }

  // One local smoothing pass: pull the samples around `center` toward
  // their neighbours' midpoint. Circular indices; mutates `pts`.
  function relaxWindow(pts, center, half) {
    const n = pts.length;
    const src = pts.map((p) => ({ x: p.x, y: p.y }));
    for (let k = -half; k <= half; k++) {
      const i = (((center + k) % n) + n) % n;
      const a = src[(i - 1 + n) % n];
      const b = src[i];
      const c = src[(i + 1) % n];
      pts[i] = { x: b.x * 0.4 + (a.x + c.x) * 0.3, y: b.y * 0.4 + (a.y + c.y) * 0.3 };
    }
  }

  function finishStroke() {
    const pts = trimTail(draft.points);
    const perimeter = perimeterOf(pts);
    if (pts.length < 12 || perimeter < MIN_PERIMETER) {
      onStatus('Tracé trop court : dessinez une grande boucle d’un seul geste.');
      reset();
      requestRender();
      return;
    }
    const gap = Math.hypot(
      pts[0].x - pts[pts.length - 1].x,
      pts[0].y - pts[pts.length - 1].y,
    );
    if (gap > perimeter * MAX_CLOSE_GAP_RATIO) {
      onStatus('Boucle ouverte : terminez votre tracé près de son départ.');
      reset();
      requestRender();
      return;
    }

    // Smooth the hand tremor, make the loop even, then REINTERPRET rather
    // than reject: while a curve is too tight for the road width (the
    // closing seam, a sharp corner, a hand wobble…), relax the samples
    // around it and try again. The working check uses a 10% width margin so
    // a corner, once fixed, cannot drift back under the real threshold when
    // resampling shifts the points. Validation always runs on rounded
    // coordinates — the stored track must pass the exact same check when
    // reloaded from localStorage.
    const MARGIN = 1.1;
    let samples = resampleClosed(chaikinClosed(pts, 2), SAMPLE_SPACING);
    let rounded = null;
    let v = null;
    for (let round = 0; round < 200; round++) {
      rounded = samples.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) }));
      const vm = validateCenterline(rounded, SAMPLE_SPACING, CUSTOM_WIDTH * MARGIN);
      if (vm.ok || vm.reason !== 'curve') {
        // Done smoothing (or a pinch, which smoothing cannot fix): the
        // verdict that counts is the one at the real road width.
        v = validateCenterline(rounded, SAMPLE_SPACING, CUSTOM_WIDTH);
        break;
      }
      v = vm;
      for (let pass = 0; pass < 3; pass++) relaxWindow(samples, vm.index, 8);
      samples = resampleClosed(samples, SAMPLE_SPACING);
    }
    if (v && !v.ok) {
      // Rounds exhausted mid-smoothing: give the real width a last word.
      const vs = validateCenterline(rounded, SAMPLE_SPACING, CUSTOM_WIDTH);
      if (vs.ok) v = vs;
    }

    draft.points = rounded;
    draft.closed = true;
    if (!v.ok) {
      draft.badIndex = v.index;
      draft.valid = false;
      onStatus(
        v.reason === 'curve'
          ? 'Virage impossible à adoucir pour la largeur de la route (point rouge). Redessinez.'
          : 'La piste se pince au point rouge : espacez les portions. Redessinez.',
      );
    } else {
      draft.badIndex = -1;
      draft.valid = true;
      onStatus('Beau circuit ! Validez-le, ou redessinez par-dessus.');
    }
    onDraftChange(draft.valid);
    requestRender();
  }

  function onPointerCancel(e) {
    if (e.pointerId !== activePointer) return;
    drawing = false;
    activePointer = -1;
    reset();
    requestRender();
  }

  function enter() {
    reset();
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerCancel);
    onStatus('Tracez une boucle fermée d’un seul geste (souris ou doigt).');
  }

  function exit() {
    drawing = false;
    activePointer = -1;
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerCancel);
    reset();
  }

  // The validated centerline, ready to be stored (already integers).
  function takeCenterline() {
    return draft.points.slice();
  }

  return {
    draft,
    enter,
    exit,
    takeCenterline,
    worldBounds: () => ({ minX: 0, minY: 0, maxX: WORLD.w, maxY: WORLD.h }),
  };
}
