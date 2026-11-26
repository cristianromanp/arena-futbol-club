import React, { useState, useEffect, useMemo } from "react";
import "./staff.css";
import { entrar, salir, sesionActual, rest, hoyYMD } from "../lib/api.js";
import { useToast, useCada } from "./comun.jsx";
import { Dia, NuevaReserva } from "./Dia.jsx";
import { Vender, Pedido, Inventario, VentasDia, Cierre, lineaCancha } from "./Caja.jsx";
import { Informe } from "./Informe.jsx";

function Login({ onEntrar }) {
  const [email, setEmail] = useState("");
  const [clave, setClave] = useState("");
  const [err, setErr] = useState("");
  const [cargando, setCargando] = useState(false);
  const go = async (e) => {
    e.preventDefault(); setCargando(true); setErr("");
    try { onEntrar(await entrar(email.trim(), clave)); } catch (x) { setErr(x.message); } finally { setCargando(false); }
  };
  return (
    <div className="st" style={{ display: "grid", placeItems: "center", padding: 16 }}>
      <form className="card" style={{ width: "min(420px,100%)" }} onSubmit={go}>
        <h2>Arena Fútbol Club</h2>
        <p className="muted">Entre con su correo y contraseña</p>
        <label className="lb" htmlFor="em">Correo</label>
        <input id="em" className="in" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} />
        <label className="lb" htmlFor="pw">Contraseña</label>
        <input id="pw" className="in" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} />
        {err && <p className="err" style={{ marginTop: 12 }}>{err}</p>}
        <button className="btn pri big full" style={{ marginTop: 16 }} disabled={cargando || !email || !clave}>{cargando ? "Entrando…" : "Entrar"}</button>
      </form>
    </div>
  );
}

export default function StaffApp() {
  const [sesion, setSesion] = useState(sesionActual());
  useEffect(() => {
    const f = () => setSesion(null);
    window.addEventListener("arena-sesion-vencida", f);
    return () => window.removeEventListener("arena-sesion-vencida", f);
  }, []);
  if (!sesion?.perfil) return <Login onEntrar={setSesion} />;
  return <Panel perfil={sesion.perfil} onSalir={() => { salir(); setSesion(null); }} />;
}

function Panel({ perfil, onSalir }) {
  const [tab, setTab] = useState("dia");
  const [canchas, setCanchas] = useState([]);
  const [tarifas, setTarifas] = useState([]);
  const [productos, setProductos] = useState([]);
  const [ventas, setVentas] = useState([]);
  const [carrito, setCarrito] = useState([]);
  const [previo, setPrevio] = useState(null);
  const [err, setErr] = useState("");
  const [visto, setVisto] = useState(null);
  const [toastVista, toast] = useToast();
  const admin = perfil.rol === "admin";

  useEffect(() => {
    Promise.all([rest("canchas?activa=eq.true&order=orden.asc"), rest("tarifas?select=*")])
      .then(([c, t]) => { setCanchas(c || []); setTarifas(t || []); })
      .catch((e) => setErr("No se pudo conectar. Revise el internet. " + e.message));
  }, []);
  const cargarProductos = async () => { try { setProductos(await rest("productos?order=orden.asc") || []); } catch { /* reintenta */ } };
  const cargarVentas = async () => {
    try { setVentas(await rest(`ventas?fecha=eq.${hoyYMD()}&anulada=is.false&order=creado_en.desc`) || []); setVisto(new Date()); setErr(""); }
    catch (e) { setErr("No se pudieron cargar las ventas. " + e.message); }
  };
  useCada(cargarProductos, 20000, []);
  useCada(cargarVentas, 15000, []);

  // Reservas ya cobradas (para no cobrarlas dos veces)
  const cobradas = useMemo(() => {
    const s = new Set();
    for (const v of ventas) for (const i of v.items || []) if (i.tipo === "cancha" && i.reserva_id) s.add(i.reserva_id + "|" + i.fecha_juego);
    return s;
  }, [ventas]);

  const tabs = [
    ["dia", "Canchas"], ["vender", "Vender"], ["nueva", "Nueva reserva"], ["pedido", "Recibir pedido"],
    ["inventario", "Inventario"], ["ventas", "Ventas de hoy"], ["cierre", "Cerrar caja"], ...(admin ? [["informe", "Informe"]] : []),
  ];

  return (
    <div className="st">
      <header className="st-top">
        <div className="st-brand">Arena<small>{perfil.nombre} · {visto ? "actualizado " + visto.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" }) : "conectando…"}</small></div>
        <nav className="st-tabs" role="tablist">
          {tabs.map(([id, l]) => (
            <button key={id} role="tab" className="st-tab" aria-selected={tab === id} onClick={() => { setTab(id); if (id === "nueva") setPrevio(null); }}>
              {l}{id === "vender" && carrito.length > 0 && <span className="n">{carrito.length}</span>}
            </button>
          ))}
        </nav>
        <button className="st-out" onClick={onSalir}>Salir</button>
      </header>
      <main className="st-main">
        {err && <p className="err">{err}</p>}
        {tab === "dia" && <Dia canchas={canchas} tarifas={tarifas} perfil={perfil} cobradas={cobradas} toast={toast}
          onCobrar={(r, fecha) => { setCarrito((c) => (c.some((l) => l.key === "r" + r.id + fecha) ? c : [...c, lineaCancha(r, fecha, tarifas)])); setTab("vender"); }}
          onNueva={(p) => { setPrevio(p); setTab("nueva"); }} />}
        {tab === "vender" && <Vender productos={productos} tarifas={tarifas} cobradas={cobradas} carrito={carrito} setCarrito={setCarrito} toast={toast}
          onVendido={() => { cargarVentas(); cargarProductos(); }} />}
        {tab === "nueva" && <NuevaReserva key={JSON.stringify(previo)} canchas={canchas} tarifas={tarifas} perfil={perfil} previo={previo} toast={toast}
          onListo={() => setTab("dia")} />}
        {tab === "pedido" && <Pedido productos={productos} toast={toast} onGuardado={cargarProductos} />}
        {tab === "inventario" && <Inventario productos={productos} perfil={perfil} toast={toast} onCambio={cargarProductos} />}
        {tab === "ventas" && <VentasDia ventas={ventas} toast={toast} onAnulada={() => { cargarVentas(); cargarProductos(); }} />}
        {tab === "cierre" && <Cierre ventas={ventas} perfil={perfil} toast={toast} />}
        {tab === "informe" && admin && <Informe />}
      </main>
      {toastVista}
    </div>
  );
}
