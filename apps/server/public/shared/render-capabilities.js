import { detectWebGLSupport, getDeviceHeuristics, prefersLowPowerHint } from "/shared/renderer-quality.js";

let cachedWebglSupport = null;
let cachedLowPowerHint = null;

export function supportsWebGL() {
  if (cachedWebglSupport != null) return cachedWebglSupport;
  try {
    cachedWebglSupport = !!detectWebGLSupport()?.supported;
  } catch {
    cachedWebglSupport = false;
  }
  return cachedWebglSupport;
}

export function prefersLowPower() {
  if (cachedLowPowerHint != null) return cachedLowPowerHint;
  try {
    cachedLowPowerHint = !!prefersLowPowerHint(getDeviceHeuristics());
  } catch {
    cachedLowPowerHint = false;
  }
  return cachedLowPowerHint;
}
