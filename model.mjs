export const defaults = Object.freeze({
  length: 10, width: 10, height: 3, students: 28, teachers: 1,
  duration: 90, pause: true, pauseAt: 50, pauseLength: 10,
  rate: 2, pauseRate: 6, initial: 700, outside: 420, target: 1000,
  emission: 0.0042, step: 10, seats: 0,
});

export const bounds = {
  length: [1, 100], width: [1, 100], height: [1, 20], students: [0, 500],
  teachers: [0, 50], duration: [15, 240], pauseAt: [0, 240],
  pauseLength: [1, 60], rate: [0, 20], pauseRate: [0, 20],
  initial: [0, 10000], outside: [0, 10000], target: [100, 10000],
  emission: [0.0001, 0.03], step: [0.5, 30], seats: [0, 500],
};

export function validate(config) {
  if (!config || typeof config.pause !== 'boolean') return 'La configuración de la pausa es inválida.';
  for (const [name, [min, max]] of Object.entries(bounds)) {
    const value = config[name];
    if (!Number.isFinite(value) || value < min || value > max) return 'Revisa los valores y rangos del formulario.';
  }
  if (![config.students, config.teachers, config.seats].every(Number.isInteger)) {
    return 'Ingresa números enteros de estudiantes, docentes y plazas.';
  }
  if (config.pause && config.pauseAt + config.pauseLength > config.duration) {
    return 'La pausa debe terminar dentro del tiempo de clase.';
  }
  const maxRate = config.pause ? Math.max(config.rate, config.pauseRate) : config.rate;
  if (config.step * maxRate > 120) {
    return 'Reduce el paso numérico. Con esta ventilación se necesita un paso menor para mantener estable el método de Heun.';
  }
  return '';
}

function segments(config, withPause) {
  const { duration, rate, pauseAt, pauseLength, pauseRate } = config;
  if (!withPause) return [{ start: 0, end: duration, rate }];
  return [
    { start: 0, end: pauseAt, rate },
    { start: pauseAt, end: pauseAt + pauseLength, rate: pauseRate },
    { start: pauseAt + pauseLength, end: duration, rate },
  ].filter(({ start, end }) => end > start);
}

function exact(initial, slope, rate, minutes) {
  const hours = minutes / 60;
  return rate === 0 ? initial + slope * hours : initial - slope * Math.expm1(-rate * hours) / rate;
}

function trace(config, parts, occupants) {
  const volume = config.length * config.width * config.height;
  const source = 3.6e6 * config.emission * occupants / volume;
  let concentration = config.initial;
  const intervals = parts.map(part => {
    const startValue = concentration;
    const derivative = value => source - part.rate * (value - config.outside);
    const valueAt = minute => exact(startValue, derivative(startValue), part.rate, minute - part.start);
    concentration = valueAt(part.end);
    return { ...part, startValue, endValue: concentration, valueAt, derivative };
  });
  return { intervals, peak: Math.max(config.initial, ...intervals.map(part => part.endValue)) };
}

function firstCrossing(config, intervals) {
  if (config.initial > config.target) return 0;
  for (const part of intervals) {
    if (part.endValue <= config.target) continue;
    let lo = part.start;
    let hi = part.end;
    for (let iteration = 0; iteration < 32; iteration++) {
      const mid = (lo + hi) / 2;
      if (part.valueAt(mid) > config.target) hi = mid;
      else lo = mid;
    }
    return hi;
  }
  return null;
}

function capacity(config, parts) {
  const fits = students => trace(config, parts, students + config.teachers).peak <= config.target;
  if (!fits(0)) return null;
  const limit = bounds.students[1];
  if (fits(limit)) return limit;
  let low = 0;
  let high = limit;
  while (high - low > 1) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) low = middle;
    else high = middle;
  }
  return low;
}

function bestPause(config, occupants, baselinePeak) {
  if (!config.pause || config.pauseRate <= config.rate || baselinePeak <= config.target) return null;
  let best = { minute: 0, peak: baselinePeak };
  for (let minute = 0; minute <= config.duration - config.pauseLength; minute++) {
    const parts = segments({ ...config, pauseAt: minute }, true);
    const { peak } = trace(config, parts, occupants);
    if (peak < best.peak) best = { minute, peak };
  }
  return best.peak < baselinePeak ? best : null;
}

function integrate(initial, intervals, step) {
  let heun = initial;
  let rk4 = initial;
  const rows = [{ minute: 0, exact: initial, heun, rk4 }];
  for (const part of intervals) {
    for (let minute = part.start; minute < part.end;) {
      const end = Math.min(minute + step, part.end);
      const h = (end - minute) / 60;
      const slope = part.derivative;
      const predictor = heun + h * slope(heun);
      heun += h * (slope(heun) + slope(predictor)) / 2;
      const k1 = slope(rk4);
      const k2 = slope(rk4 + h * k1 / 2);
      const k3 = slope(rk4 + h * k2 / 2);
      const k4 = slope(rk4 + h * k3);
      rk4 += h * (k1 + 2 * k2 + 2 * k3 + k4) / 6;
      rows.push({ minute: end, exact: part.valueAt(end), heun, rk4 });
      minute = end;
    }
  }
  return rows;
}

export function simulate(config) {
  const occupants = config.students + config.teachers;
  const active = segments(config, config.pause);
  const baseline = trace(config, segments(config, false), occupants);
  const current = trace(config, active, occupants);
  return {
    volume: config.length * config.width * config.height,
    capacity: capacity(config, active),
    crossing: firstCrossing(config, current.intervals),
    baselineCrossing: firstCrossing(config, baseline.intervals),
    suggestedPause: bestPause(config, occupants, baseline.peak),
    current,
    baseline,
    methods: [config.step, config.step / 2].map(step => ({
      step, rows: integrate(config.initial, current.intervals, step),
    })),
  };
}
