import React, { useState, useEffect } from "react";
import { fmtMoney, soloNumeros } from "../lib/api.js";

export const TIPOS = { fija: "Fija", diaria: "Del día", academia: "Academia", especial: "Especial" };
export const HORAS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22];
export const DEP_FIJA = 50000;
export const DEP_DIARIA = 10000;
export const CATS = ["Bebidas", "Cerveza y licor", "Paquetes", "Dulces"];

export function Modal({ onClose, children }) {
  useEffect(() => {
    const k = (e) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", k);
    return () => document.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="dlg" role="dialog" aria-modal="true" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="box">{children}</div>
    </div>
  );
}

export function Confirmar({ titulo, texto, si, peligro = true, onSi, onNo }) {
  const [ocupado, setOcupado] = useState(false);
  return (
    <Modal onClose={onNo}>
      <h3>{titulo}</h3>
      <p>{texto}</p>
      <div className="two">
        <button className="btn" onClick={onNo}>No</button>
        <button className={"btn " + (peligro ? "bad" : "ok")} disabled={ocupado}
          onClick={async () => { setOcupado(true); try { await onSi(); } finally { setOcupado(false); } }}>{si}</button>
      </div>
    </Modal>
  );
}

// Campo de plata: muestra $12.000 mientras se escribe
export function Plata({ value, onChange, ...rest }) {
  return (
    <input className="in money" inputMode="numeric" placeholder="$0" {...rest}
      value={value ? fmtMoney(value) : ""}
      onChange={(e) => onChange(Math.min(soloNumeros(e.target.value), 100000000))} />
  );
}

// Billetes: "¿con cuánto paga?" y cálculo de vueltas
const BILLETES = [["Exacto", -1], ["$5.000", 5000], ["$10.000", 10000], ["$20.000", 20000], ["$50.000", 50000], ["$100.000", 100000]];
export function Billetes({ debe, onCambio }) {
  const [pick, setPick] = useState(null);
  const [otro, setOtro] = useState(0);
  const recibido = pick == null ? otro : BILLETES[pick][1] < 0 ? debe : BILLETES[pick][1];
  const elegido = pick != null || otro > 0;
  const ok = elegido && recibido >= debe;
  useEffect(() => { onCambio(recibido, ok); }, [recibido, ok]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      <div className="bills">
        {BILLETES.map(([l], i) => (
          <button key={l} aria-pressed={pick === i} onClick={() => { setPick(i); setOtro(0); }}>{l}</button>
        ))}
      </div>
      <label className="lb">Otro valor</label>
      <Plata value={otro} onChange={(v) => { setOtro(v); setPick(null); }} />
      {elegido && debe > 0 && (
        <div className={"change " + (recibido >= debe ? "ok" : "bad")}>
          {recibido >= debe ? "Vueltas" : "Falta"}
          <strong>{fmtMoney(Math.abs(recibido - debe))}</strong>
        </div>
      )}
    </>
  );
}

export function useToast() {
  const [t, setT] = useState(null);
  useEffect(() => {
    if (!t) return;
    const id = setTimeout(() => setT(null), 2800);
    return () => clearTimeout(id);
  }, [t]);
  const vista = t ? <div className="toast" role="status" style={{ background: t.bad ? "#c62828" : "#1f8a4c" }}>{t.msg}</div> : null;
  return [vista, (msg, bad) => setT({ msg, bad, k: Date.now() })];
}

// Recarga periódica + al volver a la pestaña ("tiempo real" sencillo y robusto)
export function useCada(fn, ms, deps) {
  useEffect(() => {
    let vivo = true;
    const run = () => vivo && fn();
    run();
    const id = setInterval(() => document.visibilityState === "visible" && run(), ms);
    const vis = () => document.visibilityState === "visible" && run();
    document.addEventListener("visibilitychange", vis);
    return () => { vivo = false; clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, deps); // eslint-disable-line react-hooks/exhaustive-deps
}

export function Chip({ tipo }) {
  return <span className={"chip " + tipo}>{TIPOS[tipo] || tipo}</span>;
}
