import React, { useState, useEffect, useMemo } from "react";
import {
  LogOut, Plus, Check, X, Clock, Gift, Percent,
  Calendar as CalendarIcon, ShieldCheck, Lock, Mail, Loader2,
} from "lucide-react";

const SUPABASE_URL = "https://tonrlhunxlslwdwiunxq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnJsaHVueGxzbHdkd2l1bnhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzE0MTQsImV4cCI6MjEwMzUwNzQxNH0.d_UFyIlLjJcaf451SMZXu0xoe7KW9NaI8VsiHiH7phs";

const COLORS = {
  bg: "#0A0E14",
  surface: "#12161F",
  surfaceAlt: "#1B212C",
  surfaceAlt2: "#232A38",
  orange: "#F0631D",
  orangeBright: "#FF7F3F",
  white: "#F5F6F8",
  line: "#2A3140",
  textLo: "#8B93A3",
  danger: "#E5644B",
  okBg: "rgba(240,99,29,0.12)",
};

function fmtMoney(v) {
  return "$" + Number(v || 0).toLocaleString("es-CO");
}
function toYMD(d) {
  return d.toISOString().slice(0, 10);
}

async function sbAuth(path, token, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
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
    throw new Error(`Error (${res.status}): ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// ---------- Pantalla de login ----------
function Login({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  async function entrar() {
    setCargando(true);
    setError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: "POST",
        headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error_description || data.msg || "Credenciales inválidas");

      const perfiles = await sbAuth(
        `/rest/v1/perfiles?id=eq.${data.user.id}`,
        data.access_token
      );
      if (!perfiles || perfiles.length === 0) throw new Error("Este usuario no tiene un perfil asignado.");

      onLogin({ token: data.access_token, user: data.user, perfil: perfiles[0] });
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div
      style={{ background: COLORS.bg, color: COLORS.white, fontFamily: "'Inter', sans-serif" }}
      className="min-h-screen w-full flex items-center justify-center p-4"
    >
      <div
        className="w-full max-w-sm rounded-2xl p-7 relative overflow-hidden"
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}` }}
      >
        <div
          className="absolute -right-8 -top-8 w-24 h-32"
          style={{ background: COLORS.orange, transform: "skewX(-14deg)", opacity: 0.9 }}
        />
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-1">
            <ShieldCheck size={18} color={COLORS.orange} />
            <span className="text-[11px] tracking-[0.2em] uppercase" style={{ color: COLORS.textLo, fontWeight: 700 }}>
              Panel interno
            </span>
          </div>
          <h1 style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.02em" }}>Arena Fútbol Club</h1>
          <p style={{ color: COLORS.textLo, fontSize: 13, marginTop: 2, marginBottom: 24 }}>
            Entra con tu correo y contraseña
          </p>

          <div className="flex flex-col gap-3">
            <div className="relative">
              <Mail size={15} color={COLORS.textLo} className="absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full rounded-xl pl-9 pr-3.5 py-2.5 text-sm outline-none"
                style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
              />
            </div>
            <div className="relative">
              <Lock size={15} color={COLORS.textLo} className="absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Contraseña"
                onKeyDown={(e) => e.key === "Enter" && entrar()}
                className="w-full rounded-xl pl-9 pr-3.5 py-2.5 text-sm outline-none"
                style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
              />
            </div>
          </div>

          {error && <p style={{ color: COLORS.danger, fontSize: 12, marginTop: 10 }}>{error}</p>}

          <button
            onClick={entrar}
            disabled={cargando || !email || !password}
            className="w-full rounded-xl py-3 mt-5 flex items-center justify-center gap-2"
            style={{
              background: email && password ? COLORS.orange : COLORS.surfaceAlt2,
              color: email && password ? "#0A0E14" : COLORS.textLo,
              fontWeight: 800,
            }}
          >
            {cargando ? <Loader2 size={16} className="animate-spin" /> : "Entrar"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------- Panel principal ----------
function Panel({ sesion, onLogout }) {
  const { token, perfil } = sesion;
  const today = useMemo(() => new Date(), []);
  const [fecha, setFecha] = useState(toYMD(today));
  const [reservas, setReservas] = useState([]);
  const [canchas, setCanchas] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState("reservas"); // 'reservas' | 'nueva'
  const [guardandoId, setGuardandoId] = useState(null);

  async function cargarTodo() {
    setCargando(true);
    setError("");
    try {
      const [rs, cs, ts] = await Promise.all([
        sbAuth(
          `/rest/v1/reservas?fecha=eq.${fecha}&order=hora.asc&select=*,clientes(nombre,cedula,telefono),canchas(nombre,formato)`,
          token
        ),
        sbAuth(`/rest/v1/canchas?activa=eq.true&order=nombre.asc`, token),
        sbAuth(`/rest/v1/tarifas?select=*`, token),
      ]);
      setReservas(rs);
      setCanchas(cs);
      setTarifas(ts);
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }

  useEffect(() => {
    cargarTodo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fecha]);

  async function marcarDeposito(r, pagado) {
    setGuardandoId(r.id);
    try {
      await sbAuth(`/rest/v1/reservas?id=eq.${r.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ deposito_pagado: pagado }),
      });
      await cargarTodo();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardandoId(null);
    }
  }

  async function cancelarReserva(r) {
    if (!confirm(`¿Cancelar la reserva de ${r.clientes?.nombre || "este cliente"}?`)) return;
    setGuardandoId(r.id);
    try {
      await sbAuth(`/rest/v1/reservas?id=eq.${r.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ estado: "cancelada" }),
      });
      await cargarTodo();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardandoId(null);
    }
  }

  async function aplicarDescuento(r, pct) {
    setGuardandoId(r.id);
    try {
      await sbAuth(`/rest/v1/reservas?id=eq.${r.id}`, token, {
        method: "PATCH",
        body: JSON.stringify({ descuento_porcentaje: pct, motivo_descuento: pct > 0 ? "manual" : null }),
      });
      await cargarTodo();
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardandoId(null);
    }
  }

  const activas = reservas.filter((r) => r.estado !== "cancelada");

  return (
    <div style={{ background: COLORS.bg, color: COLORS.white, fontFamily: "'Inter', sans-serif", minHeight: "100vh" }}>
      {/* Top bar */}
      <div
        className="flex items-center justify-between px-5 py-4 relative overflow-hidden"
        style={{ borderBottom: `1px solid ${COLORS.line}`, background: COLORS.surface }}
      >
        <div
          className="absolute -right-6 -top-10 w-20 h-28"
          style={{ background: COLORS.orange, transform: "skewX(-14deg)", opacity: 0.85 }}
        />
        <div className="relative z-10">
          <div style={{ fontWeight: 800, fontSize: 16 }}>Arena Fútbol Club</div>
          <div style={{ color: COLORS.textLo, fontSize: 12 }}>
            {perfil.nombre} · <span style={{ textTransform: "capitalize" }}>{perfil.rol}</span>
          </div>
        </div>
        <button onClick={onLogout} className="relative z-10 p-2 rounded-full" style={{ background: COLORS.surfaceAlt }}>
          <LogOut size={16} color={COLORS.textLo} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 px-5 pt-4">
        {[
          { id: "reservas", label: "Reservas del día" },
          { id: "nueva", label: "Nueva reserva" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="px-4 py-2 rounded-full text-sm"
            style={{
              background: tab === t.id ? COLORS.orange : COLORS.surfaceAlt,
              color: tab === t.id ? "#0A0E14" : COLORS.textLo,
              fontWeight: 700,
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="px-5 py-5 max-w-2xl mx-auto">
        {error && (
          <div className="rounded-lg px-3 py-2 mb-4" style={{ background: "#2A1614", border: `1px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: 12 }}>
            {error}
          </div>
        )}

        {tab === "reservas" && (
          <>
            <div className="flex items-center gap-2 mb-4">
              <CalendarIcon size={15} color={COLORS.textLo} />
              <input
                type="date"
                value={fecha}
                onChange={(e) => setFecha(e.target.value)}
                className="rounded-xl px-3.5 py-2 text-sm outline-none"
                style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
              />
              <span style={{ color: COLORS.textLo, fontSize: 12 }}>
                {activas.length} reserva{activas.length !== 1 ? "s" : ""}
              </span>
            </div>

            {cargando && <p style={{ color: COLORS.textLo, fontSize: 13 }}>Cargando...</p>}

            {!cargando && activas.length === 0 && (
              <div className="rounded-xl p-6 text-center" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
                <p style={{ color: COLORS.textLo, fontSize: 13 }}>No hay reservas para este día todavía.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {activas.map((r) => (
                <div key={r.id} className="rounded-xl p-4" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div style={{ fontWeight: 800 }}>{r.clientes?.nombre || "Cliente"}</div>
                      <div style={{ color: COLORS.textLo, fontSize: 12 }}>
                        CC {r.clientes?.cedula} · {r.clientes?.telefono}
                      </div>
                    </div>
                    <button onClick={() => cancelarReserva(r)} className="p-1.5 rounded-full" style={{ background: COLORS.surfaceAlt2 }}>
                      <X size={14} color={COLORS.danger} />
                    </button>
                  </div>

                  <div className="flex items-center gap-3 mt-2" style={{ fontSize: 12, color: COLORS.textLo }}>
                    <span className="flex items-center gap-1">
                      <Clock size={12} /> {r.hora?.slice(0, 5)}
                    </span>
                    <span>{r.canchas?.nombre}</span>
                    <span>{r.canchas?.formato}</span>
                    {r.es_fija && (
                      <span style={{ color: COLORS.orangeBright, fontWeight: 700, fontSize: 11 }}>· FIJA</span>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {r.es_gratis ? (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: COLORS.okBg, color: COLORS.orangeBright, fontSize: 11, fontWeight: 700 }}>
                        <Gift size={11} /> Cancha gratis
                      </span>
                    ) : (
                      <button
                        onClick={() => marcarDeposito(r, !r.deposito_pagado)}
                        disabled={guardandoId === r.id}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                        style={{
                          background: r.deposito_pagado ? COLORS.okBg : COLORS.surfaceAlt2,
                          color: r.deposito_pagado ? COLORS.orangeBright : COLORS.textLo,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        <Check size={11} />
                        {r.deposito_pagado ? "Depósito pagado" : `Marcar depósito (${fmtMoney(r.monto_deposito)})`}
                      </button>
                    )}

                    {r.descuento_porcentaje > 0 && (
                      <span className="flex items-center gap-1 px-2.5 py-1 rounded-full" style={{ background: COLORS.surfaceAlt2, color: COLORS.textLo, fontSize: 11 }}>
                        <Percent size={11} /> {r.descuento_porcentaje}% {r.motivo_descuento && `· ${r.motivo_descuento}`}
                      </span>
                    )}

                    {!r.es_gratis && !r.descuento_porcentaje && (
                      <button
                        onClick={() => {
                          const pct = prompt("¿Qué porcentaje de descuento manual aplicas? (0-100)", "10");
                          const n = parseInt(pct);
                          if (!isNaN(n) && n >= 0 && n <= 100) aplicarDescuento(r, n);
                        }}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-full"
                        style={{ background: COLORS.surfaceAlt2, color: COLORS.textLo, fontSize: 11 }}
                      >
                        <Percent size={11} /> Aplicar descuento
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {tab === "nueva" && (
          <NuevaReserva
            token={token}
            canchas={canchas}
            tarifas={tarifas}
            onCreada={() => {
              setTab("reservas");
              cargarTodo();
            }}
          />
        )}
      </div>
    </div>
  );
}

// ---------- Formulario de reserva manual ----------
function NuevaReserva({ token, canchas, tarifas, onCreada }) {
  const [cancha, setCancha] = useState(null);
  const [fecha, setFecha] = useState(toYMD(new Date()));
  const [hora, setHora] = useState("18:00");
  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [depositoPagado, setDepositoPagado] = useState(true);
  const [descuento, setDescuento] = useState(0);
  const [esFija, setEsFija] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState(false);

  function horaAMinutos(h) {
    const [hh, mm] = h.split(":").map(Number);
    return hh * 60 + mm;
  }
  function precio() {
    if (!cancha) return null;
    const min = horaAMinutos(hora);
    const t = tarifas.find(
      (t) => t.formato === cancha.formato && min >= horaAMinutos(t.hora_inicio) && min < horaAMinutos(t.hora_fin)
    );
    return t ? t.precio : null;
  }

  async function crear() {
    setGuardando(true);
    setError("");
    setOk(false);
    try {
      let clienteId;
      const existentes = await sbAuth(`/rest/v1/clientes?cedula=eq.${encodeURIComponent(cedula)}`, token);
      if (existentes.length > 0) {
        clienteId = existentes[0].id;
      } else {
        const nuevo = await sbAuth(`/rest/v1/clientes`, token, {
          method: "POST",
          body: JSON.stringify({ nombre, cedula, telefono }),
        });
        clienteId = nuevo[0].id;
      }

      await sbAuth(`/rest/v1/reservas`, token, {
        method: "POST",
        body: JSON.stringify({
          cancha_id: cancha.id,
          cliente_id: clienteId,
          fecha,
          hora,
          estado: "confirmada",
          deposito_pagado: depositoPagado,
          monto_deposito: 50000,
          descuento_porcentaje: descuento,
          motivo_descuento: descuento > 0 ? "manual" : null,
          es_fija: esFija,
        }),
      });

      setOk(true);
      setNombre(""); setCedula(""); setTelefono(""); setCancha(null); setDescuento(0); setEsFija(false);
      setTimeout(() => onCreada(), 700);
    } catch (e) {
      setError(e.message);
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label style={{ fontSize: 11, color: COLORS.textLo, display: "block", marginBottom: 4 }}>Fecha</label>
          <input
            type="date"
            value={fecha}
            onChange={(e) => setFecha(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
          />
        </div>
        <div>
          <label style={{ fontSize: 11, color: COLORS.textLo, display: "block", marginBottom: 4 }}>Hora</label>
          <input
            type="time"
            value={hora}
            onChange={(e) => setHora(e.target.value)}
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
          />
        </div>
      </div>

      <div>
        <label style={{ fontSize: 11, color: COLORS.textLo, display: "block", marginBottom: 4 }}>Cancha</label>
        <div className="flex flex-wrap gap-2">
          {canchas.map((c) => (
            <button
              key={c.id}
              onClick={() => setCancha(c)}
              className="px-3 py-2 rounded-lg text-sm"
              style={{
                background: cancha?.id === c.id ? COLORS.orange : COLORS.surfaceAlt,
                color: cancha?.id === c.id ? "#0A0E14" : COLORS.white,
                border: `1px solid ${cancha?.id === c.id ? COLORS.orange : COLORS.line}`,
                fontWeight: 700,
              }}
            >
              {c.nombre}
            </button>
          ))}
        </div>
      </div>

      {cancha && precio() && (
        <div className="rounded-lg px-3 py-2 flex justify-between" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, fontSize: 13 }}>
          <span style={{ color: COLORS.textLo }}>Valor cancha</span>
          <span style={{ fontWeight: 800 }}>{fmtMoney(precio())}</span>
        </div>
      )}

      <div className="flex flex-col gap-2.5">
        <input
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Nombre completo"
          className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
        />
        <input
          value={cedula}
          onChange={(e) => setCedula(e.target.value)}
          placeholder="Cédula"
          className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
        />
        <input
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          placeholder="Número de celular"
          className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
          style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
        />
      </div>

      <div className="flex items-center justify-between rounded-lg px-3.5 py-2.5" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
        <span style={{ fontSize: 13 }}>¿Ya pagó el depósito de $50.000?</span>
        <button
          onClick={() => setDepositoPagado(!depositoPagado)}
          className="px-3 py-1 rounded-full text-xs"
          style={{ background: depositoPagado ? COLORS.orange : COLORS.surfaceAlt2, color: depositoPagado ? "#0A0E14" : COLORS.textLo, fontWeight: 700 }}
        >
          {depositoPagado ? "Sí" : "No"}
        </button>
      </div>

      <div className="flex items-center justify-between rounded-lg px-3.5 py-2.5" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
        <div>
          <div style={{ fontSize: 13 }}>¿Reserva fija?</div>
          <div style={{ fontSize: 11, color: COLORS.textLo }}>Se repite esta cancha/hora cada semana hasta que la canceles</div>
        </div>
        <button
          onClick={() => setEsFija(!esFija)}
          className="px-3 py-1 rounded-full text-xs shrink-0 ml-3"
          style={{ background: esFija ? COLORS.orange : COLORS.surfaceAlt2, color: esFija ? "#0A0E14" : COLORS.textLo, fontWeight: 700 }}
        >
          {esFija ? "Sí" : "No"}
        </button>
      </div>

      <div>
        <label style={{ fontSize: 11, color: COLORS.textLo, display: "block", marginBottom: 4 }}>
          Descuento manual (%)
        </label>
        <input
          type="number"
          min="0"
          max="100"
          value={descuento}
          onChange={(e) => setDescuento(Math.max(0, Math.min(100, parseInt(e.target.value) || 0)))}
          className="rounded-xl px-3.5 py-2.5 text-sm outline-none w-24"
          style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.white }}
        />
      </div>

      {error && <p style={{ color: COLORS.danger, fontSize: 12 }}>{error}</p>}
      {ok && <p style={{ color: COLORS.orangeBright, fontSize: 12 }}>Reserva creada ✓</p>}

      <button
        disabled={!cancha || !nombre || !cedula || !telefono || guardando}
        onClick={crear}
        className="rounded-xl py-3 flex items-center justify-center gap-2"
        style={{
          background: cancha && nombre && cedula && telefono ? COLORS.orange : COLORS.surfaceAlt2,
          color: cancha && nombre && cedula && telefono ? "#0A0E14" : COLORS.textLo,
          fontWeight: 800,
        }}
      >
        <Plus size={16} />
        {guardando ? "Guardando..." : "Crear reserva"}
      </button>
    </div>
  );
}

export default function AdminApp() {
  const [sesion, setSesion] = useState(null);
  if (!sesion) return <Login onLogin={setSesion} />;
  return <Panel sesion={sesion} onLogout={() => setSesion(null)} />;
}
