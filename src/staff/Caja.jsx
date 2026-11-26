import React, { useState, useMemo } from "react";
import { rest, rpc, funcion, reservasDelDia, fmtMoney, horaBonita, hoyYMD } from "../lib/api.js";
import { Modal, Confirmar, Billetes, Plata, CATS, useCada } from "./comun.jsx";
import { valorReserva } from "./Dia.jsx";

const norm = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const hh = (r) => parseInt(String(r.hora).slice(0, 2), 10);

// ---------- Vender ----------
export function Vender({ productos, tarifas, cobradas, carrito, setCarrito, onVendido, toast }) {
  const [cat, setCat] = useState("Canchas");
  const [q, setQ] = useState("");
  const [hoy, setHoy] = useState([]);
  const [pago, setPago] = useState(null);
  useCada(async () => { try { setHoy(await reservasDelDia(hoyYMD())); } catch { /* reintenta */ } }, 30000, []);

  const total = carrito.reduce((a, l) => a + l.precio * l.cantidad, 0);
  const enCarrito = new Set(carrito.map((l) => l.key));
  const porCobrar = hoy.filter((r) => !cobradas.has(r.id + "|" + hoyYMD()) && !enCarrito.has("r" + r.id + hoyYMD()))
    .sort((a, b) => hh(a) - hh(b));
  const lista = productos.filter((p) => p.activo && p.precio > 0 && (cat === "Todo" || p.categoria === cat) && (!q || norm(p.nombre).includes(norm(q))));

  const agregar = (p) => setCarrito((c) => {
    const l = c.find((x) => x.key === "p" + p.id);
    if (l) return c.map((x) => (x === l ? { ...x, cantidad: x.cantidad + 1 } : x));
    return [...c, { key: "p" + p.id, tipo: "producto", producto_id: p.id, nombre: p.nombre, precio: p.precio, cantidad: 1, costo: p.costo ?? null }];
  });
  const cambiar = (key, d) => setCarrito((c) => c.map((x) => (x.key === key ? { ...x, cantidad: x.cantidad + d } : x)).filter((x) => x.cantidad > 0));

  const registrar = async (metodo, recibido, bold) => {
    const efectivo = total - bold;
    const items = carrito.map(({ key, ex, ...it }) => it);
    await rpc("registrar_venta", { p: { metodo, total, efectivo, bold, recibido, vueltas: metodo === "bold" || metodo === "gratis" ? 0 : recibido - efectivo, items } });
    setCarrito([]); setPago(null); toast("Venta guardada ✓"); onVendido();
  };

  return (
    <div className="sell">
      <div>
        <div className="pills">
          {["Canchas", "Todo", ...CATS].map((c) => <button key={c} className="pill" aria-pressed={cat === c} onClick={() => setCat(c)}>{c === "Canchas" ? `Canchas de hoy (${porCobrar.length})` : c}</button>)}
        </div>
        {cat === "Canchas" ? (
          <div className="pgrid">
            {porCobrar.length ? porCobrar.map((r) => {
              const v = valorReserva(r, tarifas);
              return <button key={r.id} className="p court" onClick={() => setCarrito((c) => [...c, lineaCancha(r, hoyYMD(), tarifas)])}>
                <b>{r.clientes?.nombre}</b><span>{fmtMoney(v.cobrar)}</span><small>{r.canchas?.nombre} · {horaBonita(r.hora)}</small></button>;
            }) : <p className="empty">No hay canchas pendientes por cobrar hoy.</p>}
          </div>
        ) : (
          <>
            <input className="in" style={{ marginBottom: 12 }} type="search" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
            <div className="pgrid">
              {lista.length ? lista.map((p) => (
                <button key={p.id} className={"p" + (enCarrito.has("p" + p.id) ? " hit" : "") + (p.stock <= 3 ? " low" : "")} onClick={() => agregar(p)}>
                  <b>{p.nombre}</b><span>{fmtMoney(p.precio)}</span><small>Quedan {p.stock}</small></button>
              )) : <p className="empty">{productos.length ? "No hay productos con ese nombre." : "Cargando productos…"}</p>}
            </div>
          </>
        )}
      </div>
      <aside className="card ticket">
        <h2>Pedido</h2>
        <ul className="lines">
          {carrito.length ? carrito.map((l) => (
            <li key={l.key}>
              <span className="nm">{l.nombre}</span><span className="sub">{fmtMoney(l.precio * l.cantidad)}</span>
              {l.ex && <span className="ex">{l.ex}</span>}
              <div className="qty">
                {l.tipo === "cancha" ? <button onClick={() => cambiar(l.key, -1)} aria-label="Quitar">×</button> : (
                  <><button onClick={() => cambiar(l.key, -1)} aria-label="Quitar uno">−</button><span className="n">{l.cantidad}</span><button onClick={() => cambiar(l.key, 1)} aria-label="Agregar uno">+</button></>
                )}
              </div>
            </li>
          )) : <li className="empty">Toque una cancha o un producto</li>}
        </ul>
        <div className="total"><span>Total</span><strong>{fmtMoney(total)}</strong></div>
        {carrito.length > 0 && total === 0 ? (
          <button className="btn dark big full" onClick={() => registrar("gratis", 0, 0).catch((e) => toast("No se pudo guardar: " + e.message, true))}>Registrar sin cobro</button>
        ) : (
          <div className="pay">
            <button className="btn ok big" disabled={!carrito.length} onClick={() => setPago("efectivo")}>Efectivo</button>
            <button className="btn pri big" disabled={!carrito.length} onClick={() => setPago("bold")}>Bold / QR</button>
            <button className="btn dark wide" disabled={!carrito.length} onClick={() => setPago("dividido")}>Dividido: efectivo + Bold</button>
          </div>
        )}
        {carrito.length > 0 && <button className="link" style={{ color: "var(--mut)", width: "100%", marginTop: 8 }} onClick={() => setCarrito([])}>Borrar pedido</button>}
      </aside>
      {pago && <Pago modo={pago} total={total} onClose={() => setPago(null)} onConfirmar={registrar} toast={toast} />}
    </div>
  );
}

export function lineaCancha(r, fecha, tarifas) {
  const v = valorReserva(r, tarifas);
  const ex = [r.es_gratis && "Gratis por bono", v.descuento > 0 && `Descuento ${r.descuento_porcentaje}%`, v.deposito > 0 && `Menos depósito ${fmtMoney(v.deposito)}`].filter(Boolean).join(" · ");
  return {
    key: "r" + r.id + fecha, tipo: "cancha", reserva_id: r.id, fecha_juego: fecha, cancha: r.canchas?.nombre, hora: String(r.hora).slice(0, 5),
    reserva_tipo: r.tipo, cliente: r.clientes?.nombre, nombre: `${r.canchas?.nombre} · ${horaBonita(r.hora)} · ${r.clientes?.nombre || ""}`,
    precio: v.cobrar, cantidad: 1, tarifa: v.tarifa, descuento: v.descuento, deposito_descontado: v.deposito, bono: !!r.es_gratis, ex,
  };
}

function Pago({ modo, total, onClose, onConfirmar, toast }) {
  const [recibido, setRecibido] = useState(0);
  const [okEf, setOkEf] = useState(false);
  const [bold, setBold] = useState(0);
  const [llego, setLlego] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const confirmar = async (metodo, rec, bo) => {
    setOcupado(true);
    try { await onConfirmar(metodo, rec, bo); } catch (e) { toast("No se pudo guardar. Intente otra vez. " + e.message, true); setOcupado(false); }
  };
  return (
    <Modal onClose={onClose}>
      {modo === "efectivo" && (<>
        <h3>Pago en efectivo</h3><div className="muted">Total a cobrar</div><div className="amt">{fmtMoney(total)}</div>
        <div className="muted">¿Con cuánto paga?</div>
        <Billetes debe={total} onCambio={(r, ok) => { setRecibido(r); setOkEf(ok); }} />
        <div className="two"><button className="btn" onClick={onClose}>Volver</button>
          <button className="btn ok big" disabled={!okEf || ocupado} onClick={() => confirmar("efectivo", recibido, 0)}>Confirmar venta</button></div>
      </>)}
      {modo === "bold" && (<>
        <h3>Pago con Bold / QR</h3><div className="muted">Total a cobrar</div><div className="amt">{fmtMoney(total)}</div>
        <p>Confirme en el celular o el datáfono que <b>el pago ya llegó</b> antes de entregar.</p>
        <div className="two"><button className="btn" onClick={onClose}>Volver</button>
          <button className="btn pri big" disabled={ocupado} onClick={() => confirmar("bold", total, total)}>Sí, ya llegó</button></div>
      </>)}
      {modo === "dividido" && (<>
        <h3>Pago dividido</h3><div className="muted">Total a cobrar</div><div className="amt">{fmtMoney(total)}</div>
        <label className="lb">¿Cuánto paga por Bold / QR?</label>
        <Plata value={bold} onChange={(v) => setBold(Math.min(v, total))} autoFocus />
        <div className="parts"><div><small>Bold / QR</small><b>{fmtMoney(bold)}</b></div><div><small>Efectivo</small><b>{fmtMoney(total - bold)}</b></div></div>
        <div className="muted" style={{ marginTop: 12 }}>¿Con cuánto paga el efectivo?</div>
        <Billetes debe={total - bold} onCambio={(r, ok) => { setRecibido(r); setOkEf(ok); }} />
        <label className="check warn"><input type="checkbox" checked={llego} onChange={(e) => setLlego(e.target.checked)} /> Ya revisé que llegó el pago de Bold</label>
        <div className="two" style={{ marginTop: 12 }}><button className="btn" onClick={onClose}>Volver</button>
          <button className="btn dark big" disabled={!(bold > 0 && bold < total && okEf && llego) || ocupado} onClick={() => confirmar("dividido", recibido, bold)}>Confirmar venta</button></div>
      </>)}
    </Modal>
  );
}

// ---------- Recibir pedido (foto de la factura) ----------
async function comprimir(file) {
  const img = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.85).split(",")[1];
}
const lineaVacia = () => ({ texto: "", producto_id: "", cantidad: 0, costo: 0, duda: "", nuevo: { nombre: "", precio: 0, categoria: "Paquetes" } });

export function Pedido({ productos, onGuardado, toast }) {
  const [fotos, setFotos] = useState([]);
  const [lineas, setLineas] = useState(null);
  const [proveedor, setProveedor] = useState("");
  const [msg, setMsg] = useState("");
  const [leyendo, setLeyendo] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const activos = productos.filter((p) => p.activo);

  const leer = async () => {
    setLeyendo(true); setMsg("Leyendo la factura… puede tardar un minuto.");
    try {
      const imagenes = await Promise.all(fotos.map(comprimir));
      const r = await funcion("leer-factura", { imagenes, productos: activos.map((p) => ({ id: p.id, nombre: p.nombre })) });
      const ls = (r.lineas || []).map((l) => ({ ...lineaVacia(), texto: String(l.texto || ""), producto_id: productos.some((p) => p.id === l.producto_id) ? l.producto_id : "",
        cantidad: Math.max(0, Math.round(Number(l.cantidad) || 0)), costo: Math.max(0, Math.round(Number(l.costo) || 0)), duda: l.duda ? String(l.duda) : "",
        nuevo: { nombre: String(l.texto || ""), precio: 0, categoria: "Paquetes" } }));
      if (!ls.length) { setMsg("No se encontraron productos en la foto. Tome una foto más clara o escriba el pedido a mano."); return; }
      setProveedor(String(r.proveedor || "")); setLineas(ls); setMsg("");
    } catch (e) {
      setMsg("No se pudo leer la factura (" + e.message + "). Intente otra vez o escríbala a mano.");
    } finally { setLeyendo(false); }
  };

  const cambiar = (i, k, v) => setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const total = (lineas || []).reduce((a, l) => a + l.cantidad * l.costo, 0);

  const guardar = async () => {
    const ls = lineas.filter((l) => l.cantidad > 0);
    if (!ls.length) return toast("Escriba al menos un producto con unidades", true);
    if (ls.some((l) => !l.producto_id && (!l.nuevo.nombre.trim() || !l.nuevo.precio))) return toast("A los productos nuevos les falta nombre o precio de venta", true);
    setGuardando(true);
    try {
      let orden = productos.reduce((a, p) => Math.max(a, p.orden || 0), 0);
      for (const l of ls) {
        if (!l.producto_id) {
          const id = "p" + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
          await rest("productos", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ id, nombre: l.nuevo.nombre.trim(), precio: l.nuevo.precio, categoria: l.nuevo.categoria, costo: l.costo || null, stock: 0, orden: ++orden }) });
          l.producto_id = id;
        }
      }
      await rpc("registrar_pedido", { p: { proveedor: proveedor.trim(), total, items: ls.map((l) => ({ producto_id: l.producto_id, nombre: productos.find((p) => p.id === l.producto_id)?.nombre || l.nuevo.nombre, cantidad: l.cantidad, costo: l.costo || null })) } });
      toast("Pedido guardado. El inventario ya se actualizó ✓");
      setFotos([]); setLineas(null); setProveedor(""); onGuardado();
    } catch (e) { toast("No se pudo guardar el pedido: " + e.message, true); }
    finally { setGuardando(false); }
  };

  if (!lineas) return (
    <section className="card" style={{ maxWidth: 820, margin: "0 auto" }}>
      <h2>Recibir un pedido</h2>
      <p className="muted">Tome una foto de la factura. Si tiene varias hojas, tome una foto de cada una.</p>
      <label className="shot">📷 {fotos.length ? "Agregar otra foto" : "Tomar foto de la factura"}
        <input type="file" accept="image/*" capture="environment" multiple hidden onChange={(e) => { setFotos((f) => [...f, ...e.target.files].slice(0, 5)); e.target.value = ""; }} />
      </label>
      <div className="thumbs">{fotos.map((f, i) => <img key={i} alt="Factura" src={URL.createObjectURL(f)} />)}</div>
      <div className="two">
        <button className="btn" onClick={() => { setLineas([lineaVacia()]); setProveedor(""); }}>Escribir a mano</button>
        <button className="btn pri big" disabled={!fotos.length || leyendo} onClick={leer}>{leyendo ? "Leyendo…" : "Leer factura"}</button>
      </div>
      {msg && <p className="muted">{msg}</p>}
    </section>
  );

  return (
    <section style={{ maxWidth: 900, margin: "0 auto" }}>
      <h2>Revise el pedido</h2>
      <p className="muted">Corrija lo que esté mal. La cantidad es en <b>unidades</b> y el costo es <b>por unidad</b>.</p>
      <label className="lb">Proveedor</label>
      <input className="in" value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        {lineas.map((l, i) => (
          <div className="rl" key={i}>
            {l.texto && <div className="muted">En la factura: {l.texto}</div>}
            <div className="f">
              <div><label>Producto</label>
                <select className="in" value={l.producto_id} onChange={(e) => cambiar(i, "producto_id", e.target.value)}>
                  <option value="">➕ Producto nuevo</option>
                  {activos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select></div>
              <div><label>Unidades</label><input className="in" inputMode="numeric" value={l.cantidad || ""} onChange={(e) => cambiar(i, "cantidad", parseInt(e.target.value.replace(/\D/g, ""), 10) || 0)} /></div>
              <div><label>Costo c/u</label><Plata value={l.costo} onChange={(v) => cambiar(i, "costo", v)} /></div>
            </div>
            {!l.producto_id && (
              <div className="f" style={{ marginTop: 8 }}>
                <div><label>Nombre del producto nuevo</label><input className="in" value={l.nuevo.nombre} onChange={(e) => cambiar(i, "nuevo", { ...l.nuevo, nombre: e.target.value })} /></div>
                <div><label>Precio de venta</label><Plata value={l.nuevo.precio} onChange={(v) => cambiar(i, "nuevo", { ...l.nuevo, precio: v })} /></div>
                <div><label>Tipo</label><select className="in" value={l.nuevo.categoria} onChange={(e) => cambiar(i, "nuevo", { ...l.nuevo, categoria: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></div>
              </div>
            )}
            {l.duda && <div className="doubt">⚠ {l.duda}</div>}
            <button className="link" onClick={() => setLineas((ls) => ls.filter((_, j) => j !== i))}>Quitar esta línea</button>
          </div>
        ))}
      </div>
      <button className="btn full" onClick={() => setLineas((ls) => [...ls, lineaVacia()])}>+ Agregar otro producto</button>
      <div className="total"><span>Total del pedido</span><strong>{fmtMoney(total)}</strong></div>
      <div className="two">
        <button className="btn" onClick={() => { setLineas(null); setFotos([]); }}>Cancelar</button>
        <button className="btn ok big" disabled={guardando} onClick={guardar}>{guardando ? "Guardando…" : "Guardar pedido"}</button>
      </div>
    </section>
  );
}

// ---------- Inventario ----------
export function Inventario({ productos, perfil, onCambio, toast }) {
  const [q, setQ] = useState("");
  const [ed, setEd] = useState(null);
  const activos = productos.filter((p) => p.activo);
  const lista = activos.filter((p) => !q || norm(p.nombre).includes(norm(q))).sort((a, b) => a.stock - b.stock);
  const valor = activos.reduce((a, p) => a + Math.max(0, p.stock) * (p.costo || 0), 0);
  return (
    <section>
      <div className="kpis">
        <div className="kpi"><small>Productos</small><b>{activos.length}</b></div>
        <div className="kpi"><small>Por acabarse (3 o menos)</small><b style={{ color: "var(--bad)" }}>{activos.filter((p) => p.stock <= 3).length}</b></div>
        <div className="kpi"><small>Sin costo cargado</small><b>{activos.filter((p) => p.costo == null).length}</b></div>
        <div className="kpi"><small>Valor del inventario</small><b>{fmtMoney(valor)}</b></div>
      </div>
      <div className="row" style={{ marginBottom: 12 }}>
        <input className="in grow" type="search" placeholder="Buscar producto…" value={q} onChange={(e) => setQ(e.target.value)} />
        {perfil.rol === "admin" && <button className="btn" onClick={() => setEd({ nuevo: true, nombre: "", precio: 0, costo: null, stock: 0, categoria: "Paquetes" })}>+ Producto nuevo</button>}
      </div>
      <div className="list">
        <div className="inv h"><span>Producto</span><span className="num">Quedan</span><span className="num">Precio</span><span className="num cst">Costo</span></div>
        {lista.map((p) => (
          <button key={p.id} className="inv" onClick={() => setEd({ ...p })}>
            <span>{p.nombre}</span><span className={"st" + (p.stock <= 3 ? " low" : "")}>{p.stock}</span>
            <span className="num">{fmtMoney(p.precio)}</span><span className="num cst">{p.costo != null ? fmtMoney(p.costo) : "—"}</span>
          </button>
        ))}
      </div>
      {ed && <EditarProducto p={ed} perfil={perfil} productos={productos} onClose={() => setEd(null)} onListo={() => { setEd(null); onCambio(); }} toast={toast} />}
    </section>
  );
}

function EditarProducto({ p, perfil, productos, onClose, onListo, toast }) {
  const [d, setD] = useState(p);
  const admin = perfil.rol === "admin";
  const guardar = async () => {
    if (!d.nombre.trim()) return toast("Escriba el nombre", true);
    try {
      const body = { nombre: d.nombre.trim(), precio: d.precio, costo: d.costo || null, stock: d.stock, categoria: d.categoria, activo: d.activo !== false };
      if (d.nuevo) await rest("productos", { method: "POST", prefer: "return=minimal", body: JSON.stringify({ ...body, id: "p" + Date.now().toString(36), orden: productos.reduce((a, x) => Math.max(a, x.orden || 0), 0) + 1 }) });
      else await rest(`productos?id=eq.${encodeURIComponent(p.id)}`, { method: "PATCH", prefer: "return=minimal", body: JSON.stringify(admin ? body : { stock: d.stock }) });
      toast("Guardado ✓"); onListo();
    } catch (e) { toast("No se pudo guardar: " + e.message, true); }
  };
  return (
    <Modal onClose={onClose}>
      <h3>{d.nuevo ? "Producto nuevo" : d.nombre}</h3>
      {admin && <><label className="lb">Nombre</label><input className="in" value={d.nombre} onChange={(e) => setD({ ...d, nombre: e.target.value })} /></>}
      {admin && <div className="two">
        <div><label className="lb">Precio de venta</label><Plata value={d.precio} onChange={(v) => setD({ ...d, precio: v })} /></div>
        <div><label className="lb">Costo</label><Plata value={d.costo} onChange={(v) => setD({ ...d, costo: v })} /></div>
      </div>}
      <label className="lb">Unidades que hay (conteo)</label>
      <input className="in money" inputMode="numeric" value={d.stock} onChange={(e) => setD({ ...d, stock: parseInt(e.target.value.replace(/[^\d-]/g, ""), 10) || 0 })} />
      {admin && <><label className="lb">Tipo</label><select className="in" value={d.categoria} onChange={(e) => setD({ ...d, categoria: e.target.value })}>{CATS.map((c) => <option key={c}>{c}</option>)}</select></>}
      {admin && !d.nuevo && <label className="check"><input type="checkbox" checked={d.activo === false} onChange={(e) => setD({ ...d, activo: !e.target.checked })} /> Ya no se vende (ocultar)</label>}
      <div className="two" style={{ marginTop: 14 }}><button className="btn" onClick={onClose}>Volver</button><button className="btn dark big" onClick={guardar}>Guardar</button></div>
    </Modal>
  );
}

// ---------- Cuentas de un grupo de ventas ----------
export function resumen(ventas) {
  const r = { total: 0, efectivo: 0, bold: 0, canchas: 0, cafeteria: 0, ganancia: 0, sinCosto: false, bonos: 0 };
  for (const v of ventas) {
    r.total += v.total; r.efectivo += v.efectivo; r.bold += v.bold;
    for (const i of v.items || []) {
      const sub = (i.precio || 0) * (i.cantidad || 0);
      if (i.tipo === "cancha") { r.canchas += sub; if (i.bono) r.bonos++; }
      else { r.cafeteria += sub; if (i.costo == null) r.sinCosto = true; else r.ganancia += sub - i.costo * i.cantidad; }
    }
  }
  return r;
}
const METODO = { efectivo: ["Efectivo", "fija"], bold: ["Bold / QR", "diaria"], dividido: ["Dividido", "blue"], gratis: ["Sin cobro", "bad"] };

export function VentasDia({ ventas, onAnulada, toast }) {
  const [conf, setConf] = useState(null);
  const r = resumen(ventas);
  return (
    <section>
      <div className="kpis">
        <div className="kpi main"><small>Vendido hoy</small><b>{fmtMoney(r.total)}</b></div>
        <div className="kpi"><small>Canchas</small><b>{fmtMoney(r.canchas)}</b></div>
        <div className="kpi"><small>Cafetería</small><b>{fmtMoney(r.cafeteria)}</b></div>
        <div className="kpi"><small>Efectivo</small><b>{fmtMoney(r.efectivo)}</b></div>
        <div className="kpi"><small>Bold / QR</small><b>{fmtMoney(r.bold)}</b></div>
        <div className="kpi"><small>Ganancia cafetería{r.sinCosto ? " *" : ""}</small><b>{fmtMoney(r.ganancia)}</b></div>
      </div>
      {r.sinCosto && <p className="muted">* Algunos productos todavía no tienen costo, así que no cuentan en la ganancia.</p>}
      <div className="list">
        {ventas.length ? ventas.map((v) => (
          <div className="li" key={v.id}>
            <span className="t">{new Date(v.creado_en).toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" })}</span>
            <div>{(v.items || []).map((i) => (i.tipo === "cancha" ? i.nombre : `${i.cantidad} × ${i.nombre}`)).join(", ")}<br />
              <span className={"chip " + METODO[v.metodo][1]}>{METODO[v.metodo][0]}{v.metodo === "dividido" ? `: ${fmtMoney(v.efectivo)} efectivo + ${fmtMoney(v.bold)} Bold` : ""}</span></div>
            <div className="r">{fmtMoney(v.total)}<br /><button className="link" onClick={() => setConf(v)}>Anular</button></div>
          </div>
        )) : <p className="empty">Todavía no hay ventas hoy.</p>}
      </div>
      {conf && <Confirmar titulo="¿Anular esta venta?" texto={`${fmtMoney(conf.total)} · ${METODO[conf.metodo][0]}. Solo anule si fue un error. Los productos vuelven al inventario.`} si="Sí, anular"
        onNo={() => setConf(null)} onSi={async () => { try { await rpc("anular_venta", { p_id: conf.id }); toast("Venta anulada"); setConf(null); onAnulada(); } catch (e) { toast("No se pudo anular: " + e.message, true); } }} />}
    </section>
  );
}

// ---------- Cierre de caja ----------
export function Cierre({ ventas, perfil, toast }) {
  const [base, setBase] = useState(0);
  const [contado, setContado] = useState(0);
  const [hayConteo, setHayConteo] = useState(false);
  const [guardado, setGuardado] = useState(null);
  const hoy = hoyYMD();
  useCada(async () => { try { const c = await rest(`cierres?fecha=eq.${hoy}`); setGuardado(c?.[0] || null); } catch { /* reintenta */ } }, 60000, [hoy]);
  const r = resumen(ventas);
  const esperado = base + r.efectivo, dif = contado - esperado;
  const guardar = async () => {
    if (!hayConteo) return toast("Escriba el efectivo que contó", true);
    try {
      const row = { fecha: hoy, quien: perfil.nombre, base, efectivo_ventas: r.efectivo, bold_ventas: r.bold, canchas: r.canchas, cafeteria: r.cafeteria, total: r.total, contado, esperado, diferencia: dif, ventas: ventas.length, creado_en: new Date().toISOString() };
      await rest("cierres?on_conflict=fecha", { method: "POST", prefer: "resolution=merge-duplicates,return=minimal", body: JSON.stringify(row) });
      setGuardado(row); toast("Cierre guardado ✓");
    } catch (e) { toast("No se pudo guardar el cierre: " + e.message, true); }
  };
  return (
    <section className="cols2">
      <div className="card">
        <h2>Cierre de hoy</h2>
        <p className="muted">Hoy {new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })} · cierra {perfil.nombre}</p>
        <label className="lb">Base con la que abrió la caja</label>
        <Plata value={base} onChange={setBase} />
        <label className="lb">Efectivo que contó al cerrar</label>
        <Plata value={contado} onChange={(v) => { setContado(v); setHayConteo(true); }} />
        {hayConteo && <div className={"change " + (dif === 0 ? "ok" : "bad")}>{dif === 0 ? "La caja cuadra" : dif < 0 ? "Falta dinero" : "Sobra dinero"}<strong>{dif === 0 ? "✓" : fmtMoney(Math.abs(dif))}</strong></div>}
        <button className="btn dark big full" style={{ marginTop: 14 }} onClick={guardar}>Guardar cierre</button>
        {guardado && <p className="muted">Cierre guardado por {guardado.quien || "—"}. Diferencia: {fmtMoney(guardado.diferencia)}. Puede guardarlo otra vez si corrige algo.</p>}
      </div>
      <div className="card">
        <h2>Cuentas del día</h2>
        <ul className="calc">
          <li><span>Base de caja</span><b>{fmtMoney(base)}</b></li>
          <li><span>Ventas en efectivo</span><b>{fmtMoney(r.efectivo)}</b></li>
          <li><span><b>Debe haber en caja</b></span><b>{fmtMoney(esperado)}</b></li>
          <li><span>Ventas por Bold / QR</span><b>{fmtMoney(r.bold)}</b></li>
          <li><span>Canchas</span><b>{fmtMoney(r.canchas)}</b></li>
          <li><span>Cafetería</span><b>{fmtMoney(r.cafeteria)}</b></li>
          <li><span>Total vendido</span><b>{fmtMoney(r.total)}</b></li>
        </ul>
        <p className="muted">Revise que el total de Bold coincida con lo que muestra la app de Bold.</p>
      </div>
    </section>
  );
}
