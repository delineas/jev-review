// jev-juez: Jev juzga cada issue y cada PR de este repo; el código decide qué se hace.
//
// - Issue nueva o editada: tipo y demo con `choice`, «¿trae lo necesario para reproducirlo?»
//   con `noul`. Pone etiquetas solo si la confianza pasa el umbral. Si no, pone
//   `necesita-triaje`. Si faltan datos, los pide en un comentario.
// - PR: «¿el diff hace lo que dice la descripción?» con `noul`. Si no, lo comenta.
//
// TypeScript sin dependencias ni compilación: Node 22.18+ quita los tipos al ejecutar. Variables: JEV_API_KEY, GITHUB_TOKEN, GITHUB_REPOSITORY,
// GITHUB_EVENT_NAME, GITHUB_EVENT_PATH. Con DRY_RUN=1 no escribe nada en GitHub.

import { appendFileSync, readFileSync } from "node:fs";

const MODELO = "jev-1.14.0"; // fijado: el alias jev-latest se mueve solo
const UMBRAL_ETIQUETA = 0.8; // confianza mínima de un `choice` para etiquetar sin preguntar
const UMBRAL_FALTA_INFO = 0.5; // por debajo, se piden datos
const UMBRAL_PR = 0.5; // por debajo, la descripción no cuenta lo que hace el diff

const TIPOS = {
  bug: "Something that should work is broken, crashes or behaves wrongly",
  enhancement: "A request for a new feature or a change to how something works",
  documentation: "Missing, wrong or confusing documentation or README",
  question: "A question about how to use or run the project",
};
const DEMOS = {
  "demo:triaje": "The ticket triage demo (department, urgency, human needed)",
  "demo:guardarrail": "The input guardrail demo (prompt injection, personal data, secrets, abuse, off-topic)",
  "demo:busqueda": "The line-by-line semantic search demo over a document",
  "demo:resena": "The live restaurant review score demo",
  "proyecto": "The project as a whole: setup, API key, the Vite dev server and proxy, the SDK, the README",
};
const COLORES: Record<string, string> = { bug: "d73a4a", enhancement: "a2eeef", documentation: "0075ca", question: "d876e3",
  "necesita-triaje": "fbca04", "faltan-datos": "e99695" };

type Choice = { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> };
type Noul = { type: "noul"; noul: number };
type Respuesta<A> = { model: string; answers: A; usage: { input_tokens: number; output_tokens: number }; ms: number };

const env = process.env as Record<string, string>;
const [owner, repo] = env.GITHUB_REPOSITORY.split("/");
const evento = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
const seco = env.DRY_RUN === "1";

async function jev<A>(state: unknown, questions: Record<string, unknown>): Promise<Respuesta<A>> {
  const t0 = performance.now();
  const r = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.JEV_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: MODELO, state, questions }),
  });
  if (!r.ok) throw new Error(`Jev ${r.status}: ${await r.text()}`);
  const json = await r.json();
  return { ...json, ms: Math.round(performance.now() - t0) };
}

async function gh(metodo: string, ruta: string, cuerpo?: unknown, accept = "application/vnd.github+json"): Promise<any> {
  if (seco && metodo !== "GET") {
    console.log(`[DRY_RUN] ${metodo} ${ruta}`, cuerpo ?? "");
    return null;
  }
  const r = await fetch(`https://api.github.com/repos/${owner}/${repo}${ruta}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${env.GITHUB_TOKEN}`, Accept: accept, "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
  });
  if (!r.ok && r.status !== 422) throw new Error(`GitHub ${metodo} ${ruta}: ${r.status} ${await r.text()}`);
  return accept.endsWith("diff") ? r.text() : r.status === 204 ? null : r.json();
}

const pct = (p: number) => `${Math.round(p * 100)} %`;
const resumen = (texto: string) => env.GITHUB_STEP_SUMMARY && appendFileSync(env.GITHUB_STEP_SUMMARY, texto + "\n");

async function juzgarIssue(issue: { number: number; title: string; body: string | null }) {
  const state = { title: issue.title, body: (issue.body ?? "").slice(0, 8000) };
  const r = await jev<{ tipo: Choice; demo: Choice; reproducible: Noul }>(state, {
    tipo: { type: "choice", instructions: "What kind of report is this GitHub issue?", criteria: TIPOS },
    demo: { type: "choice", instructions: "Which part of the jev-review project is the issue about?", criteria: DEMOS },
    reproducible: {
      type: "noul",
      instructions: "Does the issue say what the person did, what they expected and what happened instead?",
    },
  });
  const { tipo, demo, reproducible } = r.answers;

  // Jev juzga; a partir de aquí decide el código.
  const etiquetas: string[] = [];
  for (const a of [tipo, demo]) if (a.confidence >= UMBRAL_ETIQUETA) etiquetas.push(a.choice);
  const dudosas = [tipo, demo].filter((a) => a.confidence < UMBRAL_ETIQUETA);
  if (dudosas.length) etiquetas.push("necesita-triaje");
  const faltanDatos = tipo.choice === "bug" && reproducible.noul < UMBRAL_FALTA_INFO;
  if (faltanDatos) etiquetas.push("faltan-datos");

  for (const e of etiquetas) await gh("POST", "/labels", { name: e, color: COLORES[e] ?? "c5def5" });
  await gh("POST", `/issues/${issue.number}/labels`, { labels: etiquetas });

  const lineas = [
    `**jev-juez** (${MODELO}, ${r.ms} ms, ${r.usage.input_tokens} tokens de entrada)`,
    "",
    "| Pregunta | Respuesta | Confianza |",
    "| --- | --- | --- |",
    `| Tipo | \`${tipo.choice}\` | ${pct(tipo.confidence)} |`,
    `| Parte del proyecto | \`${demo.choice}\` | ${pct(demo.confidence)} |`,
    `| ¿Se puede reproducir con lo que cuenta? | ${pct(reproducible.noul)} de que sí | |`,
    "",
    `Etiquetas: ${etiquetas.map((e) => `\`${e}\``).join(", ")}.`,
  ];
  if (dudosas.length)
    lineas.push("", `No estoy seguro de ${dudosas.map((a) => (a === tipo ? "el tipo" : "la parte del proyecto")).join(" ni de ")}: lo dejo para una persona.`);
  if (faltanDatos)
    lineas.push("", "Para poder reproducirlo, cuéntanos: qué hiciste (pasos o comando), qué esperabas que pasara y qué pasó en su lugar (con el error, si lo hay).");
  await gh("POST", `/issues/${issue.number}/comments`, { body: lineas.join("\n") });
  resumen(lineas.join("\n"));
  console.log(JSON.stringify({ issue: issue.number, etiquetas, respuestas: r.answers, ms: r.ms, usage: r.usage }));
}

async function juzgarPR(pr: { number: number; title: string; body: string | null }) {
  const diff = await gh("GET", `/pulls/${pr.number}`, null, "application/vnd.github.diff");
  const state = { description: `${pr.title}\n\n${pr.body ?? ""}`.slice(0, 4000), diff: diff.slice(0, 60000) };
  const r = await jev<{ coincide: Noul }>(state, {
    coincide: { type: "noul", instructions: "Does `diff` implement the change described in `description`?" },
  });
  const p = r.answers.coincide.noul;
  const lineas = [`**jev-juez** (${MODELO}, ${r.ms} ms): ${pct(p)} de que el diff hace lo que dice la descripción.`];
  if (p < UMBRAL_PR) {
    lineas.push("", "La descripción no parece contar lo que cambia el diff. ¿Puedes revisarla para quien tenga que revisar el PR?");
    await gh("POST", `/issues/${pr.number}/comments`, { body: lineas.join("\n") });
  }
  resumen(lineas.join("\n"));
  console.log(JSON.stringify({ pr: pr.number, coincide: p, ms: r.ms, usage: r.usage }));
}

if (env.GITHUB_EVENT_NAME.startsWith("pull_request")) await juzgarPR(evento.pull_request);
else await juzgarIssue(evento.issue);
