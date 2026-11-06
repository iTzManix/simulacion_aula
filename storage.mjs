import { defaults, validate } from './model.mjs';
import { projectUrl, publishableKey } from './config.mjs';

const localKey = 'aula-en-pausa:last-scenario:v1';
export const cloudEnabled = /^https:\/\/[a-z0-9]+\.supabase\.co\/?$/.test(projectUrl)
  && /^sb_publishable_[\w-]+$/.test(publishableKey);

function normalize(input) {
  if (validate(input)) return null;
  return Object.fromEntries(Object.keys(defaults).map(key => [key, input[key]]));
}

export function readLocal() {
  try {
    return normalize(JSON.parse(localStorage.getItem(localKey)));
  } catch {
    return null;
  }
}

export function writeLocal(config) {
  try {
    localStorage.setItem(localKey, JSON.stringify(config));
  } catch {
    // The simulator also works when the browser blocks storage.
  }
}

async function rpc(name, data) {
  const response = await fetch(new URL('/rest/v1/rpc/' + name, projectUrl), {
    method: 'POST',
    headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
    signal: AbortSignal.timeout(7000),
  });
  if (!response.ok) throw new Error('Supabase no respondió al guardado o la lectura.');
  return response.json();
}

function link(parameters) {
  const url = new URL(location.href);
  url.hash = new URLSearchParams(parameters).toString();
  return url.href;
}

export function portableLink(config) {
  return link({ config: JSON.stringify(config) });
}

export async function cloudLink(config) {
  const id = await rpc('aula_en_pausa_save', { scenario: config });
  if (typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error('Identificador inválido.');
  return link({ escenario: id });
}

export async function readShared(parameters) {
  if (parameters.has('escenario')) {
    const id = parameters.get('escenario');
    if (!cloudEnabled || !/^[0-9a-f-]{36}$/i.test(id)) return null;
    return normalize(await rpc('aula_en_pausa_get', { scenario_id: id }));
  }
  return normalize(JSON.parse(parameters.get('config')));
}
