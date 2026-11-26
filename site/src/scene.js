
const surface = document.querySelector('[data-scene]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
if (surface && !reduced.matches) {
  const begin = () => import('./vendor/three.module.min.js').then(run).catch(() => {});
  if ('requestIdleCallback' in window) requestIdleCallback(begin, { timeout: 900 });
  else setTimeout(begin, 150);
}

export const river = [[-3.15,1.32],[-2.7,1.55],[-2.12,1.32],[-1.7,.74],[-2.12,.13],[-1.68,-.36],[-.95,-.1],[-.53,.62],[-.06,1.02],[.52,.78],[.71,.17],[.38,-.4],[.63,-1.18],[1.38,-1.42],[1.9,-.85],[1.85,-.13],[2.38,.26],[3.06,.06]];
function run(THREE) {
  if (reduced.matches) return;
  const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'low-power' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  const camera = new THREE.PerspectiveCamera(39, 1, .1, 50);
  const scene = new THREE.Scene();
  const track = new THREE.CatmullRomCurve3(river.map(([x,y]) => new THREE.Vector3(x,y,0)));
  const size = 2600;
  const points = new Float32Array(size * 3);
  const network = new Float32Array(size * 3);
  const stream = new Float32Array(size * 3);
  const colours = new Float32Array(size * 3);
  const geometry = new THREE.BufferGeometry();
  const tone = new THREE.Color();
  for (let i = 0; i < size; i++) {
    const angle = i * 2.399963;
    const y = 1 - (2 * i + 1) / size;
    const ring = Math.sqrt(1-y*y);
    const radius = 1.6 + .25 * Math.sin(angle * 3 + y * 6) + Math.random() * .33;
    const index = i * 3;
    network[index] = Math.cos(angle) * ring * radius * 1.37;
    network[index + 1] = y * radius;
    network[index + 2] = Math.sin(angle) * ring * radius;
    const p = track.getPoint(i / (size - 1));
    stream[index] = p.x + (Math.random() - .5) * .24;
    stream[index + 1] = p.y + (Math.random() - .5) * .3;
    stream[index + 2] = (Math.random() - .5) * .48;
    tone.setHSL(.22 + .14 * Math.random(), .68, .43 + .43 * Math.random()).toArray(colours, index);
  }
  geometry.setAttribute('position', new THREE.BufferAttribute(points, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
  const material = new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, blending:THREE.AdditiveBlending, vertexColors:true,
    vertexShader:`varying vec3 shade; uniform float density; void main(){shade=color;vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(31.*density/-p.z,1.4,7.);}`,
    fragmentShader:`varying vec3 shade;void main(){float r=length(gl_PointCoord-.5);float a=1.-smoothstep(.11,.5,r);gl_FragColor=vec4(shade,a*.72);}`,
    uniforms:{ density:{ value:renderer.getPixelRatio() } }
  });
  const shape = new THREE.Points(geometry, material);
  shape.frustumCulled = false;
  scene.add(shape);
  const controls = surface.querySelector('.scene-controls');
  const pause = surface.querySelector('[data-pause]');
  const poster = surface.querySelector('.poster');
  const pauseLabel = pause.textContent;
  const canvas = renderer.domElement;
  canvas.setAttribute('aria-hidden','true');
  let view = 0, morph = 0, spin = 0, twist = 0, startX, visible = true, paused = false, frame = 0, manual = false;
  function draw() {
    frame = 0;
    morph += (view-morph) * (paused ? 1 : .075);
    if (!paused) spin += .004;
    for (let i = 0; i < points.length; i++) points[i] = network[i] + (stream[i] - network[i]) * morph;
    shape.rotation.y = (spin * (1-morph) + twist) % (Math.PI * 2);
    shape.rotation.x = .15 * (1-morph);
    geometry.attributes.position.needsUpdate = true;
    renderer.render(scene, camera);
    if (!paused) schedule();
  }
  function schedule() {
    if (!frame && visible && !document.hidden && !reduced.matches) frame = requestAnimationFrame(draw);
  }
  function resize() {
    const { clientWidth: width, clientHeight: height } = surface;
    camera.aspect = width / height;
    camera.position.z = Math.max(7, 9.9 / camera.aspect);
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    schedule();
  }
  canvas.addEventListener('pointerdown', e => { startX = e.clientX; canvas.setPointerCapture(e.pointerId); });
  canvas.addEventListener('pointermove', e => {
    if (startX === undefined) return;
    twist += (e.clientX - startX) * .009;
    startX = e.clientX;
    schedule();
  });
  for (const name of ['pointerup','pointercancel','lostpointercapture']) canvas.addEventListener(name, () => { startX = undefined; });
  surface.querySelector('[data-morph]').addEventListener('click', () => { manual = true; view = view ? 0 : 1; twist = 0; schedule(); });
  pause.addEventListener('click', () => {
    paused = !paused;
    pause.textContent = paused ? pause.dataset.resumeLabel : pauseLabel;
    if (paused) { cancelAnimationFrame(frame); frame = 0; }
    else schedule();
  });
  addEventListener('scroll', () => {
    if (!manual && !paused) view = scrollY > surface.offsetHeight * .24 ? 1 : 0;
  }, { passive: true });
  new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; schedule(); }).observe(surface);
  new ResizeObserver(resize).observe(surface);
  document.addEventListener('visibilitychange', schedule);
  reduced.addEventListener('change', () => {
    canvas.hidden = controls.hidden = reduced.matches;
    poster.hidden = !reduced.matches;
    schedule();
  });
  canvas.addEventListener('webglcontextlost', () => {
    visible = false;
    canvas.hidden = controls.hidden = true;
    poster.hidden = false;
  });
  surface.append(canvas);
  resize();
  draw();
  poster.hidden = true;
  controls.hidden = false;
}

