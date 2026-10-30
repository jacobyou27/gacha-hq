import { genshinNeeds, genshinSettings, genshinHaves, genshinAllocate, genshinRuns, resinFor } from "../src/lib/farm/genshin";
const ch = (name: string, farm: any) => ({ id: name, name, farm } as any);
const bld = (inputs: any) => ({ id: "b", inputs, counted_at: "2026-01-01", priority: 1 } as any);
const main = genshinSettings({ wl: 9, book_opt: 2, wpn_opt: 1 }, 180);
const furina = genshinNeeds(bld({ lv_now: 1, lv_goal: 90, na_now: 1, na_goal: 1, skill_now: 1, skill_goal: 10, burst_now: 1, burst_goal: 10 }), ch("Furina", { books: "Justice", boss: "Water That Failed To Transcend", weekly: "Lightless Mass" }), main);
console.log("Furina", furina.wit.toFixed(1), furina.mora, furina.boss, furina.books.toFixed(1), furina.weekly, furina.crowns, "expect 418 5397530 46 251 12 2");
const varka = genshinSettings({ wl: 8, book_opt: 2, wpn_opt: 1 }, 180);
const fischl = genshinNeeds(bld({ lv_now: 70, lv_goal: 90, skill_now: 4, skill_goal: 10, burst_now: 1, burst_goal: 10, wpn_rarity: 4, wpn_series: "Dandelion Gladiator", wpn_now: 80, wpn_goal: 90 }), ch("Fischl", { books: "Ballad", boss: "Lightning Prism", weekly: "Dvalin's Claw" }), varka);
console.log("Fischl", fischl.wit.toFixed(1), fischl.mora, fischl.boss, fischl.books.toFixed(1), fischl.weekly, fischl.crowns, fischl.wpn.toFixed(1), fischl.wpnExp.toFixed(1), "expect 252 4769647 32 244 12 2 30 248");
const story = genshinSettings({ wl: 7 }, 180);
const linnea = genshinNeeds(bld({ lv_now: 1, lv_goal: 80, skill_now: 1, skill_goal: 8, burst_now: 1, burst_goal: 8, wpn_rarity: 4, wpn_series: "Pale Star Army", wpn_now: 20, wpn_goal: 80 }), ch("Linnea", { books: "Moonlight", boss: "Radiant Antler", weekly: "Mask of the Virtuous Doctor" }), story);
console.log("Linnea", linnea.wit.toFixed(1), linnea.mora, linnea.boss, linnea.books.toFixed(1), linnea.weekly, linnea.crowns, linnea.wpn.toFixed(1), linnea.wpnExp.toFixed(1), "expect 247 2746422 26 104 4 0 37 349");
// runs for varka Fischl with empty inventory, avg
const short = genshinAllocate([{ build: bld({}), needs: fischl }], genshinHaves([], varka)).get("b")!;
const runs = genshinRuns(short, fischl, varka, [], 0);
console.log("Fischl runs", runs, "resin", resinFor(runs), "(sheet 4460 with inventory)");
