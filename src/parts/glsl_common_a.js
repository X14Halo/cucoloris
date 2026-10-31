const COMMON = HEAD + `
out vec4 fragColor;
uniform vec2 uRes;

uint hashu(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
uint hash3(ivec3 c, uint s){
  return hashu(uint(c.x + 65536) * 0x8da6b343u + hashu(uint(c.y + 65536) * 0xd8163841u + hashu(uint(c.z + 65536) * 0xcb1ab31fu + s)));
}
float rnd(ivec3 c, uint s){ return float(hash3(c, s) >> 8u) * (1.0 / 16777216.0); }
int wrap1(int c, int p){ return c - p * int(floor(float(c) / float(p))); }
// Reduce an integer lattice point modulo the period lattice spanned by A and B.
ivec2 wrapL(ivec2 c, ivec2 A, ivec2 B){
  float det = float(A.x * B.y - A.y * B.x);
  float a = floor(float(c.x * B.y - c.y * B.x) / det);
  float b = floor(float(A.x * c.y - A.y * c.x) / det);
  return c - int(a) * A - int(b) * B;
}
vec2 grad2(ivec2 c, uint s){ float a = float(hash3(ivec3(c, 0), s)) * (TAU / 4294967296.0); return vec2(cos(a), sin(a)); }
float pn2(vec2 q, ivec2 A, ivec2 B, uint s){
  vec2 i = floor(q), f = q - i; ivec2 c = ivec2(i);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(grad2(wrapL(c, A, B), s), f);
  float b = dot(grad2(wrapL(c + ivec2(1, 0), A, B), s), f - vec2(1, 0));
  float d = dot(grad2(wrapL(c + ivec2(0, 1), A, B), s), f - vec2(0, 1));
  float e = dot(grad2(wrapL(c + ivec2(1, 1), A, B), s), f - vec2(1, 1));
  return mix(mix(a, b, u.x), mix(d, e, u.x), u.y) * 1.414;
}
float pn2f(vec2 uv, int F, uint s){ return pn2(uv * float(F), ivec2(F, 0), ivec2(0, F), s); }
float fbm2(vec2 uv, int F, int oct, uint s){
  float v = 0.0, a = 0.5, n = 0.0;
  for (int o = 0; o < 8; o++){ if (o >= oct) break; v += a * pn2f(uv, F << o, s + uint(o) * 101u); n += a; a *= 0.5; }
  return v / n;
}
vec3 grad3(ivec2 c, int z, uint s){
  uint h = hash3(ivec3(c, z), s);
  float zz = float(h & 0xFFFFu) * (2.0 / 65535.0) - 1.0;
  float a = float(h >> 16u) * (TAU / 65536.0);
  float r = sqrt(max(0.0, 1.0 - zz * zz));
  return vec3(r * cos(a), r * sin(a), zz);
}
float pn3(vec3 q, ivec2 A, ivec2 B, int P, uint s){
  vec3 i = floor(q), f = q - i; ivec2 c = ivec2(i.xy); int cz = int(i.z);
  vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  ivec2 c00 = wrapL(c, A, B), c10 = wrapL(c + ivec2(1, 0), A, B), c01 = wrapL(c + ivec2(0, 1), A, B), c11 = wrapL(c + ivec2(1, 1), A, B);
  int z0 = wrap1(cz, P), z1 = wrap1(cz + 1, P);
  float n000 = dot(grad3(c00, z0, s), f);
  float n100 = dot(grad3(c10, z0, s), f - vec3(1, 0, 0));
  float n010 = dot(grad3(c01, z0, s), f - vec3(0, 1, 0));
  float n110 = dot(grad3(c11, z0, s), f - vec3(1, 1, 0));
  float n001 = dot(grad3(c00, z1, s), f - vec3(0, 0, 1));
  float n101 = dot(grad3(c10, z1, s), f - vec3(1, 0, 1));
  float n011 = dot(grad3(c01, z1, s), f - vec3(0, 1, 1));
  float n111 = dot(grad3(c11, z1, s), f - vec3(1, 1, 1));
  return mix(mix(mix(n000, n100, u.x), mix(n010, n110, u.x), u.y),
             mix(mix(n001, n101, u.x), mix(n011, n111, u.x), u.y), u.z) * 1.25;
}
`;
