/* Sunfield HOA Easy Access — short answers (answer-first layer).
   Each answer below was written by hand ONLY from passages in the search
   index, and every claim is tied to the passage(s) that support it via
   {doc, page} locators. app.js resolves each locator against the actual
   index at runtime and prints the full citation (document • section • page)
   from the passage itself — a locator that doesn't resolve is dropped, so
   nothing here can cite a passage that isn't in the index.
   Rules for editors: never state a yes/no, permission or prohibition the
   cited text does not support; if the documents don't directly address a
   topic, the answer must say so (see "carwash"). No AI is involved. */
"use strict";

const RULES = "Rules and Regulations (filed as Community Charter)";
const DG = "Residential Design Guidelines";
const QRG = "Sunfield Information and Quick Reference Guide v12";
const POOL = "Amenity Center Pool Rules";

/* Topic priority when a query matches several topics: most specific intent
   first (e.g. a car-washing question also matches "parking", but the
   carwash answer is the honest one for it). */
const ANSWER_PRIORITY = ["carwash", "fences", "structures", "rentals", "fines",
  "pool", "signs", "pets", "trash", "landscaping", "lights", "parking", "arc",
  "noise", "homebusiness", "maintenance"];

const SHORT_ANSWERS = {
  carwash: {
    text: "No rule in these documents directly mentions washing a car. The closest rules are about working on and parking vehicles: a vehicle may be repaired or restored only inside an enclosed garage (except emergency repairs needed to move it to a repair facility), and a vehicle may be parked only in the garage or in the driveway serving your own lot.",
    cites: [{ doc: RULES, page: 30, match: "shall be parked only in the garage" }],
  },
  parking: {
    text: "Park in your garage or in your own driveway — no on-street parking is permitted. Commercial vehicles may not be parked in Sunfield for more than four hours a day, or overnight, unless fully enclosed in a garage, and no recreational vehicle may be parked overnight.",
    cites: [{ doc: RULES, page: 31, match: "No on-street parking" }, { doc: RULES, page: 30, match: "Motor Vehicles, Trailers, Boats" }],
  },
  lights: {
    text: "Exterior lighting needs approval first: all exterior lighting for a home must be approved in advance by the Architectural Review Committee, and no exterior lighting fixtures or decorations may be placed unless approved under the Design Guidelines and the Charter. The exception is seasonal holiday decorative lights, which may be displayed only between Thanksgiving Day and January 10.",
    cites: [{ doc: RULES, page: 31, match: "(m) Lighting" }, { doc: DG, page: 16, match: "No exterior lighting fixtures" }],
  },
  fences: {
    text: "Only with the ARC's prior written consent. Fences and gates must be built of Spruce-or-better flat-top pickets (cedar is encouraged, pine is strictly prohibited, and no chain link), no portion may exceed seven feet in height, and the ARC may set the materials and stain color — walls and fences on lots also need advance written ARC approval under the Charter.",
    cites: [{ doc: DG, page: 19, match: "construction of fences or gates" }, { doc: RULES, page: 32, match: "Fences and Walls" }],
  },
  structures: {
    text: "Get ARC approval before you shop or build: without the ARC's prior written approval, accessory structures — storage sheds, decks, patios, gazebos, playhouses, greenhouses and similar — are prohibited. To be approved, a storage shed must be the only one on the lot, less than 6 feet tall at the roof ridge, and less than 100 square feet of floor space.",
    cites: [{ doc: DG, page: 12, match: "Accessory Structures and Enclosures" }, { doc: RULES, page: 32, match: "Storage" }],
  },
  rentals: {
    text: "Leasing is allowed, but not short-term: a lot or unit may not be leased for a term of less than three months, or more than twice in a calendar year, and the Quick Reference Guide states there are no short-term rentals (such as Airbnb) and no subleasing a room. Leases must be in writing, tenants are bound by the governing documents, and the owner must notify the Council or managing agent and provide a copy of the lease within ten days of signing.",
    cites: [{ doc: RULES, page: 28, match: "shall not be leased for a term of less than" }, { doc: QRG, page: 1, match: "Property Rental" }],
  },
  fines: {
    text: "For violations other than unpaid assessments, the Association must first give written notice and an opportunity for a hearing; it may then impose reasonable monetary fines, and a fine may be levied for each day a violation continues uncured. The Quick Reference Guide describes violations escalating roughly every 14 days if unresolved — a warning first, then fines. (The separate Fining Policy filing is a scanned document that is not yet searchable here.)",
    cites: [{ doc: RULES, page: 38, match: "Sanctions Requiring Prior Notice and Hearing" }, { doc: QRG, page: 1, match: "Violations (escalate" }],
  },
  pool: {
    text: "At the Amenity Center Pool, all homeowners and guests must check in at the main entrance, guests must be accompanied by a homeowner, and each household may have no more than four guests. Children under 16 must be accompanied by a parent or guardian, and food and drinks stay in the pavilions, away from the pool. Sunbright Amenity hours are 5:00am–10:00pm, with 5:00–9:00am lap swimming only.",
    cites: [{ doc: POOL, page: 1, match: "guests must check in" }],
  },
  trash: {
    text: "Trash containers go to the curbside no earlier than the evening before pickup and must be retrieved no later than the day of pickup, and they must be stored out of sight from the street. The Quick Reference Guide adds that lids must be closed, cans should not exceed about 40–50 lbs, and household trash, grass clippings and yard waste must never be dumped on community property.",
    cites: [{ doc: DG, page: 18, match: "Trash containers are to be placed" }, { doc: QRG, page: 1, match: "Trash & Waste" }],
  },
  pets: {
    text: "Domesticated dogs and cats may be kept in a home, with conditions: pets must not be a nuisance, pit bulls or other breeds the Community Council considers dangerous are not allowed, pet housing or screened pet enclosures need ARC approval, and owners must immediately remove their pet's excrement from community property. Any other kind of animal needs the Community Council's prior written consent.",
    cites: [{ doc: RULES, page: 30, match: "Domesticated dogs" }],
  },
  signs: {
    text: "Most signs on a lot are not allowed. The exceptions are one for-sale sign (no more than 2' × 3', on a ground stake, extending no more than three feet above the ground) and political signs, which may go up no more than ninety days before the election and must be removed within five days after it. Signs advertising a home for rent or lease are expressly prohibited.",
    cites: [{ doc: RULES, page: 33, match: "For Sale Signs" }, { doc: DG, page: 17, match: "No signs" }],
  },
  arc: {
    text: "Most exterior changes need Architectural Review Committee approval before work starts — solar panels and energy conservation equipment, for example, must be approved by the ARC before installation and must be an integral, harmonious part of the structure's design. Any change to already-approved plans must be resubmitted for ARC approval, and the ARC's final decision is to be communicated within thirty days after it receives a completed application.",
    cites: [{ doc: RULES, page: 31, match: "Solar Panels and Energy Conservation" }, { doc: DG, page: 7, match: "Changes to Plans" }, { doc: RULES, page: 21, match: "final decision" }],
  },
  landscaping: {
    text: "Each residence must keep a minimum of two trees in the front yard and one in the back yard at all times, and no tree with a trunk diameter of four inches or more may be cut or removed without the ARC's prior written approval — dead or diseased trees must be removed promptly and replaced with the same species and size. Grass areas must be sodded with Bermuda, Buffalo or Zoysia grass, and all landscaping must be maintained in good, living condition.",
    cites: [{ doc: RULES, page: 29, match: "Trees" }, { doc: DG, page: 23, match: "Grass" }],
  },
};

if (typeof module !== "undefined") module.exports = { SHORT_ANSWERS, ANSWER_PRIORITY };
