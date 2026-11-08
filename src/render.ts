import * as THREE from 'three';

/** Every camera shares these so the post passes can linearise depth without per-view uniforms. */
export const NEAR = 0.3;
export const FAR = 420;

export const SKY_TOP = 0x3f9cf0;
export const SKY_HORIZON = 0xd4ecf7;
export const SUN_DIRECTION = new THREE.Vector3(-30, 60, 20).normalize();
const BACKDROP = 0x2a2238;
const MAX_VIEWS = 4;
const BLOOM_LEVELS = 4;

const fullscreenVertex = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

/** Shared GLSL: which split-screen view a pixel belongs to, and its view-space position from depth. */
const viewHelpers = /* glsl */ `
uniform sampler2D tDepth;
uniform vec2 depthTexel;
uniform vec4 views[${MAX_VIEWS}];
uniform vec2 projections[${MAX_VIEWS}];
uniform int viewCount;

float linearDepth(float d) {
  return ${(NEAR * FAR).toFixed(3)} / (${FAR.toFixed(3)} - d * ${(FAR - NEAR).toFixed(3)});
}

int viewAt(vec2 uv) {
  for (int i = 0; i < ${MAX_VIEWS}; i++) {
    if (i >= viewCount) break;
    vec4 v = views[i];
    if (uv.x >= v.x && uv.y >= v.y && uv.x <= v.x + v.z && uv.y <= v.y + v.w) return i;
  }
  return -1;
}

vec3 viewPosition(vec2 uv, vec4 view, vec2 projection) {
  // Snap to a depth texel centre. Half-resolution pixels sit exactly on texel edges, so bias the rounding to
  // stop it flipping between neighbours and striping flat ground.
  uv = (floor(uv / depthTexel + 0.25) + 0.5) * depthTexel;
  float z = linearDepth(texture2D(tDepth, uv).x);
  vec2 ndc = (uv - view.xy) / view.zw * 2.0 - 1.0;
  return vec3(ndc * projection * z, -z);
}`;

const aoFragment = /* glsl */ `
${viewHelpers}
uniform vec2 texel;
varying vec2 vUv;

const int SAMPLES = 16;
const float RADIUS = 1.1;

void main() {
  int vi = viewAt(vUv);
  float d = texture2D(tDepth, vUv).x;
  if (vi < 0 || d >= 1.0) { gl_FragColor = vec4(1.0); return; }
  vec4 view = views[vi];
  vec2 projection = projections[vi];
  vec3 p = viewPosition(vUv, view, projection);

  // Reconstruct the normal from whichever neighbours sit on the same surface, so silhouettes stay crisp.
  vec3 pr = viewPosition(vUv + vec2(texel.x, 0.0), view, projection);
  vec3 pl = viewPosition(vUv - vec2(texel.x, 0.0), view, projection);
  vec3 pu = viewPosition(vUv + vec2(0.0, texel.y), view, projection);
  vec3 pd = viewPosition(vUv - vec2(0.0, texel.y), view, projection);
  vec3 dx = abs(pr.z - p.z) < abs(p.z - pl.z) ? pr - p : p - pl;
  vec3 dy = abs(pu.z - p.z) < abs(p.z - pd.z) ? pu - p : p - pd;
  vec3 n = normalize(cross(dx, dy));

  float z = -p.z;
  vec2 radiusUv = RADIUS / (z * projection) * 0.5 * view.zw;
  // Cap the footprint up close, where a metre-wide disc would cover half the screen.
  radiusUv *= min(1.0, 0.12 / max(radiusUv.x, radiusUv.y));
  float noise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))) * 6.2831853;

  float occlusion = 0.0;
  for (int i = 0; i < SAMPLES; i++) {
    float t = (float(i) + 0.5) / float(SAMPLES);
    float angle = float(i) * 2.39996 + noise;
    vec2 suv = clamp(vUv + vec2(cos(angle), sin(angle)) * radiusUv * t, view.xy, view.xy + view.zw);
    vec3 v = viewPosition(suv, view, projection) - p;
    float vv = dot(v, v);
    float falloff = max(RADIUS * RADIUS - vv, 0.0);
    occlusion += falloff * falloff * falloff * max((dot(v, n) - 0.01 * z) / (vv + 0.02), 0.0);
  }
  float ao = max(0.0, 1.0 - occlusion * 1.4 * 5.0 / (pow(RADIUS, 6.0) * float(SAMPLES)));
  gl_FragColor = vec4(vec3(ao), 1.0);
}`;

// Dual-filter (Kawase) bloom: cheap, wide and smooth.
const bloomDownFragment = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 texel;
uniform float threshold;
varying vec2 vUv;
vec3 prefilter(vec3 c) {
  float b = max(c.r, max(c.g, c.b));
  float soft = clamp(b - threshold + 0.5, 0.0, 1.0);
  soft = soft * soft * 0.5;
  return c * max(soft, b - threshold) / max(b, 1e-4);
}
void main() {
  vec3 sum = texture2D(tInput, vUv).rgb * 4.0;
  sum += texture2D(tInput, vUv + texel * vec2(-1.0, -1.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(1.0, -1.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(-1.0, 1.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(1.0, 1.0)).rgb;
  vec3 c = sum / 8.0;
  gl_FragColor = vec4(threshold > 0.0 ? prefilter(c) : c, 1.0);
}`;

const bloomUpFragment = /* glsl */ `
uniform sampler2D tInput;
uniform sampler2D tAdd;
uniform vec2 texel;
varying vec2 vUv;
void main() {
  vec3 sum = texture2D(tInput, vUv + texel * vec2(-2.0, 0.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(2.0, 0.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(0.0, -2.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(0.0, 2.0)).rgb;
  sum += texture2D(tInput, vUv + texel * vec2(-1.0, 1.0)).rgb * 2.0;
  sum += texture2D(tInput, vUv + texel * vec2(1.0, 1.0)).rgb * 2.0;
  sum += texture2D(tInput, vUv + texel * vec2(-1.0, -1.0)).rgb * 2.0;
  sum += texture2D(tInput, vUv + texel * vec2(1.0, -1.0)).rgb * 2.0;
  gl_FragColor = vec4(sum / 12.0 + texture2D(tAdd, vUv).rgb, 1.0);
}`;

const compositeFragment = /* glsl */ `
${viewHelpers}
uniform sampler2D tColor;
uniform sampler2D tAO;
uniform sampler2D tBloom;
uniform vec2 aoTexel;
uniform float bloomStrength;
varying vec2 vUv;

void main() {
  vec3 col = texture2D(tColor, vUv).rgb;
  int vi = viewAt(vUv);

  // Depth-aware blur of the half-resolution AO so it doesn't bleed across silhouettes.
  float z = linearDepth(texture2D(tDepth, vUv).x);
  float ao = 0.0;
  float weight = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 uv = vUv + vec2(float(x), float(y)) * aoTexel;
      float sz = linearDepth(texture2D(tDepth, uv).x);
      float w = exp(-abs(sz - z) / z * 30.0) * (1.0 - 0.2 * float(abs(x) + abs(y)));
      ao += texture2D(tAO, uv).r * w;
      weight += w;
    }
  }
  ao = weight > 0.0 ? ao / weight : 1.0;
  col *= mix(0.35, 1.0, ao);

  col += texture2D(tBloom, vUv).rgb * bloomStrength;

  if (vi >= 0) {
    vec4 v = views[vi];
    vec2 local = (vUv - v.xy) / v.zw;
    float dist = length((local - 0.5) * vec2(1.0, 0.8));
    col *= 1.0 - 0.3 * smoothstep(0.4, 0.9, dist);
  }

  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  // Grade after tone mapping: a touch more saturation and violet in the deepest shadows.
  float luma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));
  gl_FragColor.rgb = mix(vec3(luma), gl_FragColor.rgb, 1.12);
  gl_FragColor.rgb += vec3(0.02, 0.0, 0.04) * (1.0 - smoothstep(0.0, 0.3, luma));
  #include <colorspace_fragment>
}`;

function pass(fragmentShader: string, uniforms: Record<string, THREE.IUniform>, toneMapped = false): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({ vertexShader: fullscreenVertex, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped });
}

function halfFloatTarget(): THREE.WebGLRenderTarget {
  return new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, depthBuffer: false });
}

/**
 * Renders every split-screen view into one multisampled target, then adds ambient occlusion, bloom, tone
 * mapping, a grade and a per-view vignette over the lot in screen space.
 */
export class Pipeline {
  private scene: THREE.WebGLRenderTarget;
  private ao = new THREE.WebGLRenderTarget(1, 1, { depthBuffer: false });
  private down = Array.from({ length: BLOOM_LEVELS }, halfFloatTarget);
  private up = Array.from({ length: BLOOM_LEVELS - 1 }, halfFloatTarget);
  private views = Array.from({ length: MAX_VIEWS }, () => new THREE.Vector4());
  private projections = Array.from({ length: MAX_VIEWS }, () => new THREE.Vector2());
  private viewCount = { value: 0 };
  private aoPass: THREE.ShaderMaterial;
  private downPass: THREE.ShaderMaterial;
  private upPass: THREE.ShaderMaterial;
  private composite: THREE.ShaderMaterial;
  private quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2));
  private quadCamera = new THREE.OrthographicCamera();
  private width = 1;
  private height = 1;

  constructor(private renderer: THREE.WebGLRenderer) {
    this.scene = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      samples: 4,
      depthTexture: new THREE.DepthTexture(1, 1, THREE.FloatType),
    });
    const shared = {
      tDepth: { value: this.scene.depthTexture },
      depthTexel: { value: new THREE.Vector2() },
      views: { value: this.views },
      projections: { value: this.projections },
      viewCount: this.viewCount,
    };
    this.aoPass = pass(aoFragment, { ...shared, texel: { value: new THREE.Vector2() } });
    this.downPass = pass(bloomDownFragment, { tInput: { value: null }, texel: { value: new THREE.Vector2() }, threshold: { value: 0 } });
    this.upPass = pass(bloomUpFragment, { tInput: { value: null }, tAdd: { value: null }, texel: { value: new THREE.Vector2() } });
    this.composite = pass(
      compositeFragment,
      {
        ...shared,
        tColor: { value: this.scene.texture },
        tAO: { value: this.ao.texture },
        tBloom: { value: this.up[0].texture },
        aoTexel: { value: new THREE.Vector2() },
        bloomStrength: { value: 0.35 },
      },
      true,
    );
    this.quad.frustumCulled = false;
  }

  setSize(width: number, height: number) {
    this.width = width;
    this.height = height;
    const ratio = this.renderer.getPixelRatio();
    const w = Math.round(width * ratio);
    const h = Math.round(height * ratio);
    this.scene.setSize(w, h);
    this.ao.setSize(Math.ceil(w / 2), Math.ceil(h / 2));
    this.aoPass.uniforms.texel.value.set(1 / w, 1 / h);
    this.aoPass.uniforms.depthTexel.value.set(1 / w, 1 / h);
    this.composite.uniforms.aoTexel.value.set(2 / w, 2 / h);
    this.down.forEach((t, i) => t.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
    this.up.forEach((t, i) => t.setSize(Math.max(1, w >> (i + 1)), Math.max(1, h >> (i + 1))));
  }

  begin() {
    this.viewCount.value = 0;
    this.scene.scissorTest = false;
    this.scene.viewport.set(0, 0, this.scene.width, this.scene.height);
    this.renderer.setRenderTarget(this.scene);
    this.renderer.setClearColor(BACKDROP);
    this.renderer.clear();
  }

  /** Restricts drawing to one view, given in CSS pixels from the top-left like the HUD. */
  view(x: number, y: number, w: number, h: number, camera: THREE.PerspectiveCamera) {
    const ratio = this.scene.width / this.width;
    const glY = this.height - y - h;
    this.scene.viewport.set(x * ratio, glY * ratio, w * ratio, h * ratio);
    this.scene.scissor.copy(this.scene.viewport);
    this.scene.scissorTest = true;
    this.renderer.setRenderTarget(this.scene);
    const i = this.viewCount.value;
    if (i < MAX_VIEWS) {
      this.views[i].set(x / this.width, glY / this.height, w / this.width, h / this.height);
      const tanHalf = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
      this.projections[i].set(tanHalf * (w / h), tanHalf);
      this.viewCount.value++;
    }
  }

  end() {
    this.scene.scissorTest = false;
    this.draw(this.aoPass, this.ao);

    let input: THREE.Texture = this.scene.texture;
    this.down.forEach((target, i) => {
      this.downPass.uniforms.tInput.value = input;
      this.downPass.uniforms.texel.value.set(1 / (target.width * 2), 1 / (target.height * 2));
      this.downPass.uniforms.threshold.value = i === 0 ? 0.85 : 0;
      this.draw(this.downPass, target);
      input = target.texture;
    });
    for (let i = this.up.length - 1; i >= 0; i--) {
      const target = this.up[i];
      this.upPass.uniforms.tInput.value = input;
      this.upPass.uniforms.tAdd.value = this.down[i].texture;
      this.upPass.uniforms.texel.value.set(0.5 / target.width, 0.5 / target.height);
      this.draw(this.upPass, target);
      input = target.texture;
    }

    this.draw(this.composite, null);
  }

  private draw(material: THREE.Material, target: THREE.WebGLRenderTarget | null) {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.quadCamera);
  }
}

function skyMaterial(below: number): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(SKY_TOP) },
      horizon: { value: new THREE.Color(SKY_HORIZON) },
      below: { value: new THREE.Color(below) },
      sun: { value: SUN_DIRECTION },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
        gl_Position = p.xyww;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 below;
      uniform vec3 sun;
      varying vec3 vDir;
      void main() {
        vec3 dir = normalize(vDir);
        vec3 col = mix(horizon, top, pow(smoothstep(0.0, 0.8, dir.y), 0.6));
        col = mix(col, below, smoothstep(0.0, -0.15, dir.y));
        float glow = max(dot(dir, sun), 0.0);
        col += vec3(1.0, 0.85, 0.6) * (pow(glow, 10.0) * 0.4 + smoothstep(0.9975, 0.998, glow) * 3.0);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  });
}

/** A gradient dome drawn at infinity, so it never needs to follow the camera. */
export function createSky(): THREE.Mesh {
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial(SKY_HORIZON));
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}

/** Image-based ambient light from the same sky, with warm bounce light from the streets below. */
export function createEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  scene.add(new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), skyMaterial(0xb8a48c)));
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  return env;
}
