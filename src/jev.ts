/**
 * Cliente de navegador para Jev. Habla con /api/jev (el proxy de vite.config.ts),
 * nunca directamente con api.typesafe.ai, para no exponer la API key.
 *
 * Del SDK sólo importamos tipos (se borran al compilar): los constructores de
 * preguntas son tres líneas y así el bundle del navegador no arrastra el cliente
 * de Node.
 */
import type {
  ChoiceCriteria,
  ChoiceQuestion,
  ChoiceResponse,
  EntryType,
  NoulQuestion,
  NoulResponse,
  Questions,
  ScoreCriteria,
  ScoreQuestion,
  ScoreResponse,
  SystemOneResult,
} from "@typesafe-ai/sdk";

export type { ChoiceResponse, NoulResponse, ScoreResponse, Questions };
export type Answer = NoulResponse | ChoiceResponse | ScoreResponse;

/** ¿Se cumple esta condición? Devuelve la probabilidad de "sí" (0–1). */
export const noul = (instructions: EntryType, criteria?: NoulQuestion["criteria"]): NoulQuestion => ({
  type: "noul",
  instructions,
  ...(criteria ? { criteria } : {}),
});

/** Elige una opción del conjunto. Devuelve la elegida, su distribución y la confianza. */
export const choice = <const T extends ChoiceCriteria>(
  instructions: EntryType,
  criteria: T,
): ChoiceQuestion<T> => ({ type: "choice", instructions, criteria });

/** Sitúa el estado en una escala ordenada. Devuelve un valor ponderado por probabilidad. */
export const score = <const T extends ScoreCriteria>(
  instructions: EntryType,
  criteria: T,
): ScoreQuestion<T> => ({ type: "score", instructions, criteria });

export type JevResult<Q extends Questions> = SystemOneResult<Q> & {
  /** Latencia real contra la API, medida en el servidor (ms). */
  ms: number;
};

export async function ask<Q extends Questions>(
  state: unknown,
  questions: Q,
  signal?: AbortSignal,
): Promise<JevResult<Q>> {
  const res = await fetch("/api/jev", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ state, questions }),
    signal,
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
  return body as JevResult<Q>;
}

/** $42 por cada mil millones de tokens de entrada; la salida es gratis. */
export const costUSD = (inputTokens: number): number => (inputTokens * 42) / 1e9;
