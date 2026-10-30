/**
 * Echo pulse tuning plus the world-material GLSL that draws it. Imported by both echoSystem.ts (CPU side) and
 * render/shaderChunks.ts, so it must not import either (no cycles).
 */
export const PULSE_SLOTS = 2
/** Wavefront speed (m/s). */
export const PULSE_SPEED = 24
/** The wave has fully dissolved by this radius (m). */
export const PULSE_RADIUS = 70
/** Seconds from emission until the wavefront dissolves. */
export const PULSE_DURATION = PULSE_RADIUS / PULSE_SPEED
/** Seconds the revealed glyphs stay lit after the wavefront passes a point. */
export const GLYPH_DURATION = 6
/** Start time of an unused slot: far enough in the past that every shader term evaluates to zero. */
export const PULSE_INACTIVE = -1e4

const f = (n: number) => n.toFixed(4)

/** Needs `uEchoNoise` and `uEchoTime` declared first. Provides `echoPulseEmission(worldPos, worldNormal)`. */
export const PULSE_GLSL = /* glsl */ `
uniform vec4 uEchoPulses[${PULSE_SLOTS}];
uniform float uEchoClock;

const float ECHO_PULSE_SPEED = ${f(PULSE_SPEED)};
const float ECHO_PULSE_RADIUS = ${f(PULSE_RADIUS)};
const float ECHO_GLYPH_DURATION = ${f(GLYPH_DURATION)};
const vec3 ECHO_PULSE_TINT = vec3(0.32, 0.86, 1.0);

float echoHash(vec2 c) {
  return fract(sin(dot(c, vec2(127.1, 311.7))) * 43758.5453);
}

float echoSegment(vec2 q, vec2 dir) {
  return length(q - dir * clamp(dot(q, dir), 0.0, 0.5));
}

// Inscribed circuit traces. Each cell edge is linked by a hash shared with the neighbouring cell, so traces connect
// across cells; dead ends get a ring pad, junctions a dot. Uses derivatives, so never call it inside a branch.
float echoGlyphLines(vec2 uv) {
  vec2 cell = floor(uv);
  vec2 q = fract(uv) - 0.5;
  vec4 link = step(0.56, vec4(
    echoHash(cell + vec2(0.5, 0.0)),
    echoHash(cell + vec2(-0.5, 0.0)),
    echoHash(cell + vec2(0.0, 0.5)),
    echoHash(cell + vec2(0.0, -0.5))));
  float d = 1.0;
  d = mix(d, min(d, echoSegment(q, vec2(1.0, 0.0))), link.x);
  d = mix(d, min(d, echoSegment(q, vec2(-1.0, 0.0))), link.y);
  d = mix(d, min(d, echoSegment(q, vec2(0.0, 1.0))), link.z);
  d = mix(d, min(d, echoSegment(q, vec2(0.0, -1.0))), link.w);
  float links = dot(link, vec4(1.0));
  d = links == 1.0 ? min(d, abs(length(q) - 0.13)) : d;
  d = links >= 3.0 ? min(d, max(length(q) - 0.07, 0.0)) : d;
  // AA width from the continuous uv footprint (d itself jumps at cell borders).
  vec2 footprint = fwidth(uv);
  float px = max(footprint.x, footprint.y);
  float line = 1.0 - smoothstep(0.03, 0.03 + px, d);
  // Fade out before the lines get thinner than a pixel and shimmer.
  return line * (1.0 - smoothstep(0.12, 0.3, px));
}

// Travelling wavefront (sharp leading edge, softer tail) + glyphs that ignite as it passes and fade over
// ECHO_GLYPH_DURATION. Unused slots start at PULSE_INACTIVE, which zeroes every term.
vec3 echoPulseEmission(vec3 p, vec3 n) {
  vec3 an = abs(n);
  vec2 plane = an.y > 0.7 ? p.xz : (an.x > an.z ? p.zy : p.xy);
  vec2 uv = plane;
  float lines = echoGlyphLines(uv);
  float mask = smoothstep(0.55, 0.66, texture(uEchoNoise, uv * 0.03 + 0.21).r);

  float front = 0.0;
  float reveal = 0.0;
  float ignite = 0.0;
  for (int i = 0; i < ${PULSE_SLOTS}; i++) {
    vec4 pulse = uEchoPulses[i];
    float age = uEchoClock - pulse.w;
    float dist = distance(p, pulse.xyz);
    float x = dist - age * ECHO_PULSE_SPEED;
    float life = 1.0 - smoothstep(0.45, 1.0, age * ECHO_PULSE_SPEED / ECHO_PULSE_RADIUS);
    front += exp(-x * x * (x > 0.0 ? 2.5 : 0.35)) * life;
    float since = -x / ECHO_PULSE_SPEED;
    float range = 1.0 - smoothstep(0.75, 1.0, dist / ECHO_PULSE_RADIUS);
    float shown = smoothstep(0.0, 0.2, since)
                * (1.0 - smoothstep(ECHO_GLYPH_DURATION * 0.45, ECHO_GLYPH_DURATION, since)) * range;
    reveal = max(reveal, shown);
    ignite = max(ignite, shown * exp(-since * 1.4));
  }
  float flicker = 0.85 + 0.15 * sin(uEchoTime * 11.0 + p.x * 0.7 + p.z * 0.5);
  return ECHO_PULSE_TINT * (front * 2.0 + lines * mask * (reveal * 0.55 + ignite * 1.6) * flicker);
}
`
