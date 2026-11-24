/* Sunfield HOA Easy Access — smart search engine (client-side, no backend).
   "Smart" here means: topic/synonym expansion from a hand-built HOA thesaurus,
   natural-question cleanup, fuzzy matching, and ranked results with citations.
   It is NOT an AI model and makes no decisions — it finds the exact rule text
   so you can read it yourself. Improve the thesaurus: see CONTRIBUTING.md. */
"use strict";

const TOPICS = [
  { id: "lights", label: "Lights & lighting",
    terms: ["light", "lights", "lighting", "lamp", "lamps", "illumination", "illuminated", "fixture", "fixtures", "bulb", "holiday lights", "christmas lights", "landscape lighting", "exterior lighting"],
    triggers: ["light", "lights", "lighting", "lamp", "lamps", "illumination", "fixture", "fixtures", "bulb", "holiday lights", "christmas lights"],
    hint: "Passages about lighting, lamps, illumination and exterior fixtures." },
  { id: "parking", label: "Parking & vehicles",
    terms: ["park", "parking", "parked", "vehicle", "vehicles", "car", "cars", "truck", "trailer", "trailers", "boat", "rv", "camper", "motorcycle", "driveway", "garage", "street parking", "curb", "tow", "towing", "inoperable"],
    triggers: ["park", "parking", "parked", "vehicle", "vehicles", "trailer", "trailers", "rv", "camper", "motorcycle", "street parking", "tow", "towing", "inoperable"],
    hint: "Passages about parking, vehicles, trailers, driveways and garages." },
  { id: "carwash", label: "Washing cars",
    terms: ["wash", "washing", "car wash", "vehicle maintenance", "repair", "driveway", "water", "hose", "runoff"],
    triggers: ["wash", "washing", "car wash", "vehicle maintenance"],
    hint: "Passages that touch on washing or working on vehicles, driveways and water use — the rules may not use the words “car wash” at all." },
  { id: "water", label: "Water & irrigation",
    terms: ["water", "watering", "irrigation", "irrigate", "sprinkler", "sprinklers", "reclaimed", "re-claimed", "drought", "hose", "runoff", "drainage"],
    triggers: ["water", "watering", "irrigation", "irrigate", "sprinkler", "sprinklers", "reclaimed", "re-claimed", "drought"],
    hint: "Passages about water use, watering and irrigation systems." },
  { id: "fences", label: "Fences & walls",
    terms: ["fence", "fences", "fencing", "wall", "walls", "gate", "gates", "screening", "privacy"],
    triggers: ["fence", "fences", "fencing", "wall", "walls", "gate", "gates"],
    hint: "Passages about fences, walls, gates and screening." },
  { id: "structures", label: "Sheds & structures",
    terms: ["shed", "sheds", "structure", "structures", "outbuilding", "storage", "playhouse", "greenhouse", "pergola", "gazebo", "deck", "patio", "addition", "accessory building"],
    triggers: ["shed", "sheds", "structure", "structures", "outbuilding", "playhouse", "greenhouse", "pergola", "gazebo", "accessory building"],
    hint: "Passages about sheds, outbuildings and other accessory structures." },
  { id: "landscaping", label: "Landscaping & plants",
    terms: ["landscap", "plant", "plants", "tree", "trees", "shrub", "grass", "lawn", "yard", "garden", "mulch", "flower", "turf", "sod", "vegetation", "approved plant"],
    triggers: ["landscap", "plant", "plants", "tree", "trees", "shrub", "grass", "lawn", "garden", "mulch", "flower", "turf", "sod", "approved plant"],
    hint: "Passages about landscaping, lawns, trees and which plants are approved." },
  { id: "trash", label: "Trash & recycling",
    terms: ["trash", "garbage", "recycl", "refuse", "waste", "bin", "container", "dumpster", "debris"],
    triggers: ["trash", "garbage", "recycl", "refuse", "dumpster"],
    hint: "Passages about trash, recycling, bins and debris." },
  { id: "rentals", label: "Rentals & leasing",
    terms: ["rent", "rental", "lease", "leasing", "tenant", "tenants", "short term", "airbnb", "vrbo", "occupant"],
    triggers: ["rent", "rental", "lease", "leasing", "tenant", "tenants", "short term", "airbnb", "vrbo"],
    hint: "Passages about renting or leasing a home, and tenants." },
  { id: "pets", label: "Pets & animals",
    terms: ["pet", "pets", "dog", "dogs", "cat", "cats", "animal", "animals", "livestock", "chicken", "hens", "leash"],
    triggers: ["pet", "pets", "dog", "dogs", "cat", "cats", "animal", "animals", "livestock", "chicken", "hens", "leash"],
    hint: "Passages about pets and animals." },
  { id: "pool", label: "Pool & amenities",
    terms: ["pool", "swim", "swimming", "amenity", "amenities", "lazy river", "splash", "clubhouse", "pavilion", "playground", "trail", "fishing", "pond", "guest", "fob"],
    triggers: ["pool", "swim", "swimming", "amenity", "amenities", "lazy river", "splash", "clubhouse", "pavilion"],
    hint: "Passages about the pools, amenity centers and common areas." },
  { id: "signs", label: "Signs & flags",
    terms: ["sign", "signs", "signage", "flag", "flags", "banner", "advertis"],
    triggers: ["sign", "signs", "signage", "flag", "flags", "banner", "advertis"],
    hint: "Passages about signs, flags and banners." },
  { id: "arc", label: "Exterior changes & ARC approval",
    terms: ["architectural", "arc", "committee", "approval", "approved", "application", "exterior", "modification", "improvement", "paint", "color", "roof", "solar", "construction", "alteration"],
    triggers: ["architectural", "arc", "solar", "paint", "roof", "exterior"],
    hint: "Passages about exterior changes and when Architectural Review Committee (ARC) approval is needed first." },
  { id: "fines", label: "Fines & enforcement",
    terms: ["fine", "fines", "fining", "enforcement", "violation", "violations", "penalty", "hearing", "notice", "cure", "lien", "fee", "fees", "assessment", "assessments"],
    triggers: ["fine", "fines", "fining", "enforcement", "violation", "violations", "penalty", "hearing", "lien", "assessment", "assessments"],
    hint: "Passages about fines, violations, enforcement, fees and assessments." },
  { id: "noise", label: "Noise & nuisance",
    terms: ["noise", "nuisance", "quiet", "loud", "music", "party", "disturbance"],
    triggers: ["noise", "nuisance", "quiet", "loud", "disturbance"],
    hint: "Passages about noise and nuisances." },
  { id: "homebusiness", label: "Home business",
    terms: ["business", "commercial", "office", "trade", "occupation", "work from home"],
    triggers: ["business", "commercial", "office", "trade", "occupation", "work from home"],
    hint: "Passages about running a business from home." },
  { id: "maintenance", label: "Home & lot maintenance",
    terms: ["maintenance", "maintain", "repair", "upkeep", "condition", "appearance", "mow", "weed", "clean"],
    triggers: ["maintenance", "maintain", "upkeep", "mow", "weed"],
    hint: "Passages about keeping your home and lot maintained." },
];

const STOP = new Set(("a an the is are was were do does did can i may shall will would should could to of in on at for with and or be it is there any my me we you he she they this that these those what when where which who whom how why if then than so as by from into about over under am pm please tell show find give get got want need know allowed allow permitted prohibited not no yes sunfield hoa rule rules regulation regulations community association home house lot property resident").split(" "));

function normalize(s) { return (s || "").toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9\s-]/g, " ").replace(/\s+/g, " ").trim(); }
function stem(w) { return w.replace(/(ing|ed|es|s)$/, ""); }
function tokensOf(s) { return normalize(s).split(" ").filter(Boolean); }

function editDistance(a, b) {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    dp[i][j] = Math.min(dp[i-1][j] + 1, dp[i][j-1] + 1, dp[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return dp[a.length][b.length];
}

function expandQuery(raw) {
  const q = normalize(raw);
  const qtoks = tokensOf(q).filter(t => !STOP.has(t));
  const topics = [];
  const termHit = (term) => {
    const tt = tokensOf(term);
    return tt.some(t => qtoks.some(qt => qt === t || stem(qt) === stem(t))) || (tt.length > 1 && q.includes(term));
  };
  // Stricter matcher for trigger words: a multi-word trigger like "car wash"
  // only counts when the whole phrase (or all its words) is in the query —
  // the single word "car" alone must not trigger the car-wash answer.
  const triggerHit = (term) => {
    const tt = tokensOf(term);
    if (tt.length > 1) return q.includes(term) || tt.every(t => qtoks.some(qt => qt === t || stem(qt) === stem(t)));
    return termHit(term);
  };
  for (const topic of TOPICS) {
    if (!topic.terms.some(termHit)) continue;
    // "strong" = the query used one of the topic's distinctive trigger words,
    // not just a shared expansion term (e.g. "water" alone must not count as
    // asking about washing a car). Only strong topics may show a curated
    // short answer; weak hits still expand the search and show a hint chip.
    const strong = (topic.triggers || topic.terms).some(triggerHit);
    topics.push({ ...topic, strong });
  }
  const weights = new Map(); // term -> weight
  const add = (term, w) => { if (!weights.has(term) || weights.get(term) < w) weights.set(term, w); };
  for (const t of qtoks) { add(t, 3); add(stem(t), 2); }
  if (q.length > 2) add(q, 5); // full phrase
  for (const topic of topics) for (const term of topic.terms) {
    add(term, term.includes(" ") ? 2.2 : 1.4);
    for (const t of tokensOf(term)) add(t, 1.1);
  }
  return { weights, topics, qtoks };
}

function countOccurrences(hay, needle) {
  if (!needle) return 0;
  let n = 0, i = 0;
  while ((i = hay.indexOf(needle, i)) !== -1) { n++; i += needle.length; }
  return n;
}

function search(index, rawQuery, limit = 30) {
  const { weights, topics, qtoks } = expandQuery(rawQuery);
  if (!weights.size) return { results: [], topics };
  const results = [];
  for (const chunk of index.chunks) {
    const text = chunk._lower || (chunk._lower = chunk.text.toLowerCase());
    let score = 0; const matched = new Set();
    for (const [term, w] of weights) {
      if (term.length < 3) continue;
      const c = countOccurrences(text, term);
      if (c) { score += Math.min(c, 5) * w; matched.add(term); }
    }
    // fuzzy: a query token of length >=5 within edit distance 1 of a word in the chunk
    if (score === 0 && qtoks.length) {
      const words = chunk._words || (chunk._words = new Set(tokensOf(chunk.text)));
      for (const qt of qtoks) if (qt.length >= 5) for (const w of words)
        if (Math.abs(w.length - qt.length) <= 1 && editDistance(qt, w) === 1) { score += 1; matched.add(w); break; }
    }
    if (score > 0) results.push({ chunk, score, matched: [...matched] });
  }
  results.sort((a, b) => b.score - a.score);
  return { results: results.slice(0, limit), topics, total: results.length };
}

if (typeof module !== "undefined") module.exports = { TOPICS, expandQuery, search, normalize };
