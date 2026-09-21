import { ask, choice, costUSD, noul, score, type Questions } from "../jev";
import { $, answerCard, confidence, esc, fail } from "../ui";
import type { Demo } from "./types";

/**
 * Lo que un portal de reseñas querría saber de un texto según se escribe.
 * La estrella es un `score`: cinco niveles ordenados, cada uno descrito por la
 * experiencia que representa, no por el número.
 */
const QUESTIONS = {
  stars: score("Which star rating best matches this restaurant review?", [
    "One star: a bad experience the reviewer regrets and warns others about",
    "Two stars: clearly disappointing, with real problems and little worth saving",
    "Three stars: acceptable but unremarkable, or good points cancelled out by bad ones",
    "Four stars: a good experience with a minor complaint",
    "Five stars: an excellent experience the reviewer is enthusiastic about",
  ]),
  focus: choice("What does this review mostly talk about?", {
    comida: "The food itself: taste, temperature, portions, quality of the ingredients",
    servicio: "The staff: attention, speed, friendliness, mistakes with the order",
    precio: "What it cost compared to what they got",
    ambiente: "The room: noise, decor, comfort, cleanliness, how crowded it was",
  }),
  returns: noul("The reviewer would come back, or recommends the place to other people."),
  actionable: noul(
    "The review names a concrete problem the owner could fix, such as a specific dish, a wait, a price or something the staff did.",
  ),
  generic: noul(
    "The review is vague praise or vague criticism, with no specific detail about this particular visit.",
    { true: "Could be copy-pasted onto any restaurant", false: "Describes this visit in particular" },
  ),
} satisfies Questions;

const EXAMPLES: { label: string; text: string }[] = [
  {
    label: "Cena redonda",
    text: "Fuimos el sábado sin reserva y nos hicieron hueco en diez minutos. El arroz de carabineros llegó meloso, en su punto, y el camarero nos recomendó un albariño que acertó de pleno. 45 € por cabeza con postre y café. Volveremos.",
  },
  {
    label: "Desastre",
    text: "Una hora esperando el segundo. El entrecot llegó frío y, cuando lo dijimos, el camarero puso mala cara y tardó otros veinte minutos en cambiarlo. Encima nos cobraron un pan que no habíamos pedido. 60 € por persona para esto es un robo.",
  },
  {
    label: "Mitad y mitad",
    text: "La comida está muy bien, sobre todo las croquetas de jamón y el pulpo a la brasa. El problema es el ruido: tuvimos que gritar toda la cena para entendernos y salimos con dolor de cabeza. Si te da igual el jaleo, merece la pena.",
  },
  {
    label: "Tibia",
    text: "Pues normal. Ni fu ni fa. Se come.",
  },
  {
    label: "Sospechosa",
    text: "¡¡El mejor restaurante de la ciudad sin duda!! Todo espectacular, servicio 10/10, relación calidad precio inmejorable. ¡100% recomendado para todos!",
  },
];

const stars = (value: number): string => "★".repeat(Math.round(value)) + "☆".repeat(5 - Math.round(value));

export const realtime: Demo = {
  id: "realtime",
  title: "Reseña de restaurante en vivo",
  blurb:
    "Jev responde en ~200 ms, así que cabe dentro de un teclazo. Cada pausa al escribir reevalúa la reseña y estima la nota; la petición anterior se cancela.",
  mount(root) {
    root.innerHTML = `
      <div class="examples">${EXAMPLES.map((e, i) => `<button data-i="${i}">${esc(e.label)}</button>`).join("")}</div>
      <p class="dim">Escribe o edita la reseña: se reevalúa sola al parar de teclear.</p>
      <textarea rows="5" spellcheck="false">${esc(EXAMPLES[0]!.text)}</textarea>
      <div class="rating"></div>
      <p class="meta"><span class="live"></span></p>
      <div class="answers out"></div>`;

    const input = $<HTMLTextAreaElement>(root, "textarea");
    const rating = $(root, ".rating");
    const out = $(root, ".out");
    const live = $(root, ".live");

    let timer: number | undefined;
    let inFlight: AbortController | undefined;
    let calls = 0;
    let tokens = 0;

    root.querySelectorAll<HTMLButtonElement>(".examples button").forEach((b) =>
      b.addEventListener("click", () => {
        input.value = EXAMPLES[Number(b.dataset.i)]!.text;
        run();
      }),
    );

    input.addEventListener("input", () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(run, 400);
    });

    async function run() {
      const review = input.value.trim();
      if (!review) return;
      inFlight?.abort(); // sólo nos interesa la última pulsación
      const current = (inFlight = new AbortController());
      live.textContent = "evaluando…";
      try {
        const result = await ask({ review }, QUESTIONS, current.signal);
        calls++;
        tokens += result.usage.input_tokens;

        // El score va de 0 a 4 porque los niveles se indexan desde cero.
        const value = result.answers.stars.score + 1;
        rating.innerHTML = `
          <span class="stars">${stars(value)}</span>
          <strong>${value.toFixed(1).replace(".", ",")}</strong><span class="dim"> / 5</span>
          ${confidence(result.answers.stars.confidence)}`;

        live.innerHTML = `<b>${result.ms} ms</b> · ${calls} evaluaciones · ${tokens} tokens · $${costUSD(tokens).toFixed(6)} acumulados`;
        out.innerHTML = Object.entries(result.answers)
          .map(([name, answer]) => answerCard(name, answer))
          .join("");
      } catch (error) {
        if (current.signal.aborted) return;
        out.innerHTML = fail(error);
      }
    }

    run();
  },
};
