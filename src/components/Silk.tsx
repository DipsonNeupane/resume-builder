import { useEffect, useRef } from 'react';

// Copper silk on carbon for the public landing hero (approved in
// experiments/patina). The folding technique (iterated cosine domain warp,
// a light fbm warp on top, fine grain) is adapted from the 21st.dev Shader
// Builder "Silk" background; the palette, the diagonal band that keeps the
// silk away from the headline, the ridge sheen and the petrol shadows are
// Patina's own. One fragment pass, rendered at reduced resolution because the
// field is smooth, paused offscreen and in background tabs, and frozen on a
// single frame for reduced motion.

const VERT = `attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}`;

const FRAG = `
precision highp float;
uniform vec3 u_s;   // resolution.xy, time
uniform vec4 u_p;   // pointer.xy, band offset, intensity
uniform vec2 u_dir; // band direction tweak (x slope, y offset)
// Colorway: base, shadow folds, deep fold, body, sheen; shadow strength.
uniform vec3 u_c0; uniform vec3 u_c1; uniform vec3 u_c2; uniform vec3 u_c3; uniform vec3 u_c4;
uniform float u_amt;

float h21(vec2 p){ p=fract(p*vec2(234.34,435.345)); p+=dot(p,p+34.23); return fract(p.x*p.y); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),u.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),u.x),u.y); }
float fbm(vec2 p){ float v=0., a=.5; for(int i=0;i<4;i++){ v+=a*n2(p); p=p*2.03+vec2(17.,9.2); a*=.5; } return v; }
float grain(vec2 p){ vec3 q=fract(vec3(p.xyx)*.1031); q+=dot(q,q.yzx+33.33); return fract((q.x+q.y)*q.z); }

float field(vec2 p, float T){
  vec2 q = p*1.25;
  for(float i=1.;i<5.;i+=1.){
    q.x += .62/i*cos(i*2.05*q.y + T*1.1 + i*1.7);
    q.y += .48/i*cos(i*1.55*q.x - T*.8);
  }
  q += .42*(vec2(fbm(p*1.3+T*.18), fbm(p*1.3+vec2(5.2,1.3)-T*.14))-.5);
  return sin(q.x*1.15 + q.y*.85);
}

void main(){
  vec2 r = u_s.xy;
  vec2 uv = gl_FragCoord.xy/r;
  vec2 p = (gl_FragCoord.xy-.5*r)/min(r.x,r.y);
  p += u_p.xy*.035;
  float T = u_s.z*.11;
  vec2 rp = mat2(.84,-.54,.54,.84)*p;

  float s = field(rp, T);
  // Finite difference for a sheen that runs along the folds.
  float s2 = field(rp+vec2(.006,.004), T);
  float slope = clamp((s2-s)*38., -1., 1.);

  float fold = .5+.5*s;
  // The silk lives on a sweeping diagonal band, so type stays on dark ground.
  float d = p.y + p.x*u_dir.x + u_dir.y + u_p.z;
  float band = exp(-pow(d*1.7, 2.)) * u_p.w;
  float wide = exp(-pow(d*.8, 2.));

  vec3 carbon = u_c0;
  vec3 petrol = u_c1;
  vec3 rust   = u_c2;
  vec3 copper = u_c3;
  vec3 ember  = u_c4;

  vec3 col = carbon;
  // Petrol breathes in the deep shadows, never as a hue of its own.
  col = mix(col, petrol, (1.-fold)*wide*u_amt*smoothstep(-.2,.8,uv.x));
  col = mix(col, rust, smoothstep(.2,1.,fold)*band*.9);
  col = mix(col, copper, pow(smoothstep(.35,1.,fold),2.2)*band*.95);
  float sheen = pow(max(slope,0.),3.)*smoothstep(.45,1.,fold);
  col += ember*sheen*band*.55;
  col += ember*pow(fold,14.)*band*.22;

  float vd = length(uv-.5)*1.3;
  col *= 1.-.55*smoothstep(.45,1.1,vd);
  col += (grain(gl_FragCoord.xy)-.5)*.035;
  gl_FragColor = vec4(clamp(col,0.,1.),1.);
}
`;

const pendingRelease = new WeakMap<HTMLCanvasElement, number>();

type Props = {
 className?: string;
 /** Moves the band along its normal; lets each section frame it differently. */
 offset?: number;
 slope?: number;
 lift?: number;
 intensity?: number;
};

export function Silk({ className, offset = 0, slope = -0.6, lift = 0.08, intensity = 1 }: Props) {
 const ref = useRef<HTMLCanvasElement>(null);

 useEffect(() => {
  const canvas = ref.current;
  if (!canvas) return;
  // StrictMode remounts immediately; only release the GPU context if it stays unmounted.
  const pending = pendingRelease.get(canvas);
  if (pending !== undefined) { window.clearTimeout(pending); pendingRelease.delete(canvas); }
  const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
  if (!gl) return;
  const sh = (type: number, src: string) => {
   const s = gl.createShader(type)!;
   gl.shaderSource(s, src);
   gl.compileShader(s);
   if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
   return s;
  };
  const prog = gl.createProgram()!;
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const uS = gl.getUniformLocation(prog, 'u_s');
  const uP = gl.getUniformLocation(prog, 'u_p');
  const uD = gl.getUniformLocation(prog, 'u_dir');
  const uC = [0, 1, 2, 3, 4].map((i) => gl.getUniformLocation(prog, `u_c${i}`));
  const uA = gl.getUniformLocation(prog, 'u_amt');
  // The approved Patina silk: carbon base, petrol shadow folds, rust, copper, ember sheen.
  const tone = [[0x0b, 0x0a, 0x09], [0x04, 0x1b, 0x1e], [0x66, 0x21, 0x0d], [0xe2, 0x7d, 0x3c], [0xff, 0xd2, 0x9a]];
  tone.forEach(([r, g, b], i) => gl.uniform3f(uC[i], r / 255, g / 255, b / 255));
  gl.uniform1f(uA, 0.55);

  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let raf = 0;
  let onScreen = true;
  let tab = document.visibilityState === 'visible';
  let px = 0, py = 0, tx = 0, ty = 0;
  const t0 = performance.now();

  const size = () => {
   const b = canvas.getBoundingClientRect();
   // Smooth field: half resolution is indistinguishable and far cheaper.
   const s = Math.min(window.devicePixelRatio || 1, 2) * 0.5;
   const w = Math.max(1, Math.round(b.width * s));
   const h = Math.max(1, Math.round(b.height * s));
   if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
   }
  };

  const frame = (now: number) => {
   raf = 0;
   size();
   px += (tx - px) * 0.04;
   py += (ty - py) * 0.04;
   // Five seconds establishes the atmosphere, then the field freezes. Pointer
   // response can still redraw it without leaving a decorative loop running forever.
   const elapsed = Math.min((now - t0) / 1000, 5);
   const t = reduced ? 14 : elapsed + 14;
   gl.uniform3f(uS, canvas.width, canvas.height, t);
   gl.uniform4f(uP, px, py, offset, intensity);
   gl.uniform2f(uD, slope, lift);
   gl.drawArrays(gl.TRIANGLES, 0, 3);
   if (!reduced && (elapsed < 5 || Math.abs(tx - px) > 0.001 || Math.abs(ty - py) > 0.001)) kick();
  };
  const kick = () => { if (!raf && onScreen && tab) raf = requestAnimationFrame(frame); };

  const io = new IntersectionObserver(([e]) => { onScreen = e?.isIntersecting ?? true; kick(); });
  io.observe(canvas);
  const onVis = () => { tab = document.visibilityState === 'visible'; kick(); };
  document.addEventListener('visibilitychange', onVis);
  const onMove = (e: PointerEvent) => {
   tx = (e.clientX / window.innerWidth) * 2 - 1;
   ty = -((e.clientY / window.innerHeight) * 2 - 1);
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  const ro = new ResizeObserver(() => { size(); if (reduced) raf = requestAnimationFrame(frame); });
  ro.observe(canvas);
  kick();

  return () => {
   cancelAnimationFrame(raf);
   io.disconnect();
   ro.disconnect();
   document.removeEventListener('visibilitychange', onVis);
   window.removeEventListener('pointermove', onMove);
   gl.deleteBuffer(buf);
   gl.deleteProgram(prog);
   pendingRelease.set(canvas, window.setTimeout(() => { pendingRelease.delete(canvas); gl.getExtension('WEBGL_lose_context')?.loseContext(); }, 0));
  };
 }, [offset, slope, lift, intensity]);

 return <canvas ref={ref} className={className} aria-hidden="true" />;
}
