import React from "react";
import BookingApp from "./BookingApp.jsx";
import AdminApp from "./AdminApp.jsx";

// Enrutador muy simple: /admin muestra el panel del vendedor,
// cualquier otra ruta muestra la app pública de reservas.
export default function App() {
  const esAdmin = window.location.pathname.startsWith("/admin");
  return esAdmin ? <AdminApp /> : <BookingApp />;
}
