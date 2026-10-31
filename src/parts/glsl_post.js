/* ---------- Output levels and display ---------- */
const FS_POST = COMMON + `
uniform sampler2D uSrc; uniform float uExpo, uRoll, uBlack, uWhite, uGamma, uContrast, uFloor; uniform int uInv;
void main(){
  vec3 v = texture(uSrc, gl_FragCoord.xy / uRes).rgb * exp2(uExpo);
  float k = uRoll * 2.0;
  v = v * (1.0 + k) / (1.0 + v * k);   // 1 stays 1, peaks compress toward (1+k)/k
  v = clamp((v - uBlack) / max(uWhite - uBlack, 1e-4), 0.0, 1.0);
  v = pow(v, vec3(1.0 / uGamma));
  v = mix(v, v * v * (3.0 - 2.0 * v), uContrast);
  v = uFloor + (1.0 - uFloor) * v;
  if (uInv == 1) v = 1.0 - v;
  fragColor = vec4(v, 1.0);
}`;
const FS_DISP = COMMON + `
uniform sampler2D uSrc; uniform float uTiles; uniform int uHeat, uSeams;
vec3 turbo(float x){
  x = clamp(x, 0.0, 1.0); vec4 v4 = vec4(1.0, x, x * x, x * x * x); vec2 v2 = v4.zw * v4.z;
  return vec3(dot(v4, vec4(0.13572138, 4.61539260, -42.66032258, 132.13108234)) + dot(v2, vec2(-152.94239396, 59.28637943)),
              dot(v4, vec4(0.09140261, 2.19418839, 4.84296658, -14.18503333)) + dot(v2, vec2(4.27729857, 2.82956604)),
              dot(v4, vec4(0.10667330, 12.64194608, -60.58204836, 110.36276771)) + dot(v2, vec2(-89.90310912, 27.34824973)));
}
void main(){
  vec2 uv = gl_FragCoord.xy / uRes * uTiles;
  vec3 c = texture(uSrc, uv).rgb;
  if (uHeat == 1) c = turbo(dot(c, vec3(0.2126, 0.7152, 0.0722)));
  if (uSeams == 1 && uTiles > 1.0){
    vec2 f = abs(fract(uv + 0.5) - 0.5) / fwidth(uv);
    float l = 1.0 - clamp(min(f.x, f.y) - 0.5, 0.0, 1.0);
    c = mix(c, vec3(0.94, 0.70, 0.37), l * 0.8);
  }
  fragColor = vec4(c, 1.0);
}`;