import {
  BoxGeometry, CanvasTexture, Color, DirectionalLight, DoubleSide, Group,
  HemisphereLight, InstancedMesh, Matrix4, Mesh, MeshBasicMaterial,
  MeshLambertMaterial, OrthographicCamera, PlaneGeometry, Scene,
  SphereGeometry, Vector3, WebGLRenderer,
} from './vendor/three-r187/three.module.js';

function curtainTexture() {
  const paper = document.createElement('canvas');
  paper.width = 128;
  paper.height = 64;
  const ink = paper.getContext('2d');
  const fade = ink.createLinearGradient(0, 0, 0, paper.height);
  fade.addColorStop(0, 'rgba(255, 255, 255, 0)');
  fade.addColorStop(0.18, 'rgba(255, 255, 255, 0.7)');
  fade.addColorStop(0.72, 'rgba(255, 255, 255, 0.45)');
  fade.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ink.fillStyle = fade;
  ink.fillRect(0, 0, paper.width, paper.height);
  ink.strokeStyle = 'rgba(255, 255, 255, 0.55)';
  for (let x = 4; x < paper.width; x += 9) {
    ink.beginPath();
    ink.moveTo(x, 8);
    ink.bezierCurveTo(x + 4, 22, x - 4, 40, x + 2, 57);
    ink.stroke();
  }
  return new CanvasTexture(paper);
}

export function createRoomScene(stage, canvas, studentLimit, onFailure) {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  const scene = new Scene();
  scene.background = new Color('#e8f1fb');
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  const room = new Group();
  scene.add(room, new HemisphereLight('#ffffff', '#9aabc0', 2.1));
  const daylight = new DirectionalLight('#fff7e5', 1.65);
  daylight.position.set(5, 10, 6);
  scene.add(daylight);

  const box = new BoxGeometry();
  const sphere = new SphereGeometry(0.5, 12, 8);
  const sheet = new PlaneGeometry();
  const floor = new MeshLambertMaterial({ color: '#e6eefa' });
  const base = new MeshLambertMaterial({ color: '#7393b1' });
  const wall = new MeshLambertMaterial({ color: '#d9e5f3' });
  const grid = new MeshBasicMaterial({ color: '#c8d9ec' });
  const white = new MeshLambertMaterial({ color: '#f1f5f8' });
  const board = new MeshLambertMaterial({ color: '#25556b' });
  const desk = new MeshLambertMaterial({ color: '#c49562' });
  const legs = new MeshLambertMaterial({ color: '#4e657d' });
  const clothing = new MeshLambertMaterial();
  const skin = new MeshLambertMaterial();
  const hair = new MeshLambertMaterial({ color: '#253444' });
  const windowMaterial = new MeshBasicMaterial({ color: '#8dc3e7' });
  const curtain = new MeshBasicMaterial({
    map: curtainTexture(), transparent: true, depthWrite: false, side: DoubleSide,
  });
  const shirts = ['#3976b3', '#417768', '#a05b70', '#625f9d', '#9b652f'].map(color => new Color(color));
  const skinTones = ['#dcaa82', '#ad7757', '#e4b79b', '#8b593f'].map(color => new Color(color));
  const teacherColor = new Color('#a04930');
  const pose = new Matrix4();
  let dimensions;
  let signature;
  let requested = 0;
  let failed = false;
  let width = 0;
  let height = 0;

  function draw() {
    requested = 0;
    if (!dimensions || failed) return;
    const nextWidth = stage.clientWidth;
    const nextHeight = stage.clientHeight;
    if (!nextWidth || !nextHeight) return;
    if (width !== nextWidth || height !== nextHeight) {
      width = nextWidth;
      height = nextHeight;
      renderer.setSize(width, height, false);
    }
    const { span, depth, wallHeight } = dimensions;
    const aspect = width / height;
    const extent = Math.max((span + depth) * 0.39 / aspect, (span + depth) * 0.27 + wallHeight * 0.43);
    camera.left = -extent * aspect;
    camera.right = extent * aspect;
    camera.top = extent;
    camera.bottom = -extent;
    camera.updateProjectionMatrix();
    try {
      renderer.render(scene, camera);
    } catch {
      stopRendering();
    }
  }

  function requestDraw() {
    if (!requested && !failed) requested = requestAnimationFrame(draw);
  }

  function stopRendering() {
    if (failed) return;
    failed = true;
    cancelAnimationFrame(requested);
    observer.disconnect();
    onFailure();
  }

  const observer = new ResizeObserver(requestDraw);
  observer.observe(stage);
  canvas.addEventListener('webglcontextlost', stopRendering);

  function block(material, x, y, z, wide, tall, deep) {
    const mesh = new Mesh(box, material);
    mesh.position.set(x, y, z);
    mesh.scale.set(wide, tall, deep);
    room.add(mesh);
    return mesh;
  }

  function instances(geometry, material, items, size, offset = [0, 0, 0], colors) {
    if (!items.length) return;
    const batch = new InstancedMesh(geometry, material, items.length);
    items.forEach(({ x, y, z }, index) => {
      pose.makeScale(...size);
      pose.setPosition(x + offset[0], y + offset[1], z + offset[2]);
      batch.setMatrixAt(index, pose);
      if (colors) batch.setColorAt(index, colors[index % colors.length]);
    });
    batch.instanceMatrix.needsUpdate = true;
    if (batch.instanceColor) batch.instanceColor.needsUpdate = true;
    room.add(batch);
  }

  function setRoom({ length, width, height, students, teachers }) {
    const key = [length, width, height, students, teachers].join('/');
    if (key === signature) return;
    signature = key;
    for (const object of room.children) {
      if (object.isInstancedMesh) object.dispose();
    }
    room.clear();

    const scale = 10 / Math.max(width, length);
    const span = Math.max(2.6, width * scale);
    const depth = Math.max(2.6, length * scale);
    const wallHeight = Math.max(2, Math.min(4.2, height * scale));
    const furniture = Math.min(1, span / 8, depth / 8);
    dimensions = { span, depth, wallHeight };

    const cameraTarget = new Vector3(0, wallHeight * 0.42, 0);
    camera.position.copy(cameraTarget).add(new Vector3(13, 11.5, 15));
    camera.lookAt(cameraTarget);
    block(base, 0, -0.19, 0, span + 0.1, 0.35, depth + 0.1);
    block(floor, 0, -0.025, 0, span, 0.08, depth);
    block(wall, 0, wallHeight / 2, -depth / 2, span, wallHeight, 0.14);
    block(wall, -span / 2, wallHeight / 2, 0, 0.14, wallHeight, depth);
    for (let index = 1; index < 10; index++) {
      block(grid, 0, 0.019, depth * (index / 10 - 0.5), span, 0.006, 0.012);
      block(grid, span * (index / 10 - 0.5), 0.019, 0, 0.012, 0.006, depth);
    }
    const boardY = wallHeight * 0.58;
    block(white, 0, boardY, -depth / 2 + 0.11, span * 0.54, wallHeight * 0.41, 0.09);
    block(board, 0, boardY, -depth / 2 + 0.165, span * 0.51, wallHeight * 0.36, 0.03);
    for (const position of [-0.24, 0.02, 0.28]) {
      const z = depth * position;
      block(white, -span / 2 + 0.10, boardY, z, 0.08, wallHeight * 0.39, depth * 0.21);
      block(windowMaterial, -span / 2 + 0.15, boardY, z, 0.03, wallHeight * 0.34, depth * 0.18);
      block(white, -span / 2 + 0.17, boardY, z, 0.025, wallHeight * 0.35, 0.035);
    }

    const desks = Array.from({ length: studentLimit }, (_, index) => {
      const column = index % 8;
      const row = Math.floor(index / 8);
      return {
        x: span * ((column - 3.5) * 0.105 + (column < 4 ? -0.034 : 0.034)),
        y: 0,
        z: depth * (-0.14 + row * 0.134),
      };
    });
    const occupied = desks.slice(0, students);
    const f = furniture;
    instances(box, desk, desks, [0.75 * f, 0.09 * f, 0.43 * f], [0, 0.68 * f, -0.25 * f]);
    instances(box, legs, desks, [0.09 * f, 0.64 * f, 0.32 * f], [0, 0.34 * f, -0.25 * f]);
    instances(box, legs, desks, [0.41 * f, 0.46 * f, 0.07 * f], [0, 0.43 * f, 0.31 * f]);
    instances(box, clothing, occupied, [0.35 * f, 0.51 * f, 0.27 * f], [0, 0.68 * f, 0.13 * f], shirts);
    instances(sphere, skin, occupied, [0.29 * f, 0.35 * f, 0.29 * f], [0, 1.06 * f, 0.12 * f], skinTones);
    instances(sphere, hair, occupied, [0.28 * f, 0.15 * f, 0.28 * f], [0, 1.18 * f, 0.13 * f]);

    block(desk, -span * 0.21, 0.47 * f, -depth * 0.31, 1.22 * f, 0.90 * f, 0.57 * f);
    if (teachers) {
      const person = [{ x: span * 0.12, y: 0, z: -depth * 0.36 }];
      instances(box, legs, person, [0.31 * f, 0.78 * f, 0.23 * f], [0, 0.40 * f, 0]);
      instances(box, clothing, person, [0.48 * f, 0.67 * f, 0.31 * f], [0, 1.04 * f, 0], [teacherColor]);
      instances(sphere, skin, person, [0.34 * f, 0.39 * f, 0.34 * f], [0, 1.54 * f, 0], skinTones);
      instances(sphere, hair, person, [0.34 * f, 0.15 * f, 0.34 * f], [0, 1.67 * f, 0]);
    }

    const air = new Mesh(sheet, curtain);
    air.position.set(0, wallHeight * 0.53, -depth * 0.245);
    air.scale.set(span * 0.90, wallHeight * 0.81, 1);
    room.add(air);
    requestDraw();
  }

  function setAir(ppm, target, reinforced) {
    curtain.color.set(ppm > target ? '#ec771c' : '#28b6ae');
    curtain.opacity = 0.10 + 0.48 * Math.min(1, ppm / (target * 1.35));
    windowMaterial.color.set(reinforced ? '#79e1cc' : '#8dc3e7');
    requestDraw();
  }

  return { setRoom, setAir };
}
