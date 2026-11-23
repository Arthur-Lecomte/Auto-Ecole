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

  function finishStroke() {
    const pts = draft.points;
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

    // Smooth the hand tremor, then make the loop even. Coordinates are
    // rounded BEFORE validation: the stored track must pass the exact same
    // check when reloaded from localStorage.
    const samples = resampleClosed(chaikinClosed(pts, 2), SAMPLE_SPACING).map((p) => ({
      x: Math.round(p.x),
      y: Math.round(p.y),
    }));
    const v = validateCenterline(samples, SAMPLE_SPACING, CUSTOM_WIDTH);
    draft.points = samples;
    draft.closed = true;
    if (!v.ok) {
      draft.badIndex = v.index;
      draft.valid = false;
      onStatus(
        v.reason === 'curve'
          ? 'Virage trop serré pour la largeur de la route (point rouge). Redessinez.'
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
