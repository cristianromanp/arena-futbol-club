import React, { useState, useEffect, useMemo } from "react";
import { ChevronLeft, ChevronRight, Check, Clock, Users, Zap, MapPin, Gift } from "lucide-react";

// ---- Conexión a Supabase (vía REST, sin librería adicional) ----
const SUPABASE_URL = "https://tonrlhunxlslwdwiunxq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvbnJsaHVueGxzbHdkd2l1bnhxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc5MzE0MTQsImV4cCI6MjEwMzUwNzQxNH0.d_UFyIlLjJcaf451SMZXu0xoe7KW9NaI8VsiHiH7phs";

async function sb(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      Prefer: options.prefer || "return=representation",
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Error Supabase (${res.status}): ${txt}`);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Paleta de marca Arena Fútbol Club: naranja + negro/azul oscuro + blanco
const COLORS = {
  bg: "#0A0E14",
  surface: "#12161F",
  surfaceAlt: "#1B212C",
  turf: "#F0631D", // naranja de marca — acciones principales
  turfBright: "#FF7F3F",
  flood: "#FFFFFF", // blanco — precios y destacados sobre fondo oscuro
  line: "#2A3140",
  textHi: "#F5F6F8",
  textLo: "#8B93A3",
  danger: "#E5644B",
};

const DIAS_CORTOS = ["d", "l", "m", "m", "j", "v", "s"];
const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

function fmtMoney(v) {
  return "$" + Number(v).toLocaleString("es-CO");
}
function toYMD(d) {
  return d.toISOString().slice(0, 10);
}
function buildMonthGrid(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  return cells;
}
function horaAMinutos(h) {
  const [hh, mm] = h.split(":").map(Number);
  return hh * 60 + mm;
}
const FRANJAS = Array.from({ length: 16 }, (_, i) => {
  const h = 7 + i;
  return `${String(h).padStart(2, "0")}:00`;
});
function precioParaHora(tarifas, formato, hora) {
  const min = horaAMinutos(hora);
  const t = tarifas.find(
    (t) => t.formato === formato && min >= horaAMinutos(t.hora_inicio) && min < horaAMinutos(t.hora_fin)
  );
  return t ? t.precio : null;
}

const JUEGOS_PARA_GRATIS = 10;

export default function BookingApp() {
  const [step, setStep] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState("");

  const [canchas, setCanchas] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [reservasDelDia, setReservasDelDia] = useState([]);
  const [reservasFijas, setReservasFijas] = useState([]);

  const today = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [fecha, setFecha] = useState(null);

  const [cancha, setCancha] = useState(null);
  const [hora, setHora] = useState(null);

  const [nombre, setNombre] = useState("");
  const [cedula, setCedula] = useState("");
  const [telefono, setTelefono] = useState("");
  const [fechaNacimiento, setFechaNacimiento] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [codigo, setCodigo] = useState("");

  // Fidelización
  const [juegosPagados, setJuegosPagados] = useState(null); // null = aún no consultado
  const [consultandoCliente, setConsultandoCliente] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [cs, ts, fj] = await Promise.all([
          sb("canchas?activa=eq.true&order=nombre.asc"),
          sb("tarifas?select=*"),
          sb("reservas?es_fija=eq.true&estado=eq.confirmada&select=cancha_id,hora,fecha"),
        ]);
        setCanchas(cs);
        setTarifas(ts);
        setReservasFijas(fj);
      } catch (e) {
        setError(e.message);
      } finally {
        setCargando(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!fecha) return;
    (async () => {
      try {
        const rs = await sb(
          `reservas?fecha=eq.${toYMD(fecha)}&estado=eq.confirmada&select=cancha_id,hora`
        );
        setReservasDelDia(rs);
      } catch (e) {
        setError(e.message);
      }
    })();
  }, [fecha]);

  function ocupada(canchaId, h) {
    const exacta = reservasDelDia.some((r) => r.cancha_id === canchaId && r.hora.slice(0, 5) === h);
    if (exacta) return true;
    if (!fecha) return false;
    const diaSemana = fecha.getDay();
    return reservasFijas.some((r) => {
      if (r.cancha_id !== canchaId || r.hora.slice(0, 5) !== h) return false;
      const origen = new Date(r.fecha + "T00:00:00");
      return origen.getDay() === diaSemana && origen <= fecha;
    });
  }
  function canchaTieneCupo(c) {
    return FRANJAS.some((h) => !ocupada(c.id, h) && precioParaHora(tarifas, c.formato, h));
  }

  // Consulta cuántos juegos pagados lleva este cliente (por cédula) al perder el foco del campo
  async function consultarFidelizacion() {
    if (!cedula || cedula.length < 4) {
      setJuegosPagados(null);
      return;
    }
    setConsultandoCliente(true);
    try {
      const res = await sb("rpc/buscar_cliente_por_cedula", {
        method: "POST",
        body: JSON.stringify({ p_cedula: cedula }),
      });
      if (!res || res.length === 0) {
        setJuegosPagados(0);
        return;
      }
      setJuegosPagados(res[0].juegos_pagados % JUEGOS_PARA_GRATIS);
    } catch (e) {
      setJuegosPagados(null);
    } finally {
      setConsultandoCliente(false);
    }
  }

  const seraGratis = juegosPagados === JUEGOS_PARA_GRATIS - 1;

  const esCumple = useMemo(() => {
    if (!fechaNacimiento || !fecha) return false;
    const [, mm, dd] = fechaNacimiento.split("-").map(Number);
    return fecha.getMonth() + 1 === mm && fecha.getDate() === dd;
  }, [fechaNacimiento, fecha]);

  const descuentoPct = esCumple ? 10 : 0;

  async function confirmarReserva() {
    setGuardando(true);
    setError("");
    try {
      let clienteId;
      const res = await sb("rpc/buscar_cliente_por_cedula", {
        method: "POST",
        body: JSON.stringify({ p_cedula: cedula }),
      });

      if (res && res.length > 0 && res[0].id) {
        clienteId = res[0].id;
        if (fechaNacimiento) {
          await sb(`clientes?id=eq.${clienteId}`, {
            method: "PATCH",
            prefer: "return=minimal",
            body: JSON.stringify({ fecha_nacimiento: fechaNacimiento }),
          });
        }
      } else {
        clienteId = crypto.randomUUID();
        await sb("clientes", {
          method: "POST",
          prefer: "return=minimal",
          body: JSON.stringify({
            id: clienteId,
            nombre,
            cedula,
            telefono,
            fecha_nacimiento: fechaNacimiento || null,
          }),
        });
      }

      await sb("reservas", {
        method: "POST",
        prefer: "return=minimal",
        body: JSON.stringify({
          cancha_id: cancha.id,
          cliente_id: clienteId,
          fecha: toYMD(fecha),
          hora,
          estado: "confirmada",
          deposito_pagado: seraGratis ? true : false,
          monto_deposito: seraGratis ? 0 : 50000,
          es_gratis: seraGratis,
          descuento_porcentaje: descuentoPct,
          motivo_descuento: esCumple ? "cumpleaños" : null,
          es_fija: false,
        }),
      });

      const c = "AFC-" + Math.random().toString(36).slice(2, 7).toUpperCase();
      setCodigo(c);
      setStep(4);
    } catch (e) {
      setError("No se pudo guardar la reserva. " + e.message);
    } finally {
      setGuardando(false);
    }
  }

  function reiniciar() {
    setFecha(null);
    setCancha(null);
    setHora(null);
    setNombre("");
    setCedula("");
    setTelefono("");
    setCodigo("");
    setError("");
    setJuegosPagados(null);
    setStep(1);
  }

  const cells = useMemo(() => buildMonthGrid(viewYear, viewMonth), [viewYear, viewMonth]);
  const precioSeleccionado = cancha && hora ? precioParaHora(tarifas, cancha.formato, hora) : null;

  return (
    <div
      style={{ background: COLORS.bg, color: COLORS.textHi, fontFamily: "'Inter', sans-serif" }}
      className="min-h-screen w-full flex items-center justify-center p-4"
    >
      <div
        style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, boxShadow: "0 30px 80px -30px rgba(0,0,0,0.7)" }}
        className="w-full max-w-sm rounded-[2rem] overflow-hidden flex flex-col"
      >
        <div className="h-6 flex items-center justify-center">
          <div className="w-24 h-1.5 rounded-full" style={{ background: COLORS.line }} />
        </div>

        <div
          className="px-5 pt-2 pb-4 flex items-center gap-3 relative overflow-hidden"
          style={{ borderBottom: `1px solid ${COLORS.line}` }}
        >
          <div
            className="absolute -right-6 -top-6 w-16 h-24"
            style={{ background: COLORS.turf, transform: "skewX(-14deg)", opacity: 0.9 }}
          />
          {step > 1 && step < 4 && (
            <button onClick={() => setStep(step - 1)} className="p-1.5 rounded-full z-10" style={{ background: COLORS.surfaceAlt }}>
              <ChevronLeft size={18} color={COLORS.textHi} />
            </button>
          )}
          <div className="z-10">
            <div className="flex items-center gap-1.5">
              <Zap size={14} color={COLORS.turf} fill={COLORS.turf} />
              <span className="text-[11px] tracking-[0.2em] uppercase" style={{ color: COLORS.textLo, fontWeight: 600 }}>
                Arena Fútbol Club
              </span>
            </div>
            <h1 className="text-xl leading-tight" style={{ fontWeight: 800, letterSpacing: "-0.02em" }}>
              {step === 1 && "¿Qué día quieres jugar?"}
              {step === 2 && "Cancha y hora disponible"}
              {step === 3 && "Confirma tu reserva"}
              {step === 4 && "¡Reserva lista!"}
            </h1>
          </div>
        </div>

        <div className="px-5 py-5 flex-1" style={{ minHeight: 480 }}>
          {cargando && (
            <div className="flex items-center justify-center h-full" style={{ color: COLORS.textLo }}>
              Cargando canchas...
            </div>
          )}

          {!cargando && error && step !== 4 && (
            <div className="rounded-lg px-3 py-2 mb-3" style={{ background: "#2A1614", border: `1px solid ${COLORS.danger}`, color: COLORS.danger, fontSize: 12 }}>
              {error}
            </div>
          )}

          {!cargando && step === 1 && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <button
                  onClick={() => {
                    const m = viewMonth === 0 ? 11 : viewMonth - 1;
                    const y = viewMonth === 0 ? viewYear - 1 : viewYear;
                    setViewMonth(m); setViewYear(y);
                  }}
                  className="p-1.5 rounded-full" style={{ background: COLORS.surfaceAlt }}
                >
                  <ChevronLeft size={16} />
                </button>
                <span style={{ fontWeight: 800, fontSize: 15, textTransform: "capitalize" }}>
                  {MESES[viewMonth]} {viewYear}
                </span>
                <button
                  onClick={() => {
                    const m = viewMonth === 11 ? 0 : viewMonth + 1;
                    const y = viewMonth === 11 ? viewYear + 1 : viewYear;
                    setViewMonth(m); setViewYear(y);
                  }}
                  className="p-1.5 rounded-full" style={{ background: COLORS.surfaceAlt }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-y-2">
                {DIAS_CORTOS.map((d, i) => (
                  <div key={i} className="text-center" style={{ fontSize: 11, color: COLORS.textLo, fontWeight: 700 }}>
                    {d}
                  </div>
                ))}
                {cells.map((d, i) => {
                  if (!d) return <div key={i} />;
                  const pasado = d < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                  const esHoy = toYMD(d) === toYMD(today);
                  const seleccionado = fecha && toYMD(d) === toYMD(fecha);
                  return (
                    <button
                      key={i}
                      disabled={pasado}
                      onClick={() => { setFecha(d); setCancha(null); setHora(null); setStep(2); }}
                      className="mx-auto flex flex-col items-center justify-center rounded-full"
                      style={{
                        width: 34, height: 34,
                        background: seleccionado ? COLORS.turf : esHoy ? COLORS.surfaceAlt : "transparent",
                        border: esHoy && !seleccionado ? `1px solid ${COLORS.turf}` : "none",
                        color: pasado ? COLORS.line : seleccionado ? "#0A0E14" : COLORS.textHi,
                        fontWeight: seleccionado || esHoy ? 800 : 500,
                        opacity: pasado ? 0.5 : 1,
                        cursor: pasado ? "not-allowed" : "pointer",
                      }}
                    >
                      {d.getDate()}
                    </button>
                  );
                })}
              </div>

              <div className="mt-1 rounded-xl px-3.5 py-3 flex items-start gap-2" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
                <MapPin size={14} color={COLORS.textLo} className="mt-0.5" />
                <p style={{ color: COLORS.textLo, fontSize: 12, lineHeight: 1.4 }}>
                  Barrio Bellavista, Pasto. Elige un día para ver canchas y horarios disponibles.
                </p>
              </div>
            </div>
          )}

          {!cargando && step === 2 && fecha && (
            <div className="flex flex-col gap-4">
              <div className="rounded-lg px-3 py-2 flex items-center justify-between" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
                <span style={{ fontSize: 12, color: COLORS.textLo }}>Fecha elegida</span>
                <span style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>
                  {fecha.getDate()} de {MESES[fecha.getMonth()]}
                </span>
              </div>

              <div className="flex flex-col gap-2.5">
                {canchas.map((c) => {
                  const disponible = canchaTieneCupo(c);
                  const active = cancha?.id === c.id;
                  return (
                    <button
                      key={c.id}
                      disabled={!disponible}
                      onClick={() => { setCancha(c); setHora(null); }}
                      className="text-left rounded-2xl overflow-hidden"
                      style={{ border: `1px solid ${active ? COLORS.turf : COLORS.line}`, background: COLORS.surfaceAlt, opacity: disponible ? 1 : 0.4 }}
                    >
                      <div className="p-3 flex items-center justify-between">
                        <div>
                          <div style={{ fontWeight: 700 }}>{c.nombre}</div>
                          <div className="flex items-center gap-1 mt-0.5" style={{ color: COLORS.textLo, fontSize: 11 }}>
                            <Users size={11} />
                            {c.formato}
                          </div>
                        </div>
                        <div style={{ color: COLORS.textLo, fontSize: 10 }}>
                          {disponible ? "disponible" : "sin cupo"}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              {cancha && (
                <div>
                  <div className="flex items-center gap-1.5 mb-2" style={{ color: COLORS.textLo, fontSize: 12 }}>
                    <Clock size={13} />
                    Horarios de {cancha.nombre}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {FRANJAS.map((h) => {
                      const precio = precioParaHora(tarifas, cancha.formato, h);
                      if (!precio) return null;
                      const taken = ocupada(cancha.id, h);
                      const active = hora === h;
                      return (
                        <button
                          key={h}
                          disabled={taken}
                          onClick={() => setHora(h)}
                          className="rounded-lg py-2 flex flex-col items-center"
                          style={{
                            background: active ? COLORS.flood : taken ? "transparent" : COLORS.surfaceAlt,
                            border: `1px solid ${active ? COLORS.flood : COLORS.line}`,
                            color: active ? "#0A0E14" : taken ? COLORS.line : COLORS.textHi,
                            textDecoration: taken ? "line-through" : "none",
                            cursor: taken ? "not-allowed" : "pointer",
                          }}
                        >
                          <span style={{ fontWeight: 800, fontSize: 13 }}>{h}</span>
                          <span style={{ fontSize: 9, opacity: 0.85 }}>{fmtMoney(precio)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <button
                disabled={!cancha || !hora}
                onClick={() => setStep(3)}
                className="mt-1 rounded-xl py-3 text-center"
                style={{ background: cancha && hora ? COLORS.turf : COLORS.surfaceAlt, color: cancha && hora ? "#0A0E14" : COLORS.textLo, fontWeight: 800 }}
              >
                Continuar
              </button>
            </div>
          )}

          {step === 3 && cancha && (
            <div className="flex flex-col gap-4">
              <div className="rounded-xl p-3.5" style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}` }}>
                <div className="flex justify-between" style={{ fontSize: 13 }}>
                  <span style={{ color: COLORS.textLo }}>Fecha</span>
                  <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{fecha.getDate()} de {MESES[fecha.getMonth()]}</span>
                </div>
                <div className="flex justify-between mt-1.5" style={{ fontSize: 13 }}>
                  <span style={{ color: COLORS.textLo }}>Cancha</span>
                  <span style={{ fontWeight: 700 }}>{cancha.nombre}</span>
                </div>
                <div className="flex justify-between mt-1.5" style={{ fontSize: 13 }}>
                  <span style={{ color: COLORS.textLo }}>Hora</span>
                  <span style={{ fontWeight: 700 }}>{hora}</span>
                </div>
                <div className="flex justify-between mt-2 pt-2" style={{ borderTop: `1px solid ${COLORS.line}`, fontSize: 14 }}>
                  <span style={{ color: COLORS.textLo }}>Valor cancha</span>
                  <span style={{ fontWeight: 800 }}>
                    {esCumple ? (
                      <>
                        <span style={{ textDecoration: "line-through", color: COLORS.textLo, fontWeight: 500, marginRight: 6 }}>
                          {fmtMoney(precioSeleccionado)}
                        </span>
                        {fmtMoney(Math.round(precioSeleccionado * 0.9))}
                      </>
                    ) : (
                      fmtMoney(precioSeleccionado)
                    )}
                  </span>
                </div>
                {esCumple && (
                  <div className="flex justify-between mt-1" style={{ fontSize: 12 }}>
                    <span style={{ color: COLORS.turf }}>🎂 Descuento de cumpleaños</span>
                    <span style={{ color: COLORS.turf, fontWeight: 700 }}>-10%</span>
                  </div>
                )}
                <div className="flex justify-between mt-1" style={{ fontSize: 13 }}>
                  <span style={{ color: COLORS.textLo }}>Depósito para reservar</span>
                  <span style={{ fontWeight: 800, color: seraGratis ? COLORS.turfBright : COLORS.flood }}>
                    {seraGratis ? "GRATIS 🎉" : fmtMoney(50000)}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2.5">
                <input
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Nombre completo"
                  className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.textHi }}
                />
                <input
                  value={cedula}
                  onChange={(e) => setCedula(e.target.value)}
                  onBlur={consultarFidelizacion}
                  placeholder="Cédula"
                  className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.textHi }}
                />
                <input
                  value={telefono}
                  onChange={(e) => setTelefono(e.target.value)}
                  placeholder="Número de celular"
                  className="rounded-xl px-3.5 py-2.5 text-sm outline-none"
                  style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.textHi }}
                />
                <div>
                  <label style={{ fontSize: 11, color: COLORS.textLo, marginBottom: 4, display: "block" }}>
                    Fecha de nacimiento (10% dcto. el día de tu cumpleaños)
                  </label>
                  <input
                    type="date"
                    value={fechaNacimiento}
                    onChange={(e) => setFechaNacimiento(e.target.value)}
                    className="rounded-xl px-3.5 py-2.5 text-sm outline-none w-full"
                    style={{ background: COLORS.surfaceAlt, border: `1px solid ${COLORS.line}`, color: COLORS.textHi }}
                  />
                </div>
              </div>

              {consultandoCliente && (
                <p style={{ color: COLORS.textLo, fontSize: 11 }}>Consultando historial del cliente...</p>
              )}
              {!consultandoCliente && juegosPagados !== null && (
                <div
                  className="rounded-lg px-3 py-2 flex items-center gap-2"
                  style={{
                    background: seraGratis ? "rgba(240,99,29,0.15)" : COLORS.surfaceAlt,
                    border: `1px solid ${seraGratis ? COLORS.turf : COLORS.line}`,
                  }}
                >
                  <Gift size={14} color={seraGratis ? COLORS.turfBright : COLORS.textLo} />
                  <span style={{ fontSize: 12, color: seraGratis ? COLORS.turfBright : COLORS.textLo }}>
                    {seraGratis
                      ? "¡Este juego le sale gratis por fidelidad!"
                      : `Cliente frecuente: ${juegosPagados}/${JUEGOS_PARA_GRATIS} juegos hacia su cancha gratis`}
                  </span>
                </div>
              )}

              {error && <p style={{ color: COLORS.danger, fontSize: 12 }}>{error}</p>}

              <p style={{ color: COLORS.textLo, fontSize: 11, lineHeight: 1.4 }}>
                La reserva queda fija una vez se registre el pago del depósito.
              </p>

              <button
                disabled={!nombre || !cedula || !telefono || guardando}
                onClick={confirmarReserva}
                className="rounded-xl py-3 text-center"
                style={{ background: nombre && cedula && telefono ? COLORS.turf : COLORS.surfaceAlt, color: nombre && cedula && telefono ? "#0A0E14" : COLORS.textLo, fontWeight: 800 }}
              >
                {guardando ? "Guardando..." : "Confirmar reserva"}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center text-center gap-4 pt-6">
              <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: COLORS.turf }}>
                <Check size={30} color="#0A0E14" strokeWidth={3} />
              </div>
              <div>
                <p style={{ fontWeight: 800, fontSize: 18 }}>Reserva confirmada</p>
                <p style={{ color: COLORS.textLo, fontSize: 13, marginTop: 4, textTransform: "capitalize" }}>
                  {cancha?.nombre} · {hora} · {fecha.getDate()} de {MESES[fecha.getMonth()]}
                </p>
                {seraGratis && (
                  <p style={{ color: COLORS.turfBright, fontSize: 12, marginTop: 4, fontWeight: 700 }}>
                    Cancha de regalo por fidelidad 🎉
                  </p>
                )}
              </div>
              <div className="rounded-xl px-5 py-3 w-full" style={{ background: COLORS.surfaceAlt, border: `1px dashed ${COLORS.turf}` }}>
                <div style={{ fontSize: 11, color: COLORS.textLo, letterSpacing: "0.15em" }}>CÓDIGO</div>
                <div style={{ fontWeight: 800, fontSize: 20, color: COLORS.flood, letterSpacing: "0.05em" }}>{codigo}</div>
              </div>
              <button onClick={reiniciar} className="rounded-xl py-3 w-full mt-2" style={{ background: COLORS.turf, color: "#0A0E14", fontWeight: 800 }}>
                Hacer otra reserva
              </button>
            </div>
          )}
        </div>

        <div className="flex justify-center gap-1.5 pb-5">
          {[1, 2, 3, 4].map((s) => (
            <div key={s} className="rounded-full transition-all" style={{ height: 5, width: s === step ? 18 : 5, background: s <= step ? COLORS.turf : COLORS.line }} />
          ))}
        </div>
      </div>
    </div>
  );
}
