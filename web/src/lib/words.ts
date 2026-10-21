export const STOP = new Set(
  `a about above after again against all am an and any are as at be because been before being below between both
  but by can could did do does doing down during each few for from further had has have having he her here hers
  herself him himself his how i if in into is it its itself just me more most my myself no nor not now of off on
  once only or other our ours ourselves out over own same she should so some such than that the their theirs them
  themselves then there these they this those through to too under until up very was we were what when where which
  while who whom why will with would you your yours yourself yourselves also may might must shall us via within
  without upon one two three many much however thus etc`.split(/\s+/),
);

export const words = (text: string) => text.toLowerCase().match(/[a-z0-9À-ɏ]+(?:['’][a-z]+)?/g) ?? [];
export const content = (ws: string[]) => ws.filter((w) => !STOP.has(w) && w.length > 2);
export const plural = (n: number, one: string, many = one + "s") => `${n} ${n === 1 ? one : many}`;
