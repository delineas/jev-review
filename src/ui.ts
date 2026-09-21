/** Ayudas de render. HTML como texto: es una demo, no hace falta un framework. */
import { costUSD, type Answer, type JevResult, type Questions } from "./jev";

export const esc = (value: unknown): string =>
  String(value).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

export const pct = (n: number): string => `${Math.round(n * 100)}%`;

export const $ = <T extends HTMLElement>(root: ParentNode, sel: string): T => {
  const found = root.querySelector<T>(sel);
  if (!found) throw new Error(`No existe ${sel}`);
  return found;
};

/** Barras de la distribución de probabilidad, ordenadas de mayor a menor. */
export function bars(probabilities: Record<string, number>, labels?: Record<string, string>): string {
  return Object.entries(probabilities)
    .sort(([, a], [, b]) => b - a)
    .map(
      ([key, p]) => `
      <div class="bar" style="--p:${p}">
        <span class="bar-label">${esc(labels?.[key] ?? key)}</span>
        <span class="bar-track"><span class="bar-fill"></span></span>
        <span class="bar-value">${pct(p)}</span>
      </div>`,
    )
    .join("");
}

/** Bloque estándar para una respuesta, sea del tipo que sea. */
export function answerCard(name: string, answer: Answer): string {
  if (answer.type === "noul") {
    return `<div class="answer">
      <header><code>${esc(name)}</code><span class="pill noul">noul ${answer.noul.toFixed(2)}</span></header>
      ${bars({ sí: answer.noul, no: 1 - answer.noul })}
    </div>`;
  }
  if (answer.type === "choice") {
    return `<div class="answer">
      <header><code>${esc(name)}</code><strong>${esc(answer.choice)}</strong>${confidence(answer.confidence)}</header>
      ${bars(answer.probabilities as Record<string, number>)}
    </div>`;
  }
  return `<div class="answer">
    <header><code>${esc(name)}</code><strong>${answer.score.toFixed(2)}</strong>${confidence(answer.confidence)}</header>
    ${bars(answer.probabilities as Record<string, number>, answer.legend as Record<string, string>)}
  </div>`;
}

export const confidence = (value: number): string =>
  `<span class="pill ${value >= 0.7 ? "ok" : value >= 0.4 ? "warn" : "bad"}">confianza ${value.toFixed(2)}</span>`;

/** Modelo, latencia, tokens y coste real de la llamada. */
export function meta<Q extends Questions>(result: JevResult<Q>): string {
  const cost = costUSD(result.usage.input_tokens);
  return `<p class="meta">
    <b>${esc(result.model)}</b> · ${result.ms} ms ·
    ${result.usage.input_tokens} tokens de entrada ·
    $${cost.toFixed(7)} <span class="dim">(${Math.round(1 / cost).toLocaleString("es")} llamadas por dólar)</span>
  </p>`;
}

export const loading = (text = "Preguntando a Jev…"): string => `<p class="loading">${esc(text)}</p>`;
export const fail = (error: unknown): string => `<p class="error">${esc((error as Error).message ?? error)}</p>`;
