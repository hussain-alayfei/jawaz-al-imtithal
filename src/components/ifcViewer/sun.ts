/**
 * Solar position (NOAA simplified equations, accurate to well under a degree for
 * display). Azimuth is measured clockwise from north.
 */
export function solarPosition(latDeg: number, lonDeg: number, date: Date): { elevation: number; azimuth: number } {
  const rad = Math.PI / 180;
  const jd = date.getTime() / 86400000 + 2440587.5;
  const t = (jd - 2451545) / 36525;
  const l0 = (280.46646 + t * (36000.76983 + t * 0.0003032)) % 360;
  const m = 357.52911 + t * (35999.05029 - 0.0001537 * t);
  const e = 0.016708634 - t * (0.000042037 + 0.0000001267 * t);
  const c =
    Math.sin(m * rad) * (1.914602 - t * (0.004817 + 0.000014 * t)) +
    Math.sin(2 * m * rad) * (0.019993 - 0.000101 * t) +
    Math.sin(3 * m * rad) * 0.000289;
  const trueLong = l0 + c;
  const omega = 125.04 - 1934.136 * t;
  const lambda = trueLong - 0.00569 - 0.00478 * Math.sin(omega * rad);
  const eps0 = 23 + (26 + (21.448 - t * (46.815 + t * (0.00059 - t * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos(omega * rad);
  const decl = Math.asin(Math.sin(eps * rad) * Math.sin(lambda * rad));
  const y = Math.tan((eps / 2) * rad) ** 2;
  const eqTime =
    (4 / rad) *
    (y * Math.sin(2 * l0 * rad) -
      2 * e * Math.sin(m * rad) +
      4 * e * y * Math.sin(m * rad) * Math.cos(2 * l0 * rad) -
      0.5 * y * y * Math.sin(4 * l0 * rad) -
      1.25 * e * e * Math.sin(2 * m * rad));
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
  const trueSolar = (((minutes + eqTime + 4 * lonDeg) % 1440) + 1440) % 1440;
  const hourAngle = trueSolar / 4 < 0 ? trueSolar / 4 + 180 : trueSolar / 4 - 180;
  const lat = latDeg * rad;
  const cosZenith =
    Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle * rad);
  const zenith = Math.acos(Math.min(1, Math.max(-1, cosZenith)));
  const elevation = 90 - zenith / rad;
  const azDen = Math.cos(lat) * Math.sin(zenith);
  let azimuth = 180;
  if (Math.abs(azDen) > 1e-9) {
    const azRad = Math.acos(
      Math.min(1, Math.max(-1, (Math.sin(lat) * Math.cos(zenith) - Math.sin(decl)) / azDen)),
    );
    azimuth = hourAngle > 0 ? (azRad / rad + 180) % 360 : (540 - azRad / rad) % 360;
  }
  return { elevation, azimuth };
}

/** Unit vector towards the sun in the scene frame (x = east, y = up, z = -north). */
export function sunVector(elevationDeg: number, azimuthDeg: number): [number, number, number] {
  const el = (elevationDeg * Math.PI) / 180;
  const az = (azimuthDeg * Math.PI) / 180;
  return [Math.cos(el) * Math.sin(az), Math.sin(el), -Math.cos(el) * Math.cos(az)];
}

/** Riyadh, the date and hour the viewer is lit for (10:30 local, UTC+3, spring equinox). */
export const RIYADH = { lat: 24.7136, lon: 46.6753 };
export const VIEW_TIME = new Date(Date.UTC(2026, 2, 20, 7, 30));

/**
 * Afternoon for the street views (landing-page hero and story): 14:20 local on 18 November, the sun about
 * 31 degrees up in the south-west: high enough that the neighbours leave the street in sun, low enough for
 * warm light and shadows that read.
 */
export const HERO_TIME = new Date(Date.UTC(2026, 10, 18, 11, 20));

export interface Daylight {
  /** Direct sun colour (sRGB hex) and intensity for a DirectionalLight. */
  sun: { color: string; intensity: number };
  /** Hemisphere light: sky and ground colours, intensity. */
  hemisphere: { sky: string; ground: string; intensity: number };
  /** Image-light dome colours (linear RGB, all below 1 so the sun stays the key light). */
  dome: { zenith: [number, number, number]; horizon: [number, number, number]; ground: [number, number, number]; sunGlow: number };
  /** Sky shader parameters. */
  sky: { turbidity: number; rayleigh: number; mie: number; mieG: number };
  fog: string;
  exposure: number;
  /** scene.environmentIntensity: the dome fills the shade, the sun stays the key light. */
  envIntensity: number;
}

const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const mix3 = (a: readonly number[], b: readonly number[], t: number): [number, number, number] => [
  mix(a[0], b[0], t),
  mix(a[1], b[1], t),
  mix(a[2], b[2], t),
];
const hex = (rgb: readonly number[]) =>
  `#${rgb.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("")}`;

/**
 * Light for a clear desert day from the sun's elevation (degrees): white midday sun, warm and
 * weaker near the horizon (longer air path), the sky dome warming at its horizon. Tuned against
 * captures for a sun-to-shade ratio of about 5:1 on sunlit ground at midday (about 2:1 at golden
 * hour, when the sky's share of the light is larger).
 */
export function daylight(elevationDeg: number, warmth = 0): Daylight {
  // 0 at the horizon, 1 from about 35 degrees up.
  const t = Math.min(1, Math.max(0, (elevationDeg - 2) / 33));
  const e = t * t * (3 - 2 * t);
  // `warmth` (0-1) lends the colours some of a lower sun's (a warm, inviting afternoon in a light haze)
  // while the intensities follow the real elevation, so the sun-to-shade ratio and the shadows hold.
  const c = e * (1 - 0.6 * Math.min(1, Math.max(0, warmth)));
  // Low sun: warm but not orange (a clear desert evening, not a dusty sunset).
  const sunLow = [1.0, 0.84, 0.66];
  const sunHigh = [1.0, 0.957, 0.902];
  return {
    // three.js lights are physical (since r155): a diffuse surface gets intensity x N.L / pi from
    // the sun but the full image light, so the sun needs about pi times the old value for a
    // sun-to-shade ratio near 5:1 (3d-studio skill); exposure comes down to match.
    sun: { color: hex(mix3(sunLow, sunHigh, c)), intensity: mix(7.6, 9.4, e) },
    hemisphere: {
      sky: hex(mix3([0.8, 0.82, 0.86], [0.874, 0.906, 0.933], c)),
      ground: hex(mix3([0.58, 0.5, 0.4], [0.604, 0.518, 0.4], c)),
      intensity: mix(0.22, 0.3, e),
    },
    dome: {
      zenith: mix3([0.42, 0.48, 0.58], [0.5, 0.6, 0.74], e),
      horizon: mix3([0.88, 0.8, 0.7], [0.86, 0.84, 0.8], c),
      ground: mix3([0.4, 0.34, 0.27], [0.42, 0.37, 0.3], c),
      sunGlow: mix(0.9, 0.6, c),
    },
    sky: { turbidity: mix(4.5, 6.5, e) + 3 * Math.min(1, Math.max(0, warmth)), rayleigh: mix(2.0, 1.5, c), mie: mix(0.004, 0.006, e), mieG: mix(0.86, 0.82, c) },
    fog: hex(mix3([0.85, 0.8, 0.74], [0.867, 0.839, 0.788], c)),
    exposure: mix(0.78, 0.62, e),
    envIntensity: mix(0.62, 0.72, e),
  };
}
