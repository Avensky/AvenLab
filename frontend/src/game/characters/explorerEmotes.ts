import type { Emote } from "./garageEmotes";

const shade = {
  rightHand: [-1.28, .48, .48], rightPalm: [[.94, .15, -.31], [0, -1, -.18]], fingers: [null, "open"],
} as const;
const point = {
  rightHand: [-1.63, .11, .83], rightPalm: [[-.25, .18, .95], [.94, -.15, .17]], fingers: [null, "point"],
} as const;
const listen = {
  rightHand: [-1.44, .3, .19], rightPalm: [[.46, .85, -.24], [.79, -.54, -.25]], fingers: [null, "cup"],
} as const;
const reach = {
  rightHand: [-1.11, -.21, .78], rightPalm: [[-.14, .46, .88], [0, .86, -.49]], fingers: [null, "open"],
} as const;
const jacketGrip = {
  leftHand: [.71, -.27, .41], rightHand: [-.72, -.27, .42],
  leftPalm: [[-.23, .93, .28], [-.73, -.34, .56]], rightPalm: [[.24, .93, .28], [.75, -.35, .55]],
  fingers: ["fist", "fist"],
} as const;
const mapInHand = { offset: [0, -.235, .25], angles: [-.57, 0, .035], fold: 1.08 } as const;
const binocularsLowered = { offset: [0, -.185, .238], angles: [.23, 0, 0] } as const;
const compassLow = { offset: [-.154, -.36, .37], angles: [.06, -.12, .08] } as const;
const beckonStep = [-.024, 0, .157, -.15] as const;

const EXPLORER_EMOTES = [
  { id: "141", name: "Unfold the map", duration: 4.75, prop: "map", keys: [
    [.16, { prop: { ...mapInHand, show: 0 }, head: [.085, -.06, .018], torso: [.056, -.025, .015], face: [.08, .38] }],
    [.27, { prop: mapInHand, head: [.192, -.045, .028], torso: [.069, -.018, .01], rise: -.025, face: [.13, .46] }],
    [.42, { prop: { offset: [0, -.224, .308], angles: [-.65, .07, -.03], fold: .36 },
      head: [.247, .132, -.049], torso: [.101, .055, -.027], sway: .024, face: [.24, .57] }],
    [.55, { prop: { offset: [.013, -.215, .36], angles: [-.67, -.11, .04] },
      head: [.237, -.13, .043], torso: [.095, -.055, .026], sway: -.019, face: [.32, .46] }],
    [.68, { prop: { offset: [0, -.237, .351], angles: [-.65, -.08, .012] },
      head: [-.07, -.28, .048], torso: [.038, -.081, .02], sway: -.021, face: [.62, .45] }],
    [.81, { prop: { ...mapInHand, fold: 1.04 }, head: [.06, -.13, .026], torso: [.021, -.037, .017], face: [.56, .28] }],
    [.89, { prop: { ...mapInHand, show: 0 }, head: [.031, .026, .012], face: [.4, .2] }],
  ] },
  { id: "142", name: "Wrong way map", duration: 4.65, prop: "map", keys: [
    [.15, { prop: { offset: [0, -.166, .267], angles: [-.46, -.045, 1.43], show: 0 },
      head: [.13, -.036, -.095], face: [.12, .38] }],
    [.29, { prop: { offset: [.006, -.16, .275], angles: [-.47, -.02, 1.43] },
      head: [.21, -.118, -.2], torso: [.083, -.038, -.037], sway: -.014, face: [-.24, .61] }],
    [.42, { prop: { offset: [.018, -.18, .3], angles: [-.48, .015, .96] },
      head: [.148, -.075, -.149], torso: [.067, .028, -.026], sway: .014, face: [-.06, .62] }],
    [.54, { prop: { offset: [.012, -.214, .335], angles: [-.56, .037, .43] },
      head: [.16, .064, -.062], torso: [.08, .043, -.013], face: [.29, .52] }],
    [.66, { prop: { offset: [0, -.23, .345], angles: [-.63, .04, -.032] },
      head: [.24, .063, -.018], torso: [.104, .015, -.015], rise: -.024, face: [.76, .45] }],
    [.78, { prop: { offset: [0, -.267, .315], angles: [-.59, .027, -.021], fold: .17 },
      head: [-.038, .09, -.038], face: [.83, .38] }],
    [.89, { prop: { ...mapInHand, show: 0 }, head: [.012, .056, -.021], face: [.61, .23] }],
  ] },
  { id: "143", name: "Binocular sweep", duration: 4.45, prop: "binoculars", keys: [
    [.14, { prop: { ...binocularsLowered, show: 0 }, head: [.101, .06, -.035], face: [.11, .38] }],
    [.25, { prop: binocularsLowered, head: [.075, .035, -.024], torso: [.048, .025, -.012], face: [.19, .4] }],
    [.31, { prop: { offset: [-.017, -.015, .225], angles: [.08, -.14, .018] },
      head: [.041, -.098, .016], torso: [.036, -.053, .016], sway: -.017, rise: -.012, face: [.25, .42] }],
    [.38, { prop: { offset: [-.034, .063, .169], angles: [-.045, -.24, .023], atHead: true }, head: [.018, -.192, .03],
      torso: [.028, -.1, .032], sway: -.029, rise: -.023, face: [.31, .42] }],
    [.5, { prop: { offset: [-.01, .063, .174], angles: [-.07, -.07, .016], atHead: true }, head: [-.015, -.048, .006],
      torso: [-.018, -.033, .018], sway: -.009, face: [.37, .4] }],
    [.64, { prop: { offset: [.043, .067, .159], angles: [-.115, .28, -.036], atHead: true }, head: [-.056, .24, -.035],
      torso: [-.029, .14, -.034], sway: .031, rise: -.02, face: [.59, .48] }],
    [.76, { prop: { offset: [.02, -.068, .278], angles: [.18, .14, -.026], atHead: true }, head: [-.062, .27, -.042],
      torso: [.025, .077, -.026], face: [.76, .43] }],
    [.82, { prop: { offset: [.012, -.097, .265], angles: [.21, .059, -.015] },
      head: [-.008, .183, -.036], torso: [.034, .04, -.014], face: [.69, .36] }],
    [.88, { prop: { ...binocularsLowered, show: 0 }, head: [.041, .126, -.023], face: [.63, .29] }],
  ] },
  { id: "144", name: "Compass check", duration: 4.1, prop: "compass", keys: [
    [.15, { prop: { ...compassLow, show: 0 }, head: [.08, -.08, .02], face: [.1, .29] }],
    [.29, { prop: { offset: [-.125, -.25, .427], angles: [-.08, -.09, .045] }, head: [.26, -.139, .045],
      torso: [.098, -.079, .035], sway: -.024, rise: -.026, face: [.15, .5] }],
    [.43, { prop: { offset: [-.127, -.21, .447], angles: [-.08, -.19, .041] }, head: [.19, -.15, .025],
      torso: [.067, -.09, .028], face: [.27, .49] }],
    [.59, { prop: { offset: [-.159, -.24, .438], angles: [-.034, -.25, .027] }, turn: -.11,
      head: [-.097, -.32, .039], torso: [-.023, -.105, .016], sway: -.029, face: [.56, .44] }],
    [.75, { prop: compassLow, head: [.057, -.22, .046], torso: [.041, -.057, .024], face: [.63, .35] }],
    [.86, { prop: { ...compassLow, show: 0 }, head: [.031, -.04, .018], face: [.46, .21] }],
  ] },
  { id: "145", name: "Distant discovery", duration: 4.1, keys: [
    [.17, { ...shade, rightHand: [-1.49, -.08, .54], head: [.016, -.21, .043], torso: [.04, -.082, .026], face: [.1, .43] }],
    [.31, { ...shade, sway: -.018, rise: -.02, head: [-.032, -.29, .069], torso: [.048, -.131, .032], face: [.29, .5] }],
    [.46, { ...shade, rightHand: [-1.32, .49, .5], head: [-.072, -.13, .028], torso: [.029, -.095, .01], face: [.59, .65] }],
    [.59, { ...point, sway: -.028, travel: .052, rise: -.024, head: [-.087, -.16, .037],
      torso: [.134, -.118, .04], face: [.91, .63] }],
    [.73, { ...point, rightHand: [-1.55, .038, .78], travel: .032, head: [.027, .069, -.014], torso: [.065, -.049, .014], face: [.89, .49] }],
    [.86, { rightHand: [-1.36, -.34, .57], head: [.049, .065, -.013], face: [.64, .27] }],
  ] },
  { id: "146", name: "Collectible inspection", duration: 4.5, prop: "collectible", keys: [
    [.16, { prop: { offset: [-.167, -.33, .296], show: 0 }, head: [.135, -.184, .06], torso: [.089, -.107, .033], face: [.21, .42] }],
    [.29, { prop: { offset: [-.184, -.094, .324], angles: [.04, -.087, -.055] },
      head: [.17, -.247, .08], torso: [.065, -.097, .041], sway: -.023, face: [.38, .56] }],
    [.43, { prop: { offset: [-.198, .085, .318], angles: [.1, -.217, -.24] },
      head: [.057, -.28, .142], torso: [.028, -.105, .046], sway: -.031, face: [.49, .63] }],
    [.59, { prop: { offset: [-.17, .07, .338], angles: [-.059, .165, .19] },
      head: [-.019, -.213, .039], torso: [.013, -.07, .029], sway: -.024, face: [.8, .53] }],
    [.72, { prop: { offset: [-.192, -.182, .306], angles: [.049, -.061, .086] }, head: [.097, -.12, .055], torso: [.057, -.038, .039], face: [.79, .39] }],
    [.86, { prop: { offset: [-.211, -.34, .231], angles: [.1, -.08, .1], show: 0 }, head: [.047, .056, .018], face: [.6, .27] }],
  ] },
  { id: "147", name: "Listen closely", duration: 3.55, keys: [
    [.17, { head: [-.07, -.25, .064], torso: [-.029, -.105, .024], sway: -.022, face: [.02, .54] }],
    [.34, { ...listen, sway: -.032, travel: .041, rise: -.031, torso: [.112, -.135, .064],
      head: [.012, -.36, .14], face: [.08, .52] }],
    [.54, { ...listen, rightHand: [-1.37, .31, .21], travel: .05, sway: -.029,
      torso: [.14, -.094, .059], head: [.046, -.26, .13], face: [.31, .46] }],
    [.68, { ...listen, rightHand: [-1.58, .045, .35], torso: [.028, -.06, .026], head: [-.046, .061, .064], face: [.62, .43] }],
    [.84, { rightHand: [-1.51, -.39, .48], head: [.05, .06, .026], face: [.47, .23] }],
  ] },
  { id: "148", name: "Route proposal", duration: 4.15, keys: [
    [.17, { ...point, rightHand: [-1.17, -.35, .71], head: [.125, -.17, .051], torso: [.056, -.05, .022], face: [.23, .44] }],
    [.31, { ...point, rightHand: [-1.93, -.057, .76], rightPalm: [[-.7, .17, .69], [.15, -.9, .28]],
      turn: -.18, sway: -.03, head: [-.04, -.32, .061], torso: [.067, -.14, .04], face: [.48, .51] }],
    [.45, { ...point, rightHand: [-1.44, -.25, .84], rightPalm: [[-.29, -.42, .86], [.16, -.88, -.31]],
      head: [.171, -.092, .043], torso: [.1, -.06, .026], travel: .036, face: [.53, .5] }],
    [.57, { ...point, rightHand: [-.79, -.19, .89], rightPalm: [[.51, -.22, .84], [.1, -.96, -.24]],
      head: [.095, .13, -.033], torso: [.09, .096, -.031], sway: .026, travel: .039, face: [.68, .49] }],
    [.7, { ...point, rightHand: [-.57, .07, .72], rightPalm: [[.62, .34, .71], [.45, -.83, .08]],
      head: [-.091, .31, -.063], torso: [.025, .12, -.041], face: [.83, .47] }],
    [.86, { rightHand: [-1.34, -.34, .56], head: [.04, .074, -.018], face: [.62, .27] }],
  ] },
  { id: "149", name: "Jacket reset", duration: 3.4, keys: [
    [.19, { ...jacketGrip, leftHand: [.99, -.45, .46], rightHand: [-1.05, -.43, .46], head: [.09, -.1, .044], face: [.12, .27] }],
    [.36, { ...jacketGrip, rightHand: [-.73, -.15, .4], head: [.114, -.12, .048],
      torso: [.039, -.061, .05], sway: -.027, rise: -.018, face: [.28, .32] }],
    [.49, { ...jacketGrip, leftHand: [.73, -.14, .4], head: [.081, .107, -.057],
      torso: [.033, .067, -.05], sway: .031, rise: -.022, face: [.45, .37] }],
    [.64, { ...jacketGrip, leftHand: [.81, -.35, .43], rightHand: [-.83, -.34, .45],
      head: [-.065, .059, -.029], torso: [-.067, .026, -.028], face: [.61, .3] }],
    [.82, { torso: [.015, -.017, .018], head: [.059, .035, .013], face: [.5, .23] }],
  ] },
  { id: "150", name: "Adventure beckon", duration: 3.85, keys: [
    [.15, { sway: .029, rise: -.025, travel: .027, feet: { r: [-.014, .032, .076, -.07] },
      torso: [.076, .062, -.04], head: [.058, -.13, .044], face: [.35, .49] }],
    [.32, { ...reach, sway: -.021, rise: -.038, travel: .093, feet: { r: beckonStep },
      head: [-.056, -.075, .064], torso: [.056, -.041, .03], face: [.8, .55] }],
    [.45, { ...reach, rightHand: [-.91, -.1, .68], rightPalm: [[-.08, .57, .82], [.1, .82, -.56]],
      fingers: [null, "cup"], sway: -.025, rise: -.028, travel: .112, feet: { r: beckonStep }, head: [.077, .078, .051], face: [.94, .47] }],
    [.58, { ...reach, rightHand: [-1.3, -.2, .79], sway: -.023, rise: -.034, travel: .088, feet: { r: beckonStep },
      head: [-.039, .145, -.054], torso: [.039, .054, -.028], face: [.92, .47] }],
    [.73, { sway: .023, rise: -.024, travel: .042, feet: { r: [-.016, .031, .078, -.08] },
      head: [.085, .055, -.022], torso: [.04, .018, -.024], face: [.82, .34] }],
    [.87, { head: [-.021, .013, -.009], face: [.57, .22] }],
  ] },
] as const satisfies readonly Emote[];

const BAG_COMPATIBLE = ["144", "145", "146", "147", "148", "150"];

export function availableExplorerEmotes(bag: boolean) {
  return bag ? EXPLORER_EMOTES.filter(emote => BAG_COMPATIBLE.includes(emote.id)) : EXPLORER_EMOTES;
}
