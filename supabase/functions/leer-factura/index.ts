// Lee fotos de una factura de proveedor con Claude y devuelve las líneas para revisar.
// Solo la puede usar alguien del equipo (con sesión iniciada y perfil en la tabla "perfiles").
// La clave de Claude se guarda como secreto del proyecto: ANTHROPIC_API_KEY.

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "Método no permitido" }, 405);

  // 1) ¿Es alguien del equipo?
  const auth = req.headers.get("Authorization") ?? "";
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
  const quien = await fetch(`${url}/rest/v1/rpc/es_staff`, {
    method: "POST",
    headers: { apikey: anon, Authorization: auth, "Content-Type": "application/json" },
    body: "{}",
  });
  if (!quien.ok || (await quien.json()) !== true) return json({ error: "Solo el equipo puede leer facturas" }, 401);

  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return json({ error: "Falta configurar la clave de Claude (ANTHROPIC_API_KEY)" }, 500);

  // 2) Datos de la página
  let body: { imagenes?: string[]; productos?: { id: string; nombre: string }[] };
  try { body = await req.json(); } catch { return json({ error: "Datos inválidos" }, 400); }
  const imagenes = (body.imagenes ?? []).filter((x) => typeof x === "string").slice(0, 5);
  if (!imagenes.length) return json({ error: "No llegó ninguna foto" }, 400);
  if (imagenes.some((x) => x.length > 6_000_000)) return json({ error: "La foto es demasiado grande" }, 413);
  const lista = (body.productos ?? []).slice(0, 500).map((p) => `${String(p.id).slice(0, 40)} | ${String(p.nombre).slice(0, 80)}`).join("\n");

  const instrucciones = `Estas fotos son una factura de un proveedor de la cafetería de un complejo deportivo en Colombia (precios en pesos colombianos).
Lea cada producto de la factura y responda SOLO con un JSON con esta forma, sin texto antes ni después:
{"proveedor":"nombre","lineas":[{"texto":"nombre como aparece en la factura","producto_id":"id de la lista o null","cantidad":24,"costo":1200,"duda":"texto corto o null"}]}
Reglas:
- "cantidad" son UNIDADES sueltas. Si la factura dice cajas, pacas o paquetes y se sabe cuántas unidades trae cada una, multiplique. Si no se sabe, ponga la cantidad que dice la factura y explíquelo en "duda".
- "costo" es el costo de UNA unidad, con IVA incluido si la factura lo suma. Número entero, sin puntos ni signos.
- "producto_id": busque el producto en la lista de la cafetería y ponga su id solo si es claramente el mismo producto (mismo sabor y tamaño). Si no está, ponga null.
- Si algo no se lee bien, dígalo en "duda" en pocas palabras.
Lista de productos de la cafetería (id | nombre):
${lista}`;

  // 3) Claude
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({
      model: Deno.env.get("CLAUDE_MODEL") ?? "claude-sonnet-5-5",
      max_tokens: 4000,
      messages: [{
        role: "user",
        content: [
          ...imagenes.map((data) => ({ type: "image", source: { type: "base64", media_type: "image/jpeg", data } })),
          { type: "text", text: instrucciones },
        ],
      }],
    }),
  });
  if (!r.ok) {
    console.error("Claude", r.status, await r.text());
    return json({ error: `Claude respondió con error ${r.status}` }, 502);
  }
  const data = await r.json();
  const texto: string = (data.content ?? []).filter((c: { type: string }) => c.type === "text").map((c: { text: string }) => c.text).join("");
  const ini = texto.indexOf("{"), fin = texto.lastIndexOf("}");
  try {
    const out = JSON.parse(texto.slice(ini, fin + 1));
    return json({ proveedor: out.proveedor ?? "", lineas: Array.isArray(out.lineas) ? out.lineas : [] });
  } catch {
    console.error("Respuesta no JSON", texto.slice(0, 500));
    return json({ error: "No se pudo entender la factura" }, 502);
  }
});
