import React from "react";
import BookingApp from "./BookingApp.jsx";
import StaffApp from "./staff/StaffApp.jsx";

// Enrutador muy simple: /admin muestra el panel del equipo (canchas, caja, inventario),
// cualquier otra ruta muestra la app pública de reservas.
export default function App() {
  const esAdmin = window.location.pathname.startsWith("/admin");
  return esAdmin ? <StaffApp /> : <BookingApp />;
}
