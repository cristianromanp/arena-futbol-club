// Conexión a Supabase (vía REST, sin librería adicional).
// La llave "anon" es pública por diseño: los permisos reales están en las reglas (RLS) de la base.
export const SUPABASE_URL = "https://bdroeacfpfujzfzlwhwi.supabase.co";
export const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJkcm9lYWNmcGZ1anpmemx3aHdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTU2NDExNDMsImV4cCI6MjExMTIxNzE0M30.-FuwNDTt5fFxpdYdZPYnmwtJ4HtoKYU8HS1lTfGWSF4";

const SESSION_KEY = "arena-sesion";

// ---------- Fechas en hora de Colombia ----------
export function hoyYMD() {
  return ymd(new Date());
}
export function ymd(d) {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}
export function fechaLocal(s) {
  // "2026-11-25" -> Date a medianoche local (sin corrimiento por zona horaria)
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
export function fmtMoney(v) {
  const n = Math.round(Number(v) || 0);
  return (n < 0 ? "-$" : "$") + Math.abs(n).toLocaleString("es-CO");
}
export function horaBonita(h) {
  const n = parseInt(String(h).slice(0, 2), 10);
  return `${n % 12 || 12}:00 ${n < 12 ? "am" : "pm"}`;
}
export function soloNumeros(s) {
  return Number(String(s).replace(/[^\d]/g, "")) || 0;
}

// ---------- Sesión del equipo ----------
function leerSesion() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function guardarSesion(s) {
  try { s ? localStorage.setItem(SESSION_KEY, JSON.stringify(s)) : localStorage.removeItem(SESSION_KEY); } catch { /* sin almacenamiento */ }
}
let sesion = leerSesion();
let refrescando = null;

export function sesionActual() { return sesion; }

async function pedirToken(body, grant) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=${grant}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error_description || data.msg || "Correo o contraseña incorrectos");
  return data;
}

function aSesion(data, perfil) {
  return {
    token: data.access_token,
    refresh: data.refresh_token,
    vence: Date.now() + (data.expires_in || 3600) * 1000,
    userId: data.user?.id,
    perfil,
  };
}

export async function entrar(email, password) {
  const data = await pedirToken({ email, password }, "password");
  sesion = aSesion(data, null);
  const perfiles = await rest(`perfiles?id=eq.${data.user.id}&select=*`);
  if (!perfiles?.length) { salir(); throw new Error("Este usuario no tiene permiso para entrar al panel."); }
  sesion.perfil = perfiles[0];
  guardarSesion(sesion);
  return sesion;
}

export function salir() {
  sesion = null;
  guardarSesion(null);
}

async function tokenVigente() {
  if (!sesion) return null;
  if (Date.now() < sesion.vence - 60_000) return sesion.token;
  if (!refrescando) {
    refrescando = pedirToken({ refresh_token: sesion.refresh }, "refresh_token")
      .then((data) => { sesion = { ...aSesion(data, sesion.perfil) }; guardarSesion(sesion); return sesion.token; })
      .catch(() => { salir(); window.dispatchEvent(new Event("arena-sesion-vencida")); return null; })
      .finally(() => { refrescando = null; });
  }
  return refrescando;
}

// ---------- REST ----------
export async function rest(path, options = {}) {
  const token = await tokenVigente();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    let msg = txt;
    try { msg = JSON.parse(txt).message || txt; } catch { /* texto plano */ }
    throw new Error(msg);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

export function rpc(fn, args) {
  return rest(`rpc/${fn}`, { method: "POST", body: JSON.stringify(args || {}) });
}

export async function funcion(nombre, body) {
  const token = await tokenVigente();
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${nombre}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "No se pudo completar");
  return data;
}

// ---------- Reservas de un día (incluye las fijas de semanas anteriores) ----------
export async function reservasDelDia(fecha) {
  const sel = "select=*,clientes(id,nombre,telefono,cedula,de_confianza),canchas(id,nombre,formato)";
  const [rs, ex] = await Promise.all([
    rest(`reservas?estado=eq.confirmada&or=(fecha.eq.${fecha},and(es_fija.is.true,fecha.lte.${fecha}))&order=hora.asc&${sel}`),
    rest(`reserva_excepciones?fecha=eq.${fecha}&select=reserva_id,motivo`),
  ]);
  const dia = fechaLocal(fecha).getDay();
  const saltadas = new Set((ex || []).map((e) => e.reserva_id));
  return (rs || []).filter((r) => {
    if (saltadas.has(r.id)) return false;
    if (!r.es_fija) return r.fecha === fecha;
    return fechaLocal(r.fecha).getDay() === dia;
  });
}

export function precioCancha(tarifas, formato, hora) {
  const min = (h) => { const [a, b] = String(h).split(":").map(Number); return a * 60 + (b || 0); };
  const t = tarifas.find((t) => t.formato === formato && min(hora) >= min(t.hora_inicio) && min(hora) < min(t.hora_fin));
  return t ? t.precio : null;
}
