import React, { useState, useMemo } from "react";
import { rest, reservasDelDia, precioCancha, fmtMoney, horaBonita, hoyYMD, ymd, fechaLocal } from "../lib/api.js";
import { Modal, Confirmar, Chip, HORAS, TIPOS, DEP_FIJA, DEP_DIARIA, useCada } from "./comun.jsx";

const hh = (r) => parseInt(String(r.hora).slice(0, 2), 10);

// Valor a cobrar de una reserva en un día
export function valorReserva(r, tarifas) {
  const tarifa = precioCancha(tarifas, r.canchas?.formato || "Fútbol 6", r.hora) || 0;
  if (r.es_gratis) return { tarifa, descuento: 0, deposito: 0, cobrar: 0 };
  const descuento = Math.round((tarifa * (r.descuento_porcentaje || 0)) / 100);
  // En las del día el depósito es un abono; en las fijas es una garantía que se queda.
  const deposito = !r.es_fija && r.deposito_pagado ? r.monto_deposito || 0 : 0;
  return { tarifa, descuento, deposito, cobrar: Math.max(0, tarifa - descuento - deposito) };
}

export function Dia({ canchas, tarifas, perfil, cobradas, onCobrar, onNueva, toast }) {
  const [fecha, setFecha] = useState(hoyYMD());
  const [reservas, setReservas] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [err, setErr] = useState("");
  const [sel, setSel] = useState(null);

  const cargar = async () => {
    try { setReservas(await reservasDelDia(fecha)); setErr(""); }
    catch (e) { setErr("No se pudieron cargar las reservas. " + e.message); }
    finally { setCargando(false); }
  };
  useCada(cargar, 20000, [fecha]);

  const mover = (dias) => { const d = fechaLocal(fecha); d.setDate(d.getDate() + dias); setFecha(ymd(d)); setCargando(true); };
  const t0 = fechaLocal(fecha).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  const titulo = t0.charAt(0).toUpperCase() + t0.slice(1);
  const sinCancha = reservas.filter((r) => !r.cancha_id);
  const en = (cid, h) => reservas.filter((r) => r.cancha_id === cid && hh(r) === h);
  const actual = sel && reservas.find((r) => r.id === sel);

  return (
    <section>
      <div className="daybar">
        <button className="btn" onClick={() => mover(-1)} aria-label="Día anterior">‹</button>
        <span className="t">{titulo}</span>
        <button className="btn" onClick={() => mover(1)} aria-label="Día siguiente">›</button>
        {fecha !== hoyYMD() && <button className="btn" onClick={() => setFecha(hoyYMD())}>Hoy</button>}
        <input type="date" className="in" style={{ width: "auto" }} value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} />
        <span className="muted">{reservas.length} reservas · toque una cancha libre para reservar</span>
      </div>
      {err && <p className="err">{err}</p>}
      {sinCancha.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b>Sin cancha asignada:</b>{" "}
          {sinCancha.map((r) => <button key={r.id} className="pill" style={{ marginLeft: 6 }} onClick={() => setSel(r.id)}>{horaBonita(r.hora)} · {r.clientes?.nombre}</button>)}
        </div>
      )}
      <div className="grid-dia">
        <div />
        {canchas.map((c) => <div key={c.id} className="hd">{c.nombre}</div>)}
        {HORAS.map((h) => (
          <React.Fragment key={h}>
            <div className="hr">{horaBonita(h)}</div>
            {canchas.map((c) => {
              const rs = en(c.id, h);
              if (!rs.length) {
                return <button key={c.id} className="cell libre" onClick={() => onNueva({ fecha, hora: h, cancha_id: c.id })}>{cargando ? "…" : "Libre"}</button>;
              }
              const r = rs[0];
              const pagada = cobradas.has(r.id + "|" + fecha);
              return (
                <button key={c.id} className={"cell oc " + r.tipo + (pagada ? " cobrada" : "")} onClick={() => setSel(r.id)}>
                  <b>{r.clientes?.nombre || "Cliente"}</b>
                  <small>{pagada ? "✓ Cobrada" : TIPOS[r.tipo]}{rs.length > 1 ? ` · +${rs.length - 1} más` : ""}</small>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {actual && (
        <Detalle r={actual} fecha={fecha} canchas={canchas} tarifas={tarifas} perfil={perfil} reservas={reservas}
          pagada={cobradas.has(actual.id + "|" + fecha)} toast={toast}
          onCobrar={() => { onCobrar(actual, fecha); setSel(null); }}
          onClose={() => setSel(null)} onCambio={cargar} />
      )}
    </section>
  );
}

function Detalle({ r, fecha, canchas, tarifas, perfil, reservas, pagada, toast, onCobrar, onClose, onCambio }) {
  const [conf, setConf] = useState(null);
  const v = valorReserva(r, tarifas);
  const ocupadas = new Set(reservas.filter((x) => x.id !== r.id && hh(x) === hh(r)).map((x) => x.cancha_id));
  const libres = canchas.filter((c) => c.id !== r.cancha_id && !ocupadas.has(c.id) && c.formato === (r.canchas?.formato || c.formato));
  const hacer = async (fn, ok) => { try { await fn(); toast(ok); await onCambio(); setConf(null); onClose(); } catch (e) { toast("No se pudo: " + e.message, true); } };
  const patch = (body) => rest(`reservas?id=eq.${r.id}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(body) });

  if (conf) return <Confirmar {...conf} onNo={() => setConf(null)} />;
  return (
    <Modal onClose={onClose}>
      <h3>{r.clientes?.nombre || "Cliente"}</h3>
      <p className="row" style={{ margin: "4px 0 10px" }}>
        <Chip tipo={r.tipo} />
        <span className="chip">{r.canchas?.nombre || "Sin cancha"} · {horaBonita(r.hora)}</span>
        {r.cancha_flexible && <span className="chip blue">Se puede mover</span>}
        {r.clientes?.de_confianza && <span className="chip fija">De confianza</span>}
        {pagada && <span className="chip fija">✓ Cobrada</span>}
      </p>
      {r.clientes?.telefono && <p className="muted">Tel. {r.clientes.telefono}</p>}
      <ul className="calc">
        <li><span>Valor de la hora</span><b>{fmtMoney(v.tarifa)}</b></li>
        {v.descuento > 0 && <li><span>Descuento {r.descuento_porcentaje}% {r.motivo_descuento ? `(${r.motivo_descuento})` : ""}</span><b>-{fmtMoney(v.descuento)}</b></li>}
        {v.deposito > 0 && <li><span>Depósito ya pagado</span><b>-{fmtMoney(v.deposito)}</b></li>}
        {r.es_gratis && <li><span>Hora gratis por bono</span><b>$0</b></li>}
        <li><span><b>Cobrar hoy</b></span><b>{fmtMoney(v.cobrar)}</b></li>
        <li><span>Depósito</span><b>{r.monto_deposito ? (r.deposito_pagado ? `Pagado (${fmtMoney(r.monto_deposito)})` : `Pendiente (${fmtMoney(r.monto_deposito)})`) : "Sin depósito"}</b></li>
      </ul>
      {r.notas && <p className="muted">{r.notas}</p>}

      {!pagada && <button className="btn ok big full" style={{ marginTop: 14 }} onClick={onCobrar}>Cobrar {fmtMoney(v.cobrar)}</button>}

      {libres.length > 0 && (
        <>
          <label className="lb">Mover a otra cancha{r.es_fija ? " (todas las semanas)" : ""}</label>
          <div className="pills">
            {libres.map((c) => <button key={c.id} className="pill free" onClick={() => hacer(() => patch({ cancha_id: c.id }), `Movida a ${c.nombre}`)}>{c.nombre}</button>)}
          </div>
        </>
      )}

      <div className="two" style={{ marginTop: 10 }}>
        {r.monto_deposito > 0 && (
          <button className="btn" onClick={() => hacer(() => patch({ deposito_pagado: !r.deposito_pagado }), "Depósito actualizado")}>
            {r.deposito_pagado ? "Quitar depósito" : "Marcar depósito pagado"}
          </button>
        )}
        {r.cliente_id && (
          <button className="btn" onClick={() => hacer(() => rest(`clientes?id=eq.${r.cliente_id}`, { method: "PATCH", prefer: "return=minimal",
            body: JSON.stringify({ de_confianza: !r.clientes?.de_confianza, confianza_marcada_por: r.clientes?.de_confianza ? null : perfil.nombre }) }), "Cliente actualizado")}>
            {r.clientes?.de_confianza ? "Quitar confianza" : "Marcar de confianza"}
          </button>
        )}
        {r.es_fija && (
          <button className="btn" onClick={() => setConf({ titulo: "¿Avisó que no viene esta semana?", texto: "Se libera la cancha solo este día. La reserva fija sigue las otras semanas.", si: "Sí, avisó", peligro: false,
            onSi: () => hacer(() => rest("reserva_excepciones", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ reserva_id: r.id, fecha, motivo: "avisó" }) }), "Cancha liberada este día") })}>
            Avisó que no viene
          </button>
        )}
        <button className="btn" onClick={() => setConf(r.es_fija
          ? { titulo: "¿No vino y no avisó?", texto: "Pierde el depósito y la cancha fija queda libre. Para volver a tenerla debe pagar otra vez el depósito.", si: "Sí, no vino",
              onSi: () => hacer(() => patch({ estado: "no_asistio", deposito_pagado: false, notas: [r.notas, `No vino el ${fecha}: perdió el depósito`].filter(Boolean).join("; ") }), "Marcado: no vino") }
          : { titulo: "¿No vino?", texto: "La reserva queda marcada como no asistió" + (r.deposito_pagado ? " y pierde el depósito." : "."), si: "Sí, no vino",
              onSi: () => hacer(() => patch({ estado: "no_asistio" }), "Marcado: no vino") })}>
          No vino
        </button>
        <button className="btn" style={{ color: "var(--bad)" }} onClick={() => setConf({ titulo: "¿Cancelar la reserva?", texto: r.es_fija ? "Se cancela la reserva fija de todas las semanas." : "Se libera la cancha.", si: "Sí, cancelar",
          onSi: () => hacer(() => patch({ estado: "cancelada" }), "Reserva cancelada") })}>
          Cancelar reserva
        </button>
      </div>
      <button className="btn full" style={{ marginTop: 12 }} onClick={onClose}>Cerrar</button>
    </Modal>
  );
}

// ---------- Nueva reserva ----------
export function NuevaReserva({ canchas, tarifas, perfil, previo, onListo, toast }) {
  const [fecha, setFecha] = useState(previo?.fecha || hoyYMD());
  const [hora, setHora] = useState(previo?.hora ?? null);
  const [canchaId, setCanchaId] = useState(previo?.cancha_id || null);
  const [ocupadas, setOcupadas] = useState([]);
  const [q, setQ] = useState("");
  const [encontrados, setEncontrados] = useState([]);
  const [cliente, setCliente] = useState(null);
  const [nuevo, setNuevo] = useState({ nombre: "", telefono: "", cedula: "" });
  const [tipo, setTipo] = useState("diaria");
  const [repite, setRepite] = useState(false);
  const [depPagado, setDepPagado] = useState(false);
  const [confianza, setConfianza] = useState(false);
  const [cumple, setCumple] = useState(false);
  const [descuento, setDescuento] = useState(0);
  const [notas, setNotas] = useState("");
  const [guardando, setGuardando] = useState(false);
  const esAdmin = perfil.rol === "admin";

  useCada(async () => { try { setOcupadas(await reservasDelDia(fecha)); } catch { /* reintenta */ } }, 30000, [fecha]);

  const buscar = async (texto) => {
    setQ(texto);
    const limpio = texto.replace(/[^\p{L}\p{N} ]/gu, "").trim();
    if (limpio.length < 2) { setEncontrados([]); return; }
    try {
      const p = encodeURIComponent(`*${limpio}*`);
      setEncontrados(await rest(`clientes?or=(nombre.ilike.${p},cedula.ilike.${p},telefono.ilike.${p})&order=nombre&limit=8&select=id,nombre,telefono,cedula,de_confianza`) || []);
    } catch { setEncontrados([]); }
  };

  const cancha = canchas.find((c) => c.id === canchaId);
  const ocupada = (cid, h) => ocupadas.some((r) => r.cancha_id === cid && hh(r) === h);
  const deConfianza = confianza || cliente?.de_confianza;
  const monto = deConfianza ? 0 : tipo === "fija" ? DEP_FIJA : tipo === "diaria" ? DEP_DIARIA : 0;
  const tarifa = cancha && hora != null ? precioCancha(tarifas, cancha.formato, `${hora}:00`) : null;
  const pct = cumple ? 10 : descuento;
  const listo = canchaId && hora != null && (cliente || nuevo.nombre.trim()) && !ocupada(canchaId, hora);

  const elegirTipo = (t) => { setTipo(t); setRepite(t !== "diaria"); };

  const guardar = async () => {
    setGuardando(true);
    try {
      let clienteId = cliente?.id;
      if (!clienteId) {
        const creado = await rest("clientes", { method: "POST", body: JSON.stringify({
          nombre: nuevo.nombre.trim(), telefono: nuevo.telefono.trim() || null, cedula: nuevo.cedula.trim() || null,
          de_confianza: confianza, confianza_marcada_por: confianza ? perfil.nombre : null }) });
        clienteId = creado[0].id;
      } else if (confianza && !cliente.de_confianza) {
        await rest(`clientes?id=eq.${clienteId}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify({ de_confianza: true, confianza_marcada_por: perfil.nombre }) });
      }
      await rest("reservas", { method: "POST", prefer: "return=minimal", body: JSON.stringify({
        cancha_id: canchaId, cliente_id: clienteId, fecha, hora: `${String(hora).padStart(2, "0")}:00`,
        tipo, es_fija: repite, estado: "confirmada", origen: "caja",
        monto_deposito: monto, deposito_pagado: monto > 0 && depPagado,
        descuento_porcentaje: pct, motivo_descuento: cumple ? "cumpleaños" : pct > 0 ? `especial (${perfil.nombre})` : null,
        notas: notas.trim() || null }) });
      toast("Reserva guardada ✓");
      onListo(fecha);
    } catch (e) {
      toast(e.message.includes("clientes_cedula_key") ? "Ya existe un cliente con esa cédula: búsquelo arriba." : "No se pudo guardar: " + e.message, true);
    } finally { setGuardando(false); }
  };

  return (
    <section className="card" style={{ maxWidth: 820, margin: "0 auto" }}>
      <h2>Nueva reserva</h2>
      <div className="row">
        <div className="grow"><label className="lb">Día</label><input type="date" className="in" value={fecha} onChange={(e) => e.target.value && setFecha(e.target.value)} /></div>
      </div>
      <label className="lb">Hora</label>
      <div className="pills">
        {HORAS.map((h) => (
          <button key={h} className="pill" aria-pressed={hora === h} onClick={() => setHora(h)}>{horaBonita(h)}</button>
        ))}
      </div>
      <label className="lb">Cancha</label>
      <div className="pills">
        {canchas.map((c) => {
          const oc = hora != null && ocupada(c.id, hora);
          return <button key={c.id} className={"pill" + (oc ? "" : " free")} disabled={oc} aria-pressed={canchaId === c.id} onClick={() => setCanchaId(c.id)}>
            {c.nombre}{oc ? " (ocupada)" : ""}</button>;
        })}
      </div>
      {tarifa != null && <p className="muted">Valor de la hora: <b>{fmtMoney(tarifa)}</b></p>}

      <label className="lb">Cliente</label>
      {cliente ? (
        <div className="row card" style={{ padding: 10 }}>
          <b className="grow">{cliente.nombre}{cliente.telefono ? ` · ${cliente.telefono}` : ""}</b>
          {cliente.de_confianza && <span className="chip fija">De confianza</span>}
          <button className="link" onClick={() => setCliente(null)}>Cambiar</button>
        </div>
      ) : (
        <>
          <input className="in" placeholder="Buscar por nombre, cédula o celular…" value={q} onChange={(e) => buscar(e.target.value)} />
          {encontrados.length > 0 && (
            <div className="found">
              {encontrados.map((c) => <button key={c.id} onClick={() => { setCliente(c); setEncontrados([]); }}>
                <b>{c.nombre}</b> <span className="muted">{[c.telefono, c.cedula && `CC ${c.cedula}`].filter(Boolean).join(" · ")}</span>
                {c.de_confianza ? " · De confianza" : ""}</button>)}
            </div>
          )}
          <p className="muted" style={{ margin: "10px 0 0" }}>¿Cliente nuevo? Escriba sus datos:</p>
          <div className="row">
            <input className="in grow" placeholder="Nombre" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} />
            <input className="in grow" placeholder="Celular" inputMode="tel" value={nuevo.telefono} onChange={(e) => setNuevo({ ...nuevo, telefono: e.target.value })} />
            <input className="in grow" placeholder="Cédula (opcional)" inputMode="numeric" value={nuevo.cedula} onChange={(e) => setNuevo({ ...nuevo, cedula: e.target.value })} />
          </div>
        </>
      )}

      <label className="lb">Tipo de reserva</label>
      <div className="pills">
        {["diaria", "fija", ...(esAdmin ? ["academia", "especial"] : [])].map((t) => (
          <button key={t} className="pill" aria-pressed={tipo === t} onClick={() => elegirTipo(t)}>{TIPOS[t]}</button>
        ))}
      </div>
      <label className="check"><input type="checkbox" checked={repite} onChange={(e) => setRepite(e.target.checked)} /> Se repite todas las semanas a esta hora</label>
      {!cliente?.de_confianza && (
        <label className="check"><input type="checkbox" checked={confianza} onChange={(e) => setConfianza(e.target.checked)} /> Cliente de confianza (no deja depósito)</label>
      )}
      {monto > 0 ? (
        <label className="check warn"><input type="checkbox" checked={depPagado} onChange={(e) => setDepPagado(e.target.checked)} /> Ya pagó el depósito de {fmtMoney(monto)}</label>
      ) : (
        <p className="muted">{deConfianza ? "Cliente de confianza: no necesita depósito." : "Sin depósito."}</p>
      )}
      <label className="check"><input type="checkbox" checked={cumple} onChange={(e) => setCumple(e.target.checked)} /> Cumpleaños: 10% de descuento</label>
      {esAdmin && !cumple && (
        <><label className="lb">Descuento especial (%)</label>
          <input className="in" style={{ maxWidth: 160 }} inputMode="numeric" value={descuento || ""} placeholder="0"
            onChange={(e) => setDescuento(Math.min(100, parseInt(e.target.value.replace(/\D/g, ""), 10) || 0))} /></>
      )}
      <label className="lb">Notas (opcional)</label>
      <input className="in" value={notas} onChange={(e) => setNotas(e.target.value)} />
      {canchaId && hora != null && ocupada(canchaId, hora) && <p className="err" style={{ marginTop: 12 }}>Esa cancha ya está ocupada a esa hora.</p>}
      <button className="btn pri big full" style={{ marginTop: 16 }} disabled={!listo || guardando} onClick={guardar}>
        {guardando ? "Guardando…" : "Guardar reserva"}
      </button>
    </section>
  );
}
