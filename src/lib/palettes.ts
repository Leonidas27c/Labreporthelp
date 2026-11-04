export interface Palette {
  name: string
  hint: string
  colors: { name: string; value: string }[]
}

/** Schriftfarben. Beide Paletten sind auf weißem Papier gut lesbar und drucken sauber. */
export const TEXT_PALETTES: Palette[] = [
  {
    name: 'Wissenschaft klassisch',
    hint: 'Gedeckte, dunkle Töne wie in Fachzeitschriften',
    colors: [
      { name: 'Anthrazit', value: '#1f2933' },
      { name: 'Marineblau', value: '#1f4e79' },
      { name: 'Petrol', value: '#17696f' },
      { name: 'Tannengrün', value: '#2e6b30' },
      { name: 'Weinrot', value: '#9b1c1f' },
      { name: 'Ocker', value: '#8a5a00' },
      { name: 'Aubergine', value: '#5b2a6e' },
      { name: 'Schiefergrau', value: '#5f6b76' },
    ],
  },
  {
    name: 'Okabe-Ito',
    hint: 'Auch bei Farbsehschwäche unterscheidbar, Standard für Diagramme',
    colors: [
      { name: 'Schwarz', value: '#000000' },
      { name: 'Orange', value: '#e69f00' },
      { name: 'Himmelblau', value: '#56b4e9' },
      { name: 'Blaugrün', value: '#009e73' },
      { name: 'Blau', value: '#0072b2' },
      { name: 'Zinnober', value: '#d55e00' },
      { name: 'Rosa-Lila', value: '#cc79a7' },
    ],
  },
]

/** Textmarker: helle Töne, unter denen schwarze Schrift lesbar bleibt. */
export const HIGHLIGHT_PALETTES: Palette[] = [
  {
    name: 'Textmarker',
    hint: 'Helle Töne zum Hervorheben',
    colors: [
      { name: 'Gelb', value: '#fff3a3' },
      { name: 'Grün', value: '#d3f2dc' },
      { name: 'Blau', value: '#d8e8fb' },
      { name: 'Rosa', value: '#fbdde2' },
      { name: 'Orange', value: '#fde3c8' },
      { name: 'Grau', value: '#e6e9ed' },
    ],
  },
]
