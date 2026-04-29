/**
 * utils/mascotAnimations.ts — curated animation vocabulary for the
 * MintU mascot personality engine.
 *
 * The backend's LLM picks an `action` from a fixed vocabulary; this
 * module maps each action name to a concrete RN Animated sequence.
 * Stays tiny on purpose: 12 entries, ~1–2 second loops, all built from
 * the standard Animated API so there are no asset dependencies.
 *
 * The runner returns a cleanup function so callers can cancel mid-run.
 */
import { Animated, Easing } from 'react-native';
import type { MascotAction } from '../services/mascot';

/**
 * The full set of values the renderer reads. Each animation drives a
 * subset of these — values left untouched stay at their identity
 * (translateY=0, rotate=0, scale=1, opacity=1).
 */
export type MascotAnimValues = {
  translateY: Animated.Value;
  translateX: Animated.Value;
  rotate: Animated.Value;
  scale: Animated.Value;
  opacity: Animated.Value;
};

export function createMascotAnimValues(): MascotAnimValues {
  return {
    translateY: new Animated.Value(0),
    translateX: new Animated.Value(0),
    rotate: new Animated.Value(0),
    scale: new Animated.Value(1),
    opacity: new Animated.Value(1),
  };
}

export function resetMascotAnimValues(v: MascotAnimValues) {
  v.translateY.setValue(0);
  v.translateX.setValue(0);
  v.rotate.setValue(0);
  v.scale.setValue(1);
  v.opacity.setValue(1);
}

type Runner = (v: MascotAnimValues, opts?: { loop?: boolean }) => Animated.CompositeAnimation;

const seq = (...steps: Animated.CompositeAnimation[]) => Animated.sequence(steps);

const timing = (
  v: Animated.Value,
  toValue: number,
  duration: number,
  easing: ((value: number) => number) = Easing.out(Easing.cubic),
) => Animated.timing(v, { toValue, duration, easing, useNativeDriver: true });

const spring = (v: Animated.Value, toValue: number, damping = 10) =>
  Animated.spring(v, { toValue, damping, stiffness: 110, useNativeDriver: true });

// ── Animation runners ────────────────────────────────────────────────

const runPeek: Runner = (v) =>
  seq(
    Animated.parallel([timing(v.translateY, 6, 280), timing(v.scale, 0.92, 280)]),
    Animated.parallel([spring(v.translateY, 0), spring(v.scale, 1)]),
    timing(v.translateY, -4, 200),
    spring(v.translateY, 0, 8),
  );

const runJuggle: Runner = (v) =>
  seq(
    Animated.parallel([
      timing(v.rotate, -1, 400, Easing.inOut(Easing.quad)),
      timing(v.translateY, -8, 400, Easing.inOut(Easing.quad)),
    ]),
    Animated.parallel([
      timing(v.rotate, 1, 600, Easing.inOut(Easing.quad)),
      timing(v.translateY, 0, 300, Easing.bounce),
    ]),
    Animated.parallel([timing(v.rotate, 0, 300), timing(v.translateY, -4, 200)]),
    timing(v.translateY, 0, 200),
  );

const runFloat: Runner = (v) =>
  seq(
    timing(v.translateY, -10, 1100, Easing.inOut(Easing.sin)),
    timing(v.translateY, 0, 1100, Easing.inOut(Easing.sin)),
  );

const runStretch: Runner = (v) =>
  seq(
    Animated.parallel([timing(v.scale, 1.18, 380, Easing.out(Easing.cubic))]),
    Animated.parallel([timing(v.scale, 0.94, 250)]),
    spring(v.scale, 1, 8),
  );

const runSip: Runner = (v) =>
  seq(
    Animated.parallel([timing(v.rotate, -0.4, 500, Easing.inOut(Easing.quad))]),
    Animated.delay(250),
    Animated.parallel([timing(v.rotate, 0, 500, Easing.inOut(Easing.quad))]),
  );

const runSpin: Runner = (v) =>
  seq(timing(v.rotate, 4, 900, Easing.inOut(Easing.quad)), Animated.timing(v.rotate, { toValue: 0, duration: 0, useNativeDriver: true }));

const runBounce: Runner = (v) =>
  seq(
    timing(v.translateY, -22, 280, Easing.out(Easing.cubic)),
    timing(v.translateY, 0, 360, Easing.bounce),
    timing(v.translateY, -10, 220),
    timing(v.translateY, 0, 240, Easing.bounce),
  );

const runFly: Runner = (v) =>
  seq(
    Animated.parallel([
      timing(v.translateY, -14, 400, Easing.out(Easing.cubic)),
      timing(v.translateX, 8, 400),
      timing(v.rotate, 0.3, 400),
    ]),
    Animated.parallel([
      timing(v.translateX, -8, 600),
      timing(v.rotate, -0.3, 600),
    ]),
    Animated.parallel([
      timing(v.translateX, 0, 400),
      timing(v.translateY, 0, 400),
      timing(v.rotate, 0, 400),
    ]),
  );

const runWave: Runner = (v) =>
  seq(
    timing(v.rotate, 0.5, 220),
    timing(v.rotate, -0.5, 360),
    timing(v.rotate, 0.4, 320),
    timing(v.rotate, 0, 240),
  );

const runTap: Runner = (v) =>
  seq(
    timing(v.scale, 0.85, 120, Easing.out(Easing.cubic)),
    spring(v.scale, 1.08, 8),
    spring(v.scale, 1, 12),
  );

const runCelebrate: Runner = (v) =>
  seq(
    Animated.parallel([
      timing(v.scale, 1.25, 280, Easing.out(Easing.cubic)),
      timing(v.translateY, -12, 280),
    ]),
    Animated.parallel([
      timing(v.rotate, 0.4, 200),
      timing(v.translateY, 0, 240, Easing.bounce),
    ]),
    Animated.parallel([
      timing(v.rotate, -0.4, 240),
      timing(v.translateY, -6, 200),
    ]),
    Animated.parallel([
      timing(v.rotate, 0, 200),
      timing(v.translateY, 0, 200, Easing.bounce),
      spring(v.scale, 1, 10),
    ]),
  );

const runSleep: Runner = (v) =>
  seq(
    timing(v.rotate, 0.15, 1400, Easing.inOut(Easing.sin)),
    timing(v.rotate, -0.15, 1400, Easing.inOut(Easing.sin)),
  );

// ── Registry ─────────────────────────────────────────────────────────

const REGISTRY: Record<MascotAction, Runner> = {
  peek: runPeek,
  juggle: runJuggle,
  float: runFloat,
  stretch: runStretch,
  sip: runSip,
  spin: runSpin,
  bounce: runBounce,
  fly: runFly,
  wave: runWave,
  tap: runTap,
  celebrate: runCelebrate,
  sleep: runSleep,
};

/**
 * Run the named animation on the given values.
 *
 * @param action name from the curated vocabulary
 * @param values values to drive (call createMascotAnimValues() once per mount)
 * @param onDone optional callback fired when the animation completes
 * @returns a stop function — call to abort mid-run
 */
export function playMascotAnimation(
  action: MascotAction,
  values: MascotAnimValues,
  onDone?: () => void,
): () => void {
  resetMascotAnimValues(values);
  const runner = REGISTRY[action] ?? runWave;
  const composite = runner(values);
  composite.start((res) => {
    if (res.finished) onDone?.();
  });
  return () => composite.stop();
}

/**
 * Convert the abstract `rotate` Animated.Value (radians) into the
 * `transform: [{ rotate: 'Xdeg' }]`-friendly degrees string.
 */
export function rotateToDeg(v: Animated.Value): Animated.AnimatedInterpolation<string> {
  return v.interpolate({
    inputRange: [-2 * Math.PI, 2 * Math.PI],
    outputRange: ['-720deg', '720deg'],
  });
}
