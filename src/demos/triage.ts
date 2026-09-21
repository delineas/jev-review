import { ask, choice, noul, score, type Questions } from "../jev";
import { $, answerCard, esc, fail, loading, meta } from "../ui";
import type { Demo } from "./types";

/**
 * Cinco juicios independientes sobre el mismo ticket, en una sola petición.
 * Jev los evalúa en paralelo; el código decide qué hacer con ellos.
 */
const QUESTIONS = {
  department: choice("Which team should handle this support ticket?", {
    billing: "Charges, invoices, refunds, subscription plans",
    technical: "Bugs, outages, API or integration failures",
    sales: "Pricing questions, upgrades, new contracts",
    account: "Login, password, access and account security",
  }),
  frustration: score("How frustrated does the customer sound?", [
    "Calm and factual",
    "Mildly annoyed",
    "Clearly frustrated but still civil",
    "Angry: strong language, insults or threats",
  ]),
  blocked: noul(
    "The customer is blocked right now: they cannot use the product, or they are losing money while they wait.",
  ),
  refund: noul("The customer asks for a refund, a credit, or to cancel their subscription."),
  churn: score("How close is this customer to leaving for a competitor?", [
    "No sign of leaving",
    "Comparing options or mentioning competitors",
    "Explicitly says they will cancel or has already started",
  ]),
} satisfies Questions;

type Answers = Awaited<ReturnType<typeof evaluate>>["answers"];
const evaluate = (ticket: string) => ask({ ticket }, QUESTIONS);

/** La política vive aquí, en código: se cambia un coeficiente, no un prompt. */
function decide(a: Answers) {
  const urgency = a.blocked.noul * 2 + a.frustration.score / 3 + a.churn.score / 2;
  const priority = urgency > 2 ? "P1" : urgency > 1.1 ? "P2" : "P3";
  const queue = a.department.confidence < 0.7 ? "triaje humano (Jev duda)" : a.department.choice;
  const flags = [
    a.refund.noul > 0.5 && "posible reembolso",
    a.churn.score > 1.4 && "riesgo de fuga",
    a.frustration.score > 2.4 && "avisar a un responsable",
  ].filter(Boolean) as string[];
  return { priority, queue, urgency, flags };
}

const EXAMPLES = [
  "Llevo tres días intentando conectar mi cuenta de Stripe y la integración falla con un 500. Estoy perdiendo ventas cada hora. Necesito una solución YA.",
  "Hola, quería saber si el plan Pro incluye SSO o si eso va aparte. Estamos valorando pasar de 10 a 40 licencias el mes que viene.",
  "Me habéis cobrado dos veces la suscripción de marzo. No es la primera vez que pasa. Si no me devolvéis el dinero esta semana me doy de baja y me voy a Notion.",
  "Buenos días, no consigo entrar con mi correo del trabajo desde ayer, me dice que la contraseña es incorrecta aunque no la he cambiado. Gracias.",
];

export const triage: Demo = {
  id: "triage",
  title: "Triaje de tickets",
  blurb:
    "Una petición, cinco juicios tipados: choice + score + noul a la vez. Jev entiende el texto; el código decide prioridad y cola.",
  mount(root) {
    root.innerHTML = `
      <div class="examples">${EXAMPLES.map((t, i) => `<button data-i="${i}">Ejemplo ${i + 1}</button>`).join("")}</div>
      <textarea rows="5" spellcheck="false">${esc(EXAMPLES[0])}</textarea>
      <button class="primary">Evaluar ticket</button>
      <div class="out"></div>
      <details><summary>La política que aplica el código sobre las respuestas</summary><pre><code>${esc(decide.toString())}</code></pre></details>`;

    const input = $<HTMLTextAreaElement>(root, "textarea");
    const out = $(root, ".out");

    root.querySelectorAll<HTMLButtonElement>(".examples button").forEach((b) =>
      b.addEventListener("click", () => {
        input.value = EXAMPLES[Number(b.dataset.i)]!;
        run();
      }),
    );
    $<HTMLButtonElement>(root, "button.primary").addEventListener("click", run);

    async function run() {
      out.innerHTML = loading();
      try {
        const result = await evaluate(input.value);
        const { priority, queue, urgency, flags } = decide(result.answers);
        out.innerHTML = `
          <div class="verdict ${priority}">
            <span class="prio">${priority}</span>
            <div>
              <strong>Cola: ${esc(queue)}</strong>
              <p class="dim">urgencia calculada ${urgency.toFixed(2)}${flags.length ? ` · ${flags.map(esc).join(" · ")}` : ""}</p>
            </div>
          </div>
          ${meta(result)}
          <div class="answers">${Object.entries(result.answers)
            .map(([name, answer]) => answerCard(name, answer))
            .join("")}</div>`;
      } catch (error) {
        out.innerHTML = fail(error);
      }
    }

    run();
  },
};
