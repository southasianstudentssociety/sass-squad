/**
 * Looks for the home page "photos are out" banner. ExCo pick one per event in
 * Admin -> Gallery. To add a theme, add an entry here: the id is what's
 * saved in the database (lowercase letters, digits and dashes), so don't
 * rename an id once it's been used. An unknown id falls back to the first.
 *
 * Classes are written out in full so Tailwind can find them.
 */
export type BannerTheme = {
  id: string;
  name: string;
  /** Shown under the name in the picker. */
  hint: string;
  /** CSS background for the picker swatch. */
  swatch: string;
  /** Outer frame: base colour and drop shadow. */
  frame: string;
  /** The slowly turning border. */
  ring: string;
  /** Main background. */
  bg: string;
  /** Two soft glows that pulse behind everything. */
  glows: [string, string];
  /** Colours of the little sparks drifting up (hex). Empty: the default gold embers. */
  sparks: string[];
  eyebrow: string;
  /** Gradient text for the big headline. */
  headline: string;
  body: string;
  cta: string;
  close: string;
};

export const BANNER_THEMES: BannerTheme[] = [
  {
    id: "diwali",
    name: "Diwali gold",
    hint: "Plum and gold, with embers",
    swatch: "radial-gradient(110% 130% at 0% 100%, #7a2547 0%, #2c1232 45%, #140b18 100%)",
    frame: "bg-[#1a0f1f] shadow-[0_30px_80px_-30px_rgb(90_31_58/0.7)]",
    ring: "bg-[conic-gradient(from_0deg,transparent_0_40%,var(--sass-yellow)_55%,var(--sass-pink)_68%,var(--accent)_78%,transparent_92%)]",
    bg: "bg-[radial-gradient(110%_130%_at_0%_100%,#7a2547_0%,#2c1232_45%,#140b18_100%)]",
    glows: ["bg-accent/40", "bg-sass-pink/25"],
    sparks: [], // the default gold embers
    eyebrow: "border-sass-yellow/30 bg-sass-yellow/10 text-sass-yellow",
    headline: "from-sass-yellow via-[#ffd27a] to-sass-pink",
    body: "text-white/70",
    cta: "bg-sass-yellow text-[#2a1a05] shadow-[0_10px_40px_-10px_rgb(255_240_117/0.6)]",
    close: "text-white/50 hover:bg-white/10 hover:text-white",
  },
  {
    id: "holi",
    name: "Holi colour",
    hint: "Magenta and violet, with colour powder",
    swatch: "radial-gradient(110% 130% at 0% 100%, #d81b75 0%, #5b1a9c 48%, #1a0b3d 100%)",
    frame: "bg-[#1a0b3d] shadow-[0_30px_80px_-30px_rgb(216_27_117/0.6)]",
    ring: "bg-[conic-gradient(from_0deg,transparent_0_30%,var(--sass-yellow)_42%,#ff4fa3_54%,var(--sass-turquoise)_66%,#7cff6b_78%,transparent_90%)]",
    bg: "bg-[radial-gradient(110%_130%_at_0%_100%,#d81b75_0%,#5b1a9c_48%,#1a0b3d_100%)]",
    glows: ["bg-[#ff4fa3]/45", "bg-sass-turquoise/35"],
    sparks: ["#fff075", "#ff4fa3", "#3bb8bd", "#7cff6b", "#ff9a3c"],
    eyebrow: "border-white/30 bg-white/10 text-white",
    headline: "from-sass-yellow via-[#ff8fcb] to-sass-turquoise",
    body: "text-white/80",
    cta: "bg-white text-[#5b1a9c] shadow-[0_10px_40px_-10px_rgb(255_79_163/0.7)]",
    close: "text-white/60 hover:bg-white/10 hover:text-white",
  },
  {
    id: "midnight",
    name: "Midnight blue",
    hint: "Navy and turquoise, for mixers and formals",
    swatch: "radial-gradient(110% 130% at 0% 100%, #0b4aa8 0%, #0c1a45 48%, #050a1c 100%)",
    frame: "bg-[#050a1c] shadow-[0_30px_80px_-30px_rgb(0_65_163/0.7)]",
    ring: "bg-[conic-gradient(from_0deg,transparent_0_40%,var(--sass-turquoise)_55%,#ffffff_66%,var(--sass-blue)_78%,transparent_92%)]",
    bg: "bg-[radial-gradient(110%_130%_at_0%_100%,#0b4aa8_0%,#0c1a45_48%,#050a1c_100%)]",
    glows: ["bg-sass-turquoise/30", "bg-sass-blue/50"],
    sparks: ["#ffffff", "#bfe9ff"],
    eyebrow: "border-sass-turquoise/40 bg-sass-turquoise/10 text-[#9ff0f2]",
    headline: "from-white via-[#bfe9ff] to-sass-turquoise",
    body: "text-white/70",
    cta: "bg-sass-turquoise text-[#04212a] shadow-[0_10px_40px_-10px_rgb(59_184_189/0.7)]",
    close: "text-white/50 hover:bg-white/10 hover:text-white",
  },
  {
    id: "mehndi",
    name: "Mehndi green",
    hint: "Deep green and marigold",
    swatch: "radial-gradient(110% 130% at 0% 100%, #2f6b2f 0%, #123a24 48%, #08180f 100%)",
    frame: "bg-[#08180f] shadow-[0_30px_80px_-30px_rgb(47_107_47/0.7)]",
    ring: "bg-[conic-gradient(from_0deg,transparent_0_40%,#f5c542_55%,#ff9a3c_66%,#b6e388_78%,transparent_92%)]",
    bg: "bg-[radial-gradient(110%_130%_at_0%_100%,#2f6b2f_0%,#123a24_48%,#08180f_100%)]",
    glows: ["bg-[#f5c542]/30", "bg-[#7cc26b]/25"],
    sparks: ["#f5c542", "#ff9a3c"],
    eyebrow: "border-[#f5c542]/35 bg-[#f5c542]/10 text-[#ffe08a]",
    headline: "from-[#ffe08a] via-[#f5c542] to-[#ff9a3c]",
    body: "text-white/70",
    cta: "bg-[#f5c542] text-[#1f2a05] shadow-[0_10px_40px_-10px_rgb(245_197_66/0.6)]",
    close: "text-white/50 hover:bg-white/10 hover:text-white",
  },
  {
    id: "sass",
    name: "SASS red",
    hint: "The society's own colours",
    swatch: "radial-gradient(110% 130% at 0% 100%, #c4484a 0%, #6e1f2c 48%, #2a0b12 100%)",
    frame: "bg-[#2a0b12] shadow-[0_30px_80px_-30px_rgb(174_69_71/0.7)]",
    ring: "bg-[conic-gradient(from_0deg,transparent_0_40%,var(--sass-pink)_55%,var(--sass-yellow)_66%,var(--brand)_78%,transparent_92%)]",
    bg: "bg-[radial-gradient(110%_130%_at_0%_100%,#c4484a_0%,#6e1f2c_48%,#2a0b12_100%)]",
    glows: ["bg-sass-pink/30", "bg-brand/50"],
    sparks: ["#fcb8bd", "#fff075"],
    eyebrow: "border-sass-pink/40 bg-sass-pink/10 text-sass-pink",
    headline: "from-white via-sass-pink to-sass-yellow",
    body: "text-white/75",
    cta: "bg-white text-brand shadow-[0_10px_40px_-10px_rgb(252_184_189/0.7)]",
    close: "text-white/60 hover:bg-white/10 hover:text-white",
  },
];

export function bannerTheme(id: string | null | undefined): BannerTheme {
  return BANNER_THEMES.find((t) => t.id === id) ?? BANNER_THEMES[0];
}

/** Starting wording for a new banner. */
export const BANNER_DEFAULTS = {
  headline: "It's a Wrap!!",
  blurb: "The photos are in. Find yourself, your friends and the best moments from the night.",
  cta: "Relive the night",
};
