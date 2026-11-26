export const river = [[-3.15,1.32],[-2.7,1.55],[-2.12,1.32],[-1.7,.74],[-2.12,.13],[-1.68,-.36],[-.95,-.1],[-.53,.62],[-.06,1.02],[.52,.78],[.71,.17],[.38,-.4],[.63,-1.18],[1.38,-1.42],[1.9,-.85],[1.85,-.13],[2.38,.26],[3.06,.06]];

const hero = document.querySelector('[data-scene]');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const forced = matchMedia('(forced-colors: active)');
const coarse = matchMedia('(pointer:coarse)');
const root = document.documentElement;
const canvas = document.createElement('canvas');
const options = { antialias: false, alpha: false, powerPreference: 'high-performance' };

if (hero && !reduced.matches && !forced.matches && !navigator.connection?.saveData && !(navigator.deviceMemory < 2)) {
  const start = () => {
    const context = canvas.getContext('webgl2', options);
    if (context) import('./vendor/three.module.min.js').then(THREE => {
      if (!reduced.matches && !forced.matches) run(THREE, context);
    }).catch(() => {});
  };
  // Let the poster and HTML copy paint before allocating the WebGL context.
  requestAnimationFrame(() => requestAnimationFrame(() => {
    setTimeout(() => {
      if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 900 });
      else start();
    }, coarse.matches ? 1550 : 250);
  }));
}

const hash = `
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float noise(vec2 p){
  vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);
}`;
const quadVertex = 'varying vec2 uv0; void main(){uv0=uv;gl_Position=vec4(position.xy,0.,1.);}';
const skyFragment = `
varying vec2 uv0; uniform float time;
${hash}
void main(){
  vec2 uv=uv0;
  vec3 sky=mix(vec3(.075,.137,.227),vec3(.11,.19,.32),smoothstep(.24,.95,uv.y));
  float glow=exp(-11.*abs(uv.y-.19-.04*sin(uv.x*4.)));
  sky+=vec3(.48,.25,.10)*glow*(.5+.5*uv.x);
  sky+=vec3(.19,.12,.35)*exp(-8.*abs(uv.y-.1))*(1.-uv.x);
  float cloud=noise(uv*vec2(5.,26.)+vec2(time*.022,0.))+.5*noise(uv*vec2(10.,52.));
  gl_FragColor=vec4(sky+glow*(cloud-.73)*.22,1.);
}`;
const blurFragment = `
varying vec2 uv0;uniform sampler2D source;uniform vec2 delta;uniform float up;
void main(){
  vec3 sum=texture2D(source,uv0).rgb*4.;
  sum+=texture2D(source,uv0+delta).rgb+texture2D(source,uv0-delta).rgb;
  sum+=texture2D(source,uv0+vec2(delta.x,-delta.y)).rgb+texture2D(source,uv0+vec2(-delta.x,delta.y)).rgb;
  if(up>.5){
    sum+=texture2D(source,uv0+vec2(delta.x*2.,0.)).rgb+texture2D(source,uv0-vec2(delta.x*2.,0.)).rgb;
    sum+=texture2D(source,uv0+vec2(0.,delta.y*2.)).rgb+texture2D(source,uv0-vec2(0.,delta.y*2.)).rgb;
  }
  gl_FragColor=vec4(sum/(8.+4.*up),1.);
}`;
const maskFragment = `
varying vec2 uv0;uniform sampler2D previous;uniform vec4 strokes[8];
uniform float aspect,decay;
void main(){
  float mask=texture2D(previous,uv0).r;
  mask=max(0.,mask*decay-.00196);
  vec2 ratio=vec2(aspect,1.);
  for(int i=0;i<8;i++){
    vec4 s=strokes[i];
    vec2 a=(uv0-s.xy)*ratio, b=(s.zw-s.xy)*ratio;
    float d=length(a-b*clamp(dot(a,b)/max(dot(b,b),.000001),0.,1.));
    float radius=i<2?.055:.012;
    mask=max(mask,1.-smoothstep(radius*.52,radius,d));
  }
  gl_FragColor=vec4(mask,0.,0.,1.);
}`;
const glassFragment = `
varying vec2 uv0;
uniform sampler2D sharp,soft,wipe,letters;
uniform vec2 resolution;
uniform float time,layers,fog,hold,writing,breath;
${hash}
vec3 drop(vec2 uv,float scale,float bias){
  vec2 grid=uv*scale, cell=floor(grid);
  float random=hash(cell+bias);
  vec2 middle=.25+.5*vec2(hash(cell+17.),hash(cell+51.));
  vec2 p=(fract(grid)-middle)*vec2(1.,.88);
  float radius=mix(.075,.27,pow(random,2.));
  radius*=smoothstep(.19,.57,hash(cell-6.));
  float d=length(p);
  float lens=1.-smoothstep(radius*.85,radius+.025,d);
  float edge=1.-smoothstep(.008,.048,abs(d-radius));
  float shine=edge*smoothstep(-.04,.12,p.y-p.x*.42);
  return vec3(p*lens*2.,lens*.41+shine*.65);
}
void main(){
  vec2 uv=uv0;
  vec2 asp=vec2(resolution.x/resolution.y,1.);
  vec3 drops=drop(uv*asp+vec2(0.,time*.00018),38.,3.);
  if(layers>1.5) drops+=drop(uv*asp,90.,60.)*.65;
  float hand=texture2D(wipe,uv).r*(1.-breath);
  float text=texture2D(letters,uv).r*hold*smoothstep(uv.x,uv.x+.04,writing-max(0.,.68-uv.y)*.17);
  float clear=smoothstep(.15,.85,max(text,hand));
  vec2 distortion=drops.xy*.018*(1.-clear*.78);
  vec3 scene=texture2D(sharp,uv+distortion).rgb;
  vec3 blurry=texture2D(soft,uv+distortion*1.6).rgb;
  vec3 tint=vec3(.914,.933,.925)-.024*noise(uv*vec2(9.,6.))-.025*noise(uv*vec2(2.,5.));
  vec3 color=mix(mix(blurry,tint,fog),scene,clear);
  color+=drops.z*.075;
  color=mix(color,scene,drops.z*.51*(1.-clear));
  color*=1.-.065*length(uv-.5);
  color+=(hash(floor(uv*resolution))-.5)*.025;
  gl_FragColor=vec4(color,1.);
}`;

function run(T, context) {
  const touch = coarse.matches;
  const renderer = new T.WebGLRenderer({ ...options, canvas, context });
  const resources = [];
  const keep = value => (resources.push(value), value);
  renderer.setPixelRatio(touch ? 1 : Math.min(devicePixelRatio, 1.5));
  renderer.autoClear = false;
  canvas.setAttribute('aria-hidden', 'true');
  canvas.tabIndex = -1;
  hero.prepend(canvas);

  const quadCamera = new T.Camera();
  const quadScene = new T.Scene();
  const world = new T.Scene();
  const camera = new T.PerspectiveCamera(35, 1, .1, 50);
  camera.position.z = 6.5;
  const triangle = keep(new T.BufferGeometry());
  triangle.setAttribute('position', new T.Float32BufferAttribute([-1,-1,0,3,-1,0,-1,3,0], 3));
  triangle.setAttribute('uv', new T.Float32BufferAttribute([0,0,2,0,0,2], 2));
  const quad = new T.Mesh(triangle);
  quad.frustumCulled = false;
  quadScene.add(quad);

  const uniforms = values => Object.fromEntries(Object.entries(values).map(([name, value]) => [name, { value }]));
  const material = (fragmentShader, values) => keep(new T.ShaderMaterial({
    vertexShader: quadVertex, fragmentShader, uniforms: uniforms(values), depthTest: false, depthWrite: false
  }));
  const target = (size, extra = {}) => keep(new T.WebGLRenderTarget(size, size, { depthBuffer: false, ...extra }));
  const type = context.getExtension('EXT_color_buffer_float') ? T.HalfFloatType : T.UnsignedByteType;
  const sharp = target(1, { type });
  const soft = target(1, { type });
  const scratch = target(1, { type });
  const maskType = { format: T.RedFormat, type: T.UnsignedByteType };
  let mask = target(touch ? 256 : 512, maskType);
  let previous = target(touch ? 256 : 512, maskType);
  const sky = material(skyFragment, { time: 0 });
  const blur = material(blurFragment, { source: null, delta: new T.Vector2(), up: 0 });
  const strokes = Array.from({ length: 8 }, () => new T.Vector4(-9,-9,-9,-9));
  const wipe = material(maskFragment, { previous: null, aspect: 1, strokes, decay: .992 });
  const textCanvas = document.createElement('canvas');
  const text = keep(new T.CanvasTexture(textCanvas));
  const screen = material(glassFragment, {
    sharp: sharp.texture, soft: soft.texture, wipe: mask.texture, letters: text,
    resolution: new T.Vector2(), time: 0, layers: touch ? 1 : 2, fog: .86, hold: 0, writing: 0, breath: 0
  });

  const curve = new T.CatmullRomCurve3(river.map(([x,y]) => new T.Vector3(x,y,0)));
  const curveData = new Float32Array(256 * 4);
  for (let i = 0; i < 256; i++) {
    const point = curve.getPoint(i / 255);
    curveData.set([point.x, point.y, point.z, 1], i * 4);
  }
  const path = keep(new T.DataTexture(curveData, 256, 1, T.RGBAFormat, T.FloatType));
  path.needsUpdate = true;

  function points(count, bokeh) {
    const position = new Float32Array(count * 3);
    const seed = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      seed[i] = Math.random();
      position.set(bokeh ? [(Math.random()-.5)*22,(Math.random()-.5)*9,i%2 && !touch ? -7 : -4] :
        [(Math.random()-.5)*.21,(Math.random()-.5)*.21,(Math.random()-.5)*.44], i*3);
    }
    const geometry = keep(new T.BufferGeometry());
    geometry.setAttribute('position', new T.BufferAttribute(position, 3));
    geometry.setAttribute('seed', new T.BufferAttribute(seed, 1));
    const shader = keep(new T.ShaderMaterial({
      transparent: true, blending: T.AdditiveBlending, depthTest: false, depthWrite: false,
      uniforms: uniforms({ path, time: 0, morph: 0, pixel: 1 }),
      defines: bokeh ? { BOKEH: 1 } : {},
      vertexShader: `
        uniform sampler2D path;uniform float time,morph,pixel;attribute float seed;varying float hue;
        vec3 samplePath(float s){
          float i=s*255.;vec3 a=texture2D(path,vec2((floor(i)+.5)/256.,.5)).xyz;
          vec3 b=texture2D(path,vec2((min(255.,floor(i)+1.)+.5)/256.,.5)).xyz;
          return mix(a,b,fract(i));
        }
        void main(){
          hue=seed;
          #ifdef BOKEH
          vec3 p=position+vec3(.1*sin(time*.24+seed*20.),.1*cos(time*.15+seed*14.),0.);
          gl_PointSize=(8.+20.*seed)*pixel;
          #else
          float t=fract(seed+time*.012);
          vec3 stream=samplePath(t)*vec3(1.2,.73,1.)+vec3(.3,-.35,-.25)+position;
          float z=2.*seed-1.,a=seed*21085.;float rad=sqrt(max(0.,1.-z*z));
          vec3 network=vec3(rad*cos(a),rad*sin(a),z)*1.7+position;
          vec3 p=mix(stream,network,morph);
          gl_PointSize=(1.6+1.6*fract(seed*47.))*pixel*6.5/max(2.,(viewMatrix*vec4(p,1.)).z*-1.);
          #endif
          gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
        }`,
      fragmentShader: `
        varying float hue;
        void main(){
          float d=length(gl_PointCoord-.5)*2.;
          #ifdef BOKEH
          vec3 color=mix(vec3(1.,.71,.36),vec3(.62,.83,1.),step(.47,hue));
          float alpha=exp(-4.*d*d)*(1.-smoothstep(.64,1.,d))*.35;
          #else
          vec3 color=mix(vec3(.184,.435,.45),vec3(.85,.98,.51),smoothstep(.82,.94,hue));
          color=mix(color,vec3(1.),smoothstep(.96,.999,hue));
          float alpha=(1.-smoothstep(.22,1.,d))*.6;
          #endif
          gl_FragColor=vec4(color,alpha);
        }`
    }));
    const cloud = new T.Points(geometry, shader);
    cloud.frustumCulled = false;
    world.add(cloud);
    return shader.uniforms;
  }

  const lights = points(touch ? 110 : 220, true);
  const particles = points(touch ? 2600 : 6000, false);
  const heading = hero.querySelector('h1');
  const controls = hero.querySelector('.scene-controls');
  const morph = hero.querySelector('[data-morph]');
  const pause = hero.querySelector('[data-pause]');
  const hint = hero.querySelector('.wipe-hint');
  const pauseLabel = pause.textContent;
  const pointer = new T.Vector2(-9,-9);
  const last = pointer.clone();
  const drips = [];
  const bounds = () => hero.getBoundingClientRect();
  let width, height, size, fontsReady = false, aligned = false, reveal = null, started = null;
  let stopped = false, visible = true, frame = 0, lastFrame = 0, nextDrip = 0, pointerActive = false;
  let wasWiped = false, strokePending = false, morphAt = 0, morphFrom = 0, morphTo = 0;
  let samples = 0, sampleTime = 0, quality = 0, sceneDirty = true, resizeTimer, hintTimer;
  let paused = false;
  try { paused = sessionStorage.getItem('dewpoint-paused') === 'true'; } catch {}

  function draw(material, output = null) {
    renderer.setRenderTarget(output);
    quad.material = material;
    renderer.render(quadScene, quadCamera);
  }

  function drawWords(gotcha = false) {
    const ctx = textCanvas.getContext('2d');
    textCanvas.width = width;
    textCanvas.height = height;
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,width,height);
    ctx.fillStyle = '#fff';
    ctx.filter = 'blur(0.85px)';
    if (gotcha) {
      const font = Math.min(width*.26, 320);
      ctx.font = `330 ${font}px Geist`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Gotcha.', width/2, touch ? height*.76 : height*.14);
    } else if (fontsReady) {
      const box = bounds();
      aligned = width > 0;
      for (const line of heading.querySelectorAll('.line')) {
        const shiftY = Number.parseFloat(getComputedStyle(line).translate.split(' ')[1]) || 0;
        const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode;
          const style = getComputedStyle(node.parentElement);
          const range = document.createRange();
          range.selectNodeContents(node);
          const rect = range.getBoundingClientRect();
          const value = node.textContent;
          ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          ctx.letterSpacing = style.letterSpacing;
          const metrics = ctx.measureText(value);
          if (Math.abs(metrics.width-rect.width) > rect.width*.03 || rect.right > box.right + 1) aligned = false;
          ctx.textAlign = 'left';
          ctx.textBaseline = 'alphabetic';
          const baseline = rect.y - box.y - shiftY + (rect.height - metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent)/2 + metrics.fontBoundingBoxAscent;
          ctx.fillText(value, rect.x-box.x, baseline);
        }
      }
    }
    text.needsUpdate = true;
  }

  function resize() {
    const box = bounds();
    width = Math.max(1, Math.round(box.width));
    height = Math.max(1, Math.round(box.height));
    renderer.setSize(width, height, false);
    size = renderer.getDrawingBufferSize(screen.uniforms.resolution.value);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    wipe.uniforms.aspect.value = camera.aspect;
    const scale = quality ? .25 : .5;
    sharp.setSize(Math.max(1,Math.round(size.x*scale)),Math.max(1,Math.round(size.y*scale)));
    soft.setSize(Math.max(1,sharp.width>>1),Math.max(1,sharp.height>>1));
    scratch.setSize(Math.max(1,sharp.width>>2),Math.max(1,sharp.height>>2));
    particles.pixel.value = lights.pixel.value = Math.max(.6,renderer.getPixelRatio()*scale*1.65);
    drawWords(reveal?.swapped);
    sceneDirty = true;
  }

  function background(time) {
    sky.uniforms.time.value = particles.time.value = lights.time.value = time;
    draw(sky, sharp);
    renderer.render(world, camera);
    for (const [input, output, radius, up] of [[sharp,soft,1,0],[soft,scratch,1,0],[scratch,soft,1.2,1]]) {
      blur.uniforms.source.value = input.texture;
      blur.uniforms.delta.value.set(radius/input.width,radius/input.height);
      blur.uniforms.up.value = up;
      draw(blur, output);
    }
  }

  function stamp(dt, now) {
    wipe.uniforms.decay.value = Math.pow(.992, dt / 16.67);
    if (strokePending) {
      strokes[0].set(last.x,last.y,pointer.x,pointer.y);
      strokePending = false;
      wasWiped = true;
    }
    if (wasWiped && now > nextDrip && drips.length < 6) {
      drips.push({ x: pointer.x, y: pointer.y, start: now });
      nextDrip = now + 2000 + Math.random()*2000;
      wasWiped = false;
    }
    for (let i = drips.length - 1; i >= 0; i--) {
      const drip = drips[i];
      const elapsed = (now-drip.start)/1000;
      if (elapsed > 1.5) drips.splice(i,1);
      else strokes[i+2].set(drip.x,drip.y-elapsed*.08,drip.x,drip.y-elapsed*.08-.009);
    }
    wipe.uniforms.previous.value = previous.texture;
    draw(wipe, mask);
    screen.uniforms.wipe.value = mask.texture;
    [mask, previous] = [previous, mask];
    for (const stroke of strokes) stroke.set(-9,-9,-9,-9);
  }

  const ease = t => 1 - Math.pow(1-Math.max(0,Math.min(1,t)), 3);

  function render(now) {
    const dt = lastFrame ? now-lastFrame : 16.67;
    const interval = quality === 2 ? 66 : touch ? 31 : 0;
    if (lastFrame && dt < interval) return;
    lastFrame = now;
    started ??= now;
    if (quality < 2 && !reveal) {
      sampleTime += dt;
      if (++samples === 60) {
        if (sampleTime / samples > (touch ? 46 : 22)) {
          quality++;
          screen.uniforms.layers.value = 1;
          resize();
        }
        samples = sampleTime = 0;
      }
    }
    if (quality < 2 || sceneDirty || (morphAt && now-morphAt < 1450)) {
      camera.position.x += ((pointerActive ? (pointer.x-.5)*.5 : 0)-camera.position.x)*.06;
      camera.position.y += ((pointerActive ? (pointer.y-.5)*.5 : 0)-camera.position.y)*.06;
      camera.lookAt(0,0,0);
      particles.morph.value = morphFrom+(morphTo-morphFrom)*(1-Math.pow(1-Math.min(1,(now-morphAt)/1400),6));
      background(now/1000);
      sceneDirty = false;
    }
    const pass = screen.uniforms;
    let writing = (paused ? 1 : ease((now-started-250)/1600))*1.15;
    let hold = aligned ? Math.min(1,.92 + .08*(1-ease((now-started-1850)/500))) : 0;
    pass.fog.value = .86;
    pass.breath.value = 0;
    if (reveal) {
      const elapsed = now-reveal.start;
      const damp = ease(elapsed/600);
      pass.breath.value = damp;
      pass.fog.value += .14*damp;
      if (elapsed >= 600 && !reveal.swapped) {
        reveal.swapped = true;
        drawWords(true);
      }
      writing = reveal.swapped ? ease((elapsed-600)/1100)*1.15 : 1.15;
      hold = reveal.swapped ? .98 : hold*(1-damp);
    }
    pass.hold.value = hold;
    pass.writing.value = writing;
    pass.time.value = now/1000;
    stamp(Math.min(dt,250),now);
    draw(screen);
    root.classList.add('glass-live');
    root.classList.toggle('h1--wiped', aligned && (reveal || writing > .1));
    controls.hidden = false;
  }

  const canAnimate = () => !stopped && !document.hidden && (visible || reveal) && (!paused || reveal);
  function tick(now) {
    frame = 0;
    if (!canAnimate()) return;
    render(now);
    frame = requestAnimationFrame(tick);
  }
  function sync() {
    if (canAnimate() && !frame) frame = requestAnimationFrame(tick);
    if (!canAnimate() && frame) { cancelAnimationFrame(frame); frame = 0; }
  }
  function updatePause() {
    pause.setAttribute('aria-pressed', String(paused));
    pause.textContent = paused ? pause.dataset.resumeLabel : pauseLabel;
    root.classList.toggle('scene-paused', paused);
    sync();
  }
  function onPointer(event) {
    if (paused || reveal || event.target.closest('a,button')) return;
    const box = bounds();
    last.copy(pointer);
    pointer.set((event.clientX-box.left)/box.width,1-(event.clientY-box.top)/box.height);
    if (!pointerActive || last.distanceTo(pointer) > .36) last.copy(pointer);
    pointerActive = strokePending = true;
  }
  const leave = () => { pointerActive = false; };
  const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
  const observer = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => { resize(); if (paused && !stopped) render(performance.now()); }, 150);
  });
  function fontUpdate() {
    if (stopped) return;
    drawWords(reveal?.swapped);
    if (paused) render(performance.now());
  }
  function stop() {
    if (stopped) return;
    stopped = true;
    sync();
    root.classList.remove('glass-live','h1--wiped','scene-paused');
    controls.hidden = hint.hidden = true;
    canvas.remove();
    clearTimeout(resizeTimer);
    clearTimeout(hintTimer);
    observer.disconnect();
    intersection.disconnect();
    controller.abort();
    resources.forEach(item => item.dispose());
    renderer.dispose();
  }

  const controller = new AbortController();
  const { signal } = controller;
  resize();
  renderer.setClearColor(0);
  for (const buffer of [mask, previous]) { renderer.setRenderTarget(buffer); renderer.clear(); }
  renderer.setRenderTarget(null);
  observer.observe(hero);
  intersection.observe(hero);
  hero.addEventListener('pointermove', onPointer, { passive: true, signal });
  for (const type of ['pointerleave','pointercancel','pointerup']) hero.addEventListener(type, leave, { signal });
  morph.addEventListener('click', () => {
    morphFrom = particles.morph.value;
    morphTo = morphTo ? 0 : 1;
    morphAt = performance.now();
    sceneDirty = true;
    morph.setAttribute('aria-pressed', String(Boolean(morphTo)));
  }, { signal });
  pause.addEventListener('click', () => {
    paused = !paused;
    try { sessionStorage.setItem('dewpoint-paused', String(paused)); } catch {}
    if (paused) { lastFrame = 0; render(performance.now()); }
    updatePause();
  }, { signal });
  document.addEventListener('dewpoint-reveal', event => {
    if (paused || !root.classList.contains('glass-live')) return;
    reveal = event.detail ? { start: performance.now(), swapped: false } : null;
    if (!reveal) drawWords();
    sync();
  }, { signal });
  document.addEventListener('visibilitychange', sync, { signal });
  canvas.addEventListener('webglcontextlost', stop, { signal });
  reduced.addEventListener('change', stop, { signal });
  forced.addEventListener('change', stop, { signal });
  window.addEventListener('pagehide', event => { if (!event.persisted) stop(); }, { signal });
  document.fonts.addEventListener('loadingdone', fontUpdate, { signal });
  Promise.all([document.fonts.load('330 100px Geist'),document.fonts.load('italic 100px "Instrument Serif"')]).then(() => {
    fontsReady = document.fonts.check('330 100px Geist');
    fontUpdate();
    if (!stopped && !touch) hint.hidden = false;
    if (!stopped && touch) {
      hint.hidden = false;
      hintTimer = setTimeout(() => { hint.hidden = true; },4000);
    }
  }).catch(() => {});
  if (paused) render(performance.now());
  updatePause();
}
