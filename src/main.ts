import { guardrails } from "./demos/guardrails";
import { realtime } from "./demos/realtime";
import { search } from "./demos/search";
import { triage } from "./demos/triage";
import type { Demo } from "./demos/types";
import { $, esc } from "./ui";

const DEMOS: Demo[] = [triage, guardrails, search, realtime];

const app = $(document, "#app");
app.innerHTML = `
  <nav>${DEMOS.map((d, i) => `<button data-id="${d.id}"${i ? "" : ' class="on"'}>${esc(d.title)}</button>`).join("")}</nav>
  <section class="demo"><h2></h2><p class="blurb"></p><div class="body"></div></section>`;

const title = $(app, "h2");
const blurb = $(app, ".blurb");
const body = $(app, ".body");

function show(demo: Demo): void {
  title.textContent = demo.title;
  blurb.textContent = demo.blurb;
  body.innerHTML = "";
  location.hash = demo.id;
  app.querySelectorAll("nav button").forEach((b) => b.classList.toggle("on", (b as HTMLElement).dataset.id === demo.id));
  demo.mount(body);
}

app.querySelectorAll<HTMLButtonElement>("nav button").forEach((b) =>
  b.addEventListener("click", () => show(DEMOS.find((d) => d.id === b.dataset.id)!)),
);

show(DEMOS.find((d) => d.id === location.hash.slice(1)) ?? DEMOS[0]!);
