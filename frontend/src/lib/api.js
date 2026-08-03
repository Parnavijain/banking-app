// Tiny fetch wrapper that injects the JWT and parses JSON.
// Keeping this small on purpose — no axios, no react-query yet.
const BASE = import.meta.env.VITE_API_BASE || 'http://localhost:4000';

export function apiUrl(path) {
  return BASE + path;
}

export async function api(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
