import { defaults, bounds, validate, simulate } from './model.mjs';
import { renderChart, sample } from './chart.mjs';
import { cloudEnabled, readLocal, writeLocal, cloudLink, portableLink, readShared } from './storage.mjs';

const get = id => document.getElementById(id);
const form = get('settings');
const field = name => form.elements.namedItem(name);
const presets = [...form.querySelectorAll('[data-duration]')];
const slider = get('student-slider');
const dialog = get('share-dialog');
const roomStage = get('room-stage');
const roomCanvas = get('room-canvas');
const roomTime = get('room-time');
const roomStudentLimit = 40;
const number = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 0 });
const stepFormat = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 3 });
const errorFormat = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 4 });
let active;
let result;
let toastTimer;
let sharingRequest = 0;
let roomScene;
let updateChartCursor;

function formatError(value) {
  if (value === 0) return '0';
  if (value < 0.001) return value.toExponential(2).replace('.', ',');
  return errorFormat.format(value);
}

function fill(config) {
  for (const key of Object.keys(bounds)) field(key).value = config[key];
  field('pause').checked = config.pause;
  syncControls();
}

function readForm() {
  return {
    ...Object.fromEntries(Object.entries(bounds).map(([key, [min, max]]) => {
      const input = field(key);
      const value = input.valueAsNumber;
      const valid = Number.isFinite(value) && value >= min && value <= max;
      return [key, input.disabled && !valid ? (active ?? defaults)[key] : value];
    })),
    pause: field('pause').checked,
  };
}

function syncControls() {
  const count = field('students').valueAsNumber;
  if (Number.isFinite(count)) {
    slider.max = Math.max(Number(slider.max), count);
    slider.value = count;
  }
  const enabled = field('pause').checked;
  get('pause-fields').hidden = !enabled;
  for (const input of get('pause-fields').querySelectorAll('input')) input.disabled = !enabled;
  for (const button of presets) {
    button.setAttribute('aria-pressed', String(Number(button.dataset.duration) === field('duration').valueAsNumber));
  }
}

function text(id, value) {
  get(id).textContent = value;
}

function run(config) {
  active = config;
  result = simulate(config);
  writeLocal(config);
  render();
}

function runForm() {
  const config = readForm();
  const error = validate(config);
  text('form-error', error);
  get('form-error').hidden = !error;
  if (error) return false;
  run(config);
  return true;
}

function interpretation(config, analysis) {
  const { crossing, baselineCrossing, current, baseline } = analysis;
  const base = crossing === null
    ? 'El grupo se mantiene dentro de la meta de CO₂ durante toda la clase.'
    : crossing === 0 ? 'El aula ya supera la meta de CO₂ al inicio.'
      : `El grupo supera la meta de CO₂ cerca del minuto ${number.format(crossing)}.`;
  const difference = baseline.peak - current.peak;
  const comparison = config.pause && Math.abs(difference) >= 0.5
    ? ` Frente a la ventilación constante, el pico ${difference > 0 ? 'baja' : 'sube'} ${integer.format(Math.abs(difference))} ppm.`
    : '';
  const timing = config.pause && baselineCrossing > 0 && (crossing === null || Math.abs(baselineCrossing - crossing) > 0.05)
    ? ` Con ventilación constante, el primer cruce ocurre al minuto ${number.format(baselineCrossing)}.`
    : '';
  return base + comparison + timing;
}

function render() {
  const config = active;
  const { volume, capacity, crossing, current, suggestedPause } = result;
  text('room-dimensions', [config.length, config.width, config.height].map(value => number.format(value)).join(' × ') + ' m');
  text('room-volume', number.format(volume) + ' m³');
  text('scenario-badge', `${config.students} estudiantes · ${number.format(config.duration)} min`);
  text('capacity', capacity === null ? 'Sin cupo' : (capacity === bounds.students[1] ? '≥ ' : '') + capacity);
  const teachers = config.teachers === 1 ? '1 docente incluido' : `${config.teachers} docentes incluidos`;
  const occupancy = capacity === null ? 'La meta falla incluso con 0 estudiantes' : `Estudiantes · ${teachers}`;
  const physical = config.seats && capacity !== null
    ? ` · ${config.seats} plazas físicas · cupo combinado ${Math.min(capacity, config.seats)}` : '';
  text('capacity-note', occupancy + physical);
  text('peak', integer.format(current.peak) + ' ppm');
  text('peak-note', 'Meta de ' + integer.format(config.target) + ' ppm');
  text('crossing', crossing === null ? 'Sin cruce' : number.format(crossing) + ' min');
  text('crossing-note', crossing === null ? 'Dentro de la meta' : 'En el escenario elegido');
  text('interpretation', interpretation(config, result));
  get('pause-advice').hidden = !suggestedPause;
  if (suggestedPause) {
    const goal = suggestedPause.peak > config.target ? ' El pico todavía supera la meta.' : ' El pico queda dentro de la meta.';
    text('pause-explanation', `Para una pausa de ${number.format(config.pauseLength)} min, iniciar en el minuto ${suggestedPause.minute} da el menor pico estimado (${integer.format(suggestedPause.peak)} ppm) entre los minutos probados.` + goal);
    text('use-pause', `Probar minuto ${suggestedPause.minute}`);
    get('use-pause').hidden = suggestedPause.minute === config.pauseAt;
  }
  get('timeline-legend').innerHTML =
    '<li><span class="key"></span> Escenario elegido</li>' +
    (config.pause ? '<li><span class="key base"></span> Ventilación constante</li>' : '') +
    '<li><span class="key target"></span> Meta de CO₂</li>' +
    (config.pause ? '<li><span class="key pause"></span> Pausa programada</li>' : '');
  const visibleStudents = Math.min(config.students, roomStudentLimit);
  const students = config.students === 1 ? '1 estudiante' : `${config.students} estudiantes`;
  const represented = visibleStudents < config.students ? ` (${visibleStudents} representados)` : '';
  const roomTeachers = config.teachers > 1 ? `${config.teachers} docentes (1 representado)`
    : config.teachers === 1 ? '1 docente' : '0 docentes';
  text('room-occupancy', students + represented + ' · ' + roomTeachers);
  roomTime.max = config.duration;
  get('room-pause-start').hidden = !config.pause;
  get('room-pause-end').hidden = !config.pause;
  roomScene?.setRoom(config);
  renderCharts();
  renderTables();
}

function renderRoomMoment() {
  const minute = roomTime.valueAsNumber;
  const { intervals } = result.current;
  const interval = intervals.find(part => minute < part.end) ?? intervals.at(-1);
  const ppm = interval.valueAt(minute);
  const inPause = active.pause && interval.start === active.pauseAt
    && interval.end === active.pauseAt + active.pauseLength;
  const reinforced = inPause && interval.rate > active.rate;
  const over = ppm > active.target;
  text('room-minute', stepFormat.format(minute) + ' min');
  text('room-ppm', integer.format(ppm) + ' ppm');
  text('room-target-status', (over ? 'Sobre la meta de ' : 'Dentro de la meta de ') + number.format(active.target) + ' ppm');
  text('room-phase', reinforced ? 'Pausa · Ventilación reforzada' : inPause ? 'Ventilación en pausa' : 'Ventilación base');
  text('room-rate', stepFormat.format(interval.rate));
  get('room-reading').dataset.over = over;
  get('room-ventilation').dataset.reinforced = reinforced;
  roomStage.dataset.over = over;
  updateChartCursor(minute, ppm);
  roomScene?.setAir(ppm, active.target, reinforced);
}

function showRoomFallback() {
  roomScene = null;
  roomCanvas.hidden = true;
  const status = get('room-render-status');
  status.hidden = false;
  status.textContent = 'Vista esquemática';
}

async function loadRoomScene() {
  text('room-render-status', 'Cargando vista 3D…');
  try {
    const { createRoomScene } = await import('./room-3d.mjs');
    roomScene = createRoomScene(roomStage, roomCanvas, roomStudentLimit, showRoomFallback);
    roomScene.setRoom(active);
    roomCanvas.hidden = false;
    get('room-render-status').hidden = true;
    renderRoomMoment();
  } catch {
    showRoomFallback();
  }
}

function renderCharts() {
  const { duration, target, pause, pauseAt, pauseLength } = active;
  const { baseline, current, crossing, methods } = result;
  const band = pause ? { start: pauseAt, end: pauseAt + pauseLength } : null;
  const exact = sample(current);
  const timeline = [{ style: 'active', points: exact }];
  if (pause) timeline.unshift({ style: 'base', points: sample(baseline) });
  updateChartCursor = renderChart(get('timeline-chart'), {
    series: timeline, duration, target, crossing, pause: band,
    title: 'Concentración de CO₂ durante la clase y meta de referencia', height: 225, cursor: true,
  });
  renderRoomMoment();
  renderChart(get('methods-chart'), {
    series: [
      { style: 'exact', points: exact },
      ...['heun', 'rk4'].map(style => ({ style, points: methods[0].rows.map(row => ({ minute: row.minute, value: row[style] })) })),
    ],
    duration, pause: band, title: 'Comparación de las soluciones exacta, Heun y RK4', height: 195,
  });
}

function renderTables() {
  get('error-summary').innerHTML = result.methods.map(({ step, rows }) => {
    const max = method => Math.max(...rows.map(row => Math.abs(row[method] - row.exact)));
    return `<tr><td>${stepFormat.format(step)} min</td><td>${formatError(max('heun'))} ppm</td><td>${formatError(max('rk4'))} ppm</td></tr>`;
  }).join('');
  get('iteration-tables').innerHTML = result.methods.map(({ step, rows }) => {
    const header = ['Tiempo (min)', 'Exacta (ppm)', 'Heun (ppm)', 'Error Heun (ppm)', 'Error Heun (%)', 'RK4 (ppm)', 'Error RK4 (ppm)', 'Error RK4 (%)'];
    const body = rows.map(row => {
      const error = method => Math.abs(row[method] - row.exact);
      const relative = method => row.exact === 0 ? '—' : formatError(100 * error(method) / Math.abs(row.exact));
      const cells = [stepFormat.format(row.minute), stepFormat.format(row.exact), stepFormat.format(row.heun),
        formatError(error('heun')), relative('heun'), stepFormat.format(row.rk4), formatError(error('rk4')), relative('rk4')];
      return `<tr>${cells.map(value => `<td>${value}</td>`).join('')}</tr>`;
    });
    return `<section class="iteration-block"><h3>Paso de ${stepFormat.format(step)} min</h3>
      <div class="table-scroll" tabindex="0" aria-label="Iteraciones con paso de ${stepFormat.format(step)} minutos">
      <table><thead><tr>${header.map(label => `<th scope="col">${label}</th>`).join('')}</tr></thead><tbody>${body.join('')}</tbody></table></div></section>`;
  }).join('');
}

function toast(message) {
  clearTimeout(toastTimer);
  const status = get('page-status');
  status.textContent = message;
  status.hidden = false;
  toastTimer = setTimeout(() => { status.hidden = true; }, 6500);
}

for (const [name, [min, max]] of Object.entries(bounds)) {
  field(name).min = min;
  field(name).max = max;
}
form.addEventListener('input', syncControls);
form.addEventListener('invalid', event => event.target.closest('details')?.setAttribute('open', ''), true);
form.addEventListener('submit', event => {
  event.preventDefault();
  runForm();
});
slider.addEventListener('input', () => { field('students').value = slider.value; });
slider.addEventListener('change', () => { if (form.reportValidity()) runForm(); });
roomTime.addEventListener('input', renderRoomMoment);
get('room-pause-start').addEventListener('click', () => {
  roomTime.value = active.pauseAt;
  renderRoomMoment();
});
get('room-pause-end').addEventListener('click', () => {
  roomTime.value = active.pauseAt + active.pauseLength;
  renderRoomMoment();
});
for (const button of presets) {
  button.addEventListener('click', () => {
    field('duration').value = button.dataset.duration;
    const duration = field('duration').valueAsNumber;
    if (field('pause').checked && field('pauseAt').valueAsNumber + field('pauseLength').valueAsNumber > duration) {
      field('pauseAt').value = Math.max(0, duration - field('pauseLength').valueAsNumber);
    }
    syncControls();
    if (form.reportValidity()) runForm();
  });
}

get('use-pause').addEventListener('click', () => {
  field('pause').checked = true;
  field('pauseAt').value = result.suggestedPause.minute;
  syncControls();
  if (form.reportValidity() && runForm()) {
    get('interpretation').tabIndex = -1;
    get('interpretation').focus();
  }
});

get('share').addEventListener('click', async () => {
  if (!form.reportValidity() || !runForm()) return;
  const request = ++sharingRequest;
  get('share-link').value = portableLink(active);
  text('share-message', cloudEnabled ? 'Guardando en Supabase…' : 'El enlace incluye la configuración del aula.');
  dialog.showModal();
  if (!cloudEnabled) return;
  try {
    const link = await cloudLink(active);
    if (request !== sharingRequest || !dialog.open) return;
    get('share-link').value = link;
    text('share-message', 'Escenario guardado en Supabase.');
  } catch {
    if (request === sharingRequest && dialog.open) text('share-message', 'Supabase no está disponible. Puedes compartir el enlace con la configuración.');
  }
});
get('copy-link').addEventListener('click', async () => {
  const input = get('share-link');
  try {
    await navigator.clipboard.writeText(input.value);
    text('share-message', 'Enlace copiado.');
  } catch {
    input.focus();
    input.select();
    text('share-message', 'Seleccionamos el enlace para que puedas copiarlo.');
  }
});

const initial = readLocal() ?? defaults;
fill(initial);
run(initial);
const sceneObserver = new IntersectionObserver(entries => {
  if (entries.some(entry => entry.isIntersecting)) {
    sceneObserver.disconnect();
    loadRoomScene();
  }
}, { rootMargin: '120px' });
sceneObserver.observe(roomStage);
let width = get('timeline-chart').clientWidth;
new ResizeObserver(() => {
  const next = get('timeline-chart').clientWidth;
  if (next === width) return;
  width = next;
  renderCharts();
}).observe(get('timeline-chart'));

async function loadShared() {
  const hash = location.hash;
  const parameters = new URLSearchParams(hash.slice(1));
  if (!parameters.has('config') && !parameters.has('escenario')) return;
  try {
    const shared = await readShared(parameters);
    if (location.hash !== hash) return;
    if (!shared) throw new Error('Escenario inválido.');
    fill(shared);
    roomTime.value = 0;
    run(shared);
    toast('Escenario cargado desde el enlace.');
  } catch {
    if (location.hash === hash) toast('No se pudo recuperar el escenario del enlace.');
  }
}
window.addEventListener('hashchange', loadShared);
loadShared();
