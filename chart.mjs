const fmt = new Intl.NumberFormat('es-BO', { maximumFractionDigits: 1 });
const line = (x1, y1, x2, y2, style) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${style}"/>`;

export function sample(trace) {
  return trace.intervals.flatMap(part => Array.from({ length: 41 }, (_, index) => {
    const minute = part.start + (part.end - part.start) * index / 40;
    return { minute, value: part.valueAt(minute) };
  }));
}

export function renderChart(container, { series, duration, target, pause, crossing, title, height, cursor = false }) {
  const width = Math.max(240, Math.floor(container.clientWidth));
  const left = width < 400 ? 45 : 54;
  const right = width - 14;
  const top = 23;
  const bottom = height - 31;
  const values = series.flatMap(({ points }) => points.map(point => point.value));
  if (target != null) values.push(target);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const roughStep = Math.max((high - low) / 4, 10);
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const tickStep = magnitude * ([1, 2, 2.5, 5, 10].find(value => value * magnitude >= roughStep));
  const minimum = Math.max(0, Math.floor((low - tickStep * 0.15) / tickStep) * tickStep);
  const maximum = Math.max(minimum + tickStep, Math.ceil((high + tickStep * 0.15) / tickStep) * tickStep);
  const x = minute => left + minute / duration * (right - left);
  const y = value => bottom - (value - minimum) / (maximum - minimum) * (bottom - top);

  const marks = [];
  if (pause) {
    const start = x(pause.start);
    const band = x(pause.end) - start;
    marks.push(`<rect class="pause-band" x="${start}" y="${top}" width="${band}" height="${bottom - top}"/>`);
    if (band > 33) marks.push(`<text class="pause-label" x="${start + band / 2}" y="13" text-anchor="middle">Pausa</text>`);
  }
  for (let value = minimum; value <= maximum; value += tickStep) {
    marks.push(line(left, y(value), right, y(value), 'grid'));
    marks.push(`<text class="axis-label" x="${left - 7}" y="${y(value) + 4}" text-anchor="end">${fmt.format(value)}</text>`);
  }
  const ticks = width < 420 ? 3 : 6;
  for (let index = 0; index <= ticks; index++) {
    const minute = duration * index / ticks;
    marks.push(`<text class="axis-label" x="${x(minute)}" y="${bottom + 21}" text-anchor="middle">${fmt.format(minute)}</text>`);
  }
  marks.push('<text class="axis-label" x="1" y="13">ppm</text>');
  marks.push(`<text class="axis-label" x="${(left + right) / 2}" y="${height + 6}" text-anchor="middle">minutos</text>`);
  if (target != null) marks.push(line(left, y(target), right, y(target), 'target'));
  for (const { style, points } of series) {
    const coords = points.map(point => `${x(point.minute).toFixed(2)},${y(point.value).toFixed(2)}`).join(' ');
    marks.push(`<polyline class="series ${style}" points="${coords}"/>`);
  }
  if (crossing != null && crossing > 0) {
    marks.push(`<circle class="cross-dot" cx="${x(crossing)}" cy="${y(target)}" r="4.4"/>`);
  }
  if (cursor) {
    marks.push(`<g aria-hidden="true">${line(left, top, left, bottom, 'time-cursor')}<circle class="time-dot" r="4.4"/></g>`);
  }
  container.innerHTML = `<svg viewBox="0 0 ${width} ${height + 11}" role="img" aria-label="${title}">${marks.join('')}</svg>`;
  if (cursor) {
    const rule = container.querySelector('.time-cursor');
    const dot = container.querySelector('.time-dot');
    return (minute, value) => {
      const position = x(minute);
      rule.setAttribute('x1', position);
      rule.setAttribute('x2', position);
      dot.setAttribute('cx', position);
      dot.setAttribute('cy', y(value));
    };
  }
}
