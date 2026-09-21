import { ask, choice, noul, type Questions } from "../jev";
import { $, bars, confidence, esc, fail, loading, meta, pct } from "../ui";
import type { Demo } from "./types";

/** Condiciones ficticias de un SaaS de facturación. Una línea = una respuesta citable. */
const LINES = [
  "Condiciones del servicio de Facturalia, versión 4.2, en vigor desde el 1 de marzo de 2026.",
  "Facturalia es un servicio de facturación electrónica para autónomos y pequeñas empresas.",
  "El plan Básico cuesta 9 € al mes e incluye 50 facturas mensuales y un único usuario.",
  "El plan Pro cuesta 29 € al mes e incluye facturas ilimitadas, cinco usuarios y acceso a la API.",
  "El plan Empresa se contrata mediante presupuesto e incluye inicio de sesión único (SSO) y entorno dedicado.",
  "Todos los planes incluyen un periodo de prueba de 14 días sin necesidad de tarjeta.",
  "La facturación anual aplica un descuento del 20 % sobre el precio mensual equivalente.",
  "Los precios se indican sin IVA; el impuesto aplicable se añade según el país de residencia fiscal del cliente.",
  "Puedes cambiar de plan en cualquier momento; el cambio se prorratea al día sobre el periodo en curso.",
  "Al bajar de plan, el saldo a favor se aplica como crédito en las siguientes facturas, no se devuelve en efectivo.",
  "Puedes cancelar la suscripción cuando quieras desde Ajustes → Suscripción, sin penalización.",
  "Si cancelas dentro de los 30 días siguientes a un cobro anual, devolvemos el importe íntegro de ese periodo.",
  "Las suscripciones mensuales no se reembolsan, pero el servicio sigue activo hasta el final del periodo pagado.",
  "Los datos de los clientes se almacenan en servidores situados en Fráncfort, Alemania.",
  "Realizamos copias de seguridad cifradas cada seis horas y las conservamos durante 35 días.",
  "Puedes exportar todas tus facturas en formato CSV, XML (Facturae) y PDF desde el panel, sin coste.",
  "Al eliminar la cuenta, los datos se borran de forma irreversible a los 30 días naturales.",
  "El soporte se presta por correo y por chat de lunes a viernes, de 9:00 a 18:00 CET, excepto festivos nacionales.",
  "El plan Empresa incluye soporte telefónico prioritario con respuesta en menos de dos horas laborables.",
  "Nuestro compromiso de disponibilidad es del 99,9 % mensual para los planes Pro y Empresa.",
  "Si incumplimos el compromiso de disponibilidad, compensamos con crédito en la siguiente factura.",
  "La API tiene un límite de 600 peticiones por minuto y token en el plan Pro.",
  "Superar el límite de la API devuelve un código 429; recomendamos reintentar con espera exponencial.",
  "Las claves de API se pueden revocar en cualquier momento y caducan a los 12 meses de su creación.",
  "Está prohibido usar Facturalia para emitir facturas de operaciones ilícitas o simuladas.",
  "Nos reservamos el derecho de suspender cuentas con impagos superiores a 15 días.",
  "Cumplimos el RGPD y actuamos como encargados del tratamiento respecto de los datos de tus clientes.",
  "Puedes solicitar el acuerdo de encargado del tratamiento (DPA) escribiendo a legal@facturalia.example.",
  "Cualquier cambio en estas condiciones se comunicará con 30 días de antelación por correo electrónico.",
  "La ley aplicable es la española y los tribunales competentes son los de Madrid.",
];

const id = (i: number) => `L${String(i).padStart(2, "0")}`;
const SOURCE = "Condiciones del servicio de Facturalia, v4.2";
const DOCUMENT = LINES.map((line, i) => `${id(i)}| ${line}`).join("\n");
const OPTIONS = Object.fromEntries(LINES.map((_, i) => [id(i), null]));

/**
 * Las probabilidades de un choice siempre suman 1, así que alguna línea gana
 * aunque ninguna valga. El noul, que es absoluto, es quien dice si hay respuesta.
 */
const questions = (query: string) =>
  ({
    where: choice(`Which line of the document contains the answer to: "${query}"?`, OPTIONS),
    exists: noul(`Does any line of the document state or directly imply the answer to: "${query}"?`, {
      true: "At least one line answers it",
      false: "No line addresses this at all",
    }),
  }) satisfies Questions;

const QUERIES = [
  "¿Cuántos días tengo para que me devuelvan el dinero de un pago anual?",
  "¿Puedo cambiar de plan a mitad de mes?",
  "¿Dónde se guardan físicamente mis datos?",
  "¿Qué pasa si supero el límite de llamadas a la API?",
  "¿Tenéis aplicación para Android?",
];

export const search: Demo = {
  id: "search",
  title: "Búsqueda semántica línea a línea",
  blurb:
    "Un choice con 30 opciones (una por línea) señala la respuesta dentro del documento, y un noul detecta cuándo no está. Sin embeddings ni índice.",
  mount(root) {
    root.innerHTML = `
      <p class="source">Busca dentro de <b>${esc(SOURCE)}</b> · ${LINES.length} líneas etiquetadas
      <code>L00</code>…<code>${id(LINES.length - 1)}</code> · documento ficticio, sin índice ni embeddings.</p>
      <div class="examples">${QUERIES.map((_, i) => `<button data-i="${i}">Pregunta ${i + 1}</button>`).join("")}</div>
      <input type="text" value="${esc(QUERIES[0])}" spellcheck="false" />
      <button class="primary">Buscar</button>
      <div class="out"></div>`;

    const input = $<HTMLInputElement>(root, "input");
    const out = $(root, ".out");

    root.querySelectorAll<HTMLButtonElement>(".examples button").forEach((b) =>
      b.addEventListener("click", () => {
        input.value = QUERIES[Number(b.dataset.i)]!;
        run();
      }),
    );
    $<HTMLButtonElement>(root, "button.primary").addEventListener("click", run);
    input.addEventListener("keydown", (e) => e.key === "Enter" && run());

    async function run() {
      out.innerHTML = loading("Buscando en 30 líneas…");
      try {
        const result = await ask({ document: DOCUMENT }, questions(input.value));
        const { where, exists } = result.answers;
        const ranking = Object.entries(where.probabilities as Record<string, number>)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 4);
        const found = exists.noul > 0.5;

        out.innerHTML = `
          <div class="verdict ${found ? "ok" : "bad"}">
            <span class="prio">${found ? "encontrado" : "no está"}</span>
            <div>
              <p class="dim">el documento responde: <b>${pct(exists.noul)}</b> · ${confidence(where.confidence)}</p>
            </div>
          </div>
          ${meta(result)}
          ${
            found
              ? `<blockquote><code>${esc(where.choice)}</code> ${esc(LINES[Number(where.choice.slice(1))])}</blockquote>`
              : `<p class="dim">La línea más parecida sería <code>${esc(where.choice)}</code>, pero el noul dice que nadie responde a eso. Ese es justo el papel del segundo juicio.</p>`
          }
          <h4>Ranking de líneas</h4>
          ${bars(Object.fromEntries(ranking), Object.fromEntries(ranking.map(([k]) => [k, `${k} · ${LINES[Number(k.slice(1))]!.slice(0, 64)}…`])))}
          <h4>${esc(SOURCE)}</h4>
          <ol class="doc">${LINES.map(
            (line, i) =>
              `<li class="${found && id(i) === where.choice ? "hit" : ""}"><code>${id(i)}</code> ${esc(line)}</li>`,
          ).join("")}</ol>`;

        root.querySelector(".doc .hit")?.scrollIntoView({ block: "center" });
      } catch (error) {
        out.innerHTML = fail(error);
      }
    }

    run();
  },
};
