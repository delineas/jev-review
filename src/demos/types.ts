export type Demo = {
  id: string;
  title: string;
  /** Qué capacidad de Jev demuestra. */
  blurb: string;
  mount(root: HTMLElement): void;
};
