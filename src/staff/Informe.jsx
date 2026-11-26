import React, { useState, useMemo } from "react";
import { rest, fmtMoney, horaBonita, hoyYMD } from "../lib/api.js";
import { useCada } from "./comun.jsx";
import { resumen } from "./Caja.jsx";

// Informe del mes para el administrador, con descarga para Excel.
export function Informe() {
  const [mes, setMes] = useState(hoyYMD().slice(0, 7));
  const [ventas, setVentas] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [err, setErr] = useState("");
  const desde = `${mes}-01`;
  const [y, m] = mes.split("-").map(Number);
  const hasta = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;

  useCada(async () => {
    try {
      const [v, c] = await Promise.all([
        rest(`ventas?fecha=gte.${desde}&fecha=lt.${hasta}&anulada=is.false&order=creado_en.asc&limit=10000`),
        rest(`cierres?fecha=gte.${desde}&fecha=lt.${hasta}&order=fecha.asc`),
      ]);
      setVentas(v || []); setCierres(c || []); setErr("");
    } catch (e) { setErr("No se pudo cargar el informe. " + e.message); }
  }, 60000, [mes]);

  const d = useMemo(() => {
    const porCancha = {}, porHora = {}, porProducto = {}, porDia = {}, porTipo = {};
    for (const v of ventas) {
      porDia[v.fecha] = (porDia[v.fecha] || 0) + v.total;
      for (const i of v.items || []) {
        const sub = (i.precio || 0) * (i.cantidad || 0);
        if (i.tipo === "cancha") {
          const c = (porCancha[i.cancha || "?"] ||= { horas: 0, valor: 0, gratis: 0 });
          c.horas++; c.valor += sub; if (i.bono) c.gratis++;
          const h = (porHora[i.hora || "?"] ||= { horas: 0, valor: 0 }); h.horas++; h.valor += sub;
          const t = (porTipo[i.reserva_tipo || "diaria"] ||= { horas: 0, valor: 0 }); t.horas++; t.valor += sub;
        } else {
          const p = (porProducto[i.nombre] ||= { unidades: 0, valor: 0, ganancia: 0, sinCosto: false });
          p.unidades += i.cantidad; p.valor += sub;
          if (i.costo == null) p.sinCosto = true; else p.ganancia += sub - i.costo * i.cantidad;
        }
      }
    }
    const ord = (o, k) => Object.entries(o).sort((a, b) => b[1][k] - a[1][k]);
    return { r: resumen(ventas), porCancha: ord(porCancha, "valor"), porHora: Object.entries(porHora).sort((a, b) => b[1].horas - a[1].horas),
      porProducto: ord(porProducto, "valor"), porDia: Object.entries(porDia).sort(), porTipo: ord(porTipo, "horas") };
  }, [ventas]);

  const maxHora = Math.max(1, ...d.porHora.map(([, x]) => x.horas));
  const difCierres = cierres.reduce((a, c) => a + c.diferencia, 0);

  const descargar = () => {
    const s = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const filas = [
      [`Informe Arena Fútbol Club ${mes}`], [],
      ["Resumen"], ["Total vendido", d.r.total], ["Canchas", d.r.canchas], ["Cafetería", d.r.cafeteria], ["Ganancia cafetería (productos con costo)", d.r.ganancia],
      ["Efectivo", d.r.efectivo], ["Bold / QR", d.r.bold], ["Horas gratis por bono", d.r.bonos], ["Diferencia acumulada en cierres", difCierres], [],
      ["Canchas", "Horas", "Valor", "Horas gratis"], ...d.porCancha.map(([k, x]) => [k, x.horas, x.valor, x.gratis]), [],
      ["Hora", "Horas vendidas", "Valor"], ...d.porHora.map(([k, x]) => [k, x.horas, x.valor]), [],
      ["Tipo de reserva", "Horas", "Valor"], ...d.porTipo.map(([k, x]) => [k, x.horas, x.valor]), [],
      ["Producto", "Unidades", "Valor", "Ganancia"], ...d.porProducto.map(([k, x]) => [k, x.unidades, x.valor, x.sinCosto ? "sin costo" : x.ganancia]), [],
      ["Día", "Vendido"], ...d.porDia.map(([k, v]) => [k, v]), [],
      ["Cierre", "Quién", "Base", "Efectivo ventas", "Bold", "Contado", "Diferencia"], ...cierres.map((c) => [c.fecha, c.quien, c.base, c.efectivo_ventas, c.bold_ventas, c.contado, c.diferencia]), [],
      ["Ventas: fecha", "hora", "método", "total", "efectivo", "bold", "detalle"],
      ...ventas.map((v) => [v.fecha, new Date(v.creado_en).toLocaleTimeString("es-CO"), v.metodo, v.total, v.efectivo, v.bold, (v.items || []).map((i) => `${i.cantidad}x ${i.nombre}`).join(" | ")]),
    ];
    const csv = "﻿" + filas.map((f) => f.map((x) => (typeof x === "number" ? x : s(x))).join(";")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `arena-informe-${mes}.csv`;
    a.click();
  };

  return (
    <section>
      <div className="row" style={{ marginBottom: 12 }}>
        <h2 className="grow" style={{ margin: 0 }}>Informe del mes</h2>
        <input type="month" className="in" style={{ width: "auto" }} value={mes} onChange={(e) => e.target.value && setMes(e.target.value)} />
        <button className="btn pri" onClick={descargar}>Descargar para Excel</button>
      </div>
      {err && <p className="err">{err}</p>}
      <div className="kpis">
        <div className="kpi main"><small>Total vendido</small><b>{fmtMoney(d.r.total)}</b></div>
        <div className="kpi"><small>Canchas</small><b>{fmtMoney(d.r.canchas)}</b></div>
        <div className="kpi"><small>Cafetería</small><b>{fmtMoney(d.r.cafeteria)}</b></div>
        <div className="kpi"><small>Ganancia cafetería{d.r.sinCosto ? " *" : ""}</small><b>{fmtMoney(d.r.ganancia)}</b></div>
        <div className="kpi"><small>Horas gratis por bono</small><b>{d.r.bonos}</b></div>
        <div className="kpi"><small>Diferencia en cierres</small><b style={{ color: difCierres < 0 ? "var(--bad)" : undefined }}>{fmtMoney(difCierres)}</b></div>
      </div>
      <div className="cols2">
        <div className="card">
          <h2>Por cancha</h2>
          <table className="tabla"><thead><tr><th>Cancha</th><th className="n">Horas</th><th className="n">Valor</th><th className="n">Gratis</th></tr></thead>
            <tbody>{d.porCancha.map(([k, x]) => <tr key={k}><td>{k}</td><td className="n">{x.horas}</td><td className="n">{fmtMoney(x.valor)}</td><td className="n">{x.gratis}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Horas más vendidas</h2>
          <table className="tabla"><tbody>{d.porHora.map(([k, x]) => (
            <tr key={k}><td style={{ width: 90 }}>{k === "?" ? "—" : horaBonita(k)}</td><td><div className="bar" style={{ width: `${(x.horas / maxHora) * 100}%` }} /></td><td className="n">{x.horas}</td></tr>
          ))}</tbody></table>
        </div>
        <div className="card">
          <h2>Cafetería: lo más vendido</h2>
          <table className="tabla"><thead><tr><th>Producto</th><th className="n">Unid.</th><th className="n">Valor</th><th className="n">Ganancia</th></tr></thead>
            <tbody>{d.porProducto.slice(0, 15).map(([k, x]) => <tr key={k}><td>{k}</td><td className="n">{x.unidades}</td><td className="n">{fmtMoney(x.valor)}</td><td className="n">{x.sinCosto ? "—" : fmtMoney(x.ganancia)}</td></tr>)}</tbody></table>
        </div>
        <div className="card">
          <h2>Cierres de caja</h2>
          <table className="tabla"><thead><tr><th>Día</th><th>Quién</th><th className="n">Diferencia</th></tr></thead>
            <tbody>{cierres.map((c) => <tr key={c.fecha}><td>{c.fecha}</td><td>{c.quien}</td><td className="n" style={{ color: c.diferencia < 0 ? "var(--bad)" : undefined }}>{fmtMoney(c.diferencia)}</td></tr>)}</tbody></table>
          {!cierres.length && <p className="empty">Todavía no hay cierres este mes.</p>}
        </div>
      </div>
    </section>
  );
}
