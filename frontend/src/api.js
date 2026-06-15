/**
 * api.js — thin fetch wrapper around the backend.
 *
 * - Injects the JWT (from localStorage) as a Bearer token on every request.
 * - Parses the uniform { error, code } error body the backend returns and
 *   throws an Error carrying .status and .code so callers can branch on them
 *   (e.g. show a 409 conflict differently from a 401).
 */

const TOKEN_KEY = "bms_token";

// API base:
//  - Local dev: undefined → falls back to "/api", which the Vite proxy forwards
//    to the backend (stripping /api).
//  - Production: set VITE_API_URL to the deployed backend's base URL, e.g.
//    "https://bms-backend.onrender.com". Requests then go straight there.
const API_BASE = import.meta.env.VITE_API_URL || "/api";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

async function request(path, { method = "GET", body, auth = false } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  // In dev API_BASE is "/api" (proxied); in prod it's the backend's full URL.
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 / empty body guard
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const err = new Error(data?.error || `Request failed (${res.status})`);
    err.status = res.status;
    err.code = data?.code;
    err.body = data; // includes takenIds on 409, etc.
    throw err;
  }
  return data;
}

export const api = {
  // ── Auth ──
  register: (payload) => request("/auth/register", { method: "POST", body: payload }),
  login:    (payload) => request("/auth/login",    { method: "POST", body: payload }),

  // ── Cities ──
  getCities: () => request("/cities"),

  // ── Agent ──
  agentChat: (message, history, city) =>
    request("/agent/chat", { method: "POST", auth: true, body: { message, history, city } }),

  // ── Movies ──
  getMovies: (search = "", city = "") => {
    const qs = new URLSearchParams();
    if (search) qs.set("search", search);
    if (city) qs.set("city", city);
    const q = qs.toString();
    return request(`/movies${q ? `?${q}` : ""}`);
  },
  getMovie:  (id) => request(`/movies/${id}`),

  // ── Shows ──
  getShows: (movieId, date, city = "") => {
    const qs = new URLSearchParams({ movieId, date });
    if (city) qs.set("city", city);
    return request(`/shows?${qs.toString()}`);
  },
  getSeatMap: (showId) => request(`/shows/${showId}/seats`),

  // ── Bookings (all auth-required) ──
  getBookings: () => request("/bookings", { auth: true }),
  hold:    (showId, showSeatIds) =>
    request("/bookings/hold", { method: "POST", auth: true, body: { showId, showSeatIds } }),
  confirm: (bookingId) =>
    request(`/bookings/${bookingId}/confirm`, { method: "POST", auth: true }),
  cancel:  (bookingId) =>
    request(`/bookings/${bookingId}/cancel`, { method: "POST", auth: true }),
};
