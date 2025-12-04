// scrape_bills.js
import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// ---------------------------
// BILL LISTS
// ---------------------------
const houseBills = [
  "467","647","659","740","785","913","965","980","981","983",
  "1039","1228","1286","1344","1404","1423","1578","1646","1741",
  "1845","1965","2055","2068","2102","2137","2138","2148","2201",
  "2334","2605","2623","2701","2721","2878","3123","3132","3386",
  "3387","3400","3481","3627","3726","3753","3833","3834","3835",
  "3951","3983","4837"
];

const senateBills = [
  "275","478","585","599","605","607","609","610","611","649",
  "778","784","793","800","827","879","892","1032","1245","1318",
  "1320","1441","1533","1543"
];

const bills = [...houseBills, ...senateBills];

// ---------------------------
// CONFIG
// ---------------------------
const WA_STATE = "WA"; // Keep only Washington
const apiKey = process.env.CONGRESS_API_KEY;

// ---------------------------
// HELPERS
// ---------------------------
function getChamber(billNumber) {
  return senateBills.includes(billNumber) ? "s" : "hr";
}

function buildUrl(billNumber, offset = 0) {
  const chamber = getChamber(billNumber);
  return `https://api.congress.gov/v3/bill/119/${chamber}/${billNumber}?api_key=${apiKey}&offset=${offset}`;
}

// ---------------------------
// FIXED PAGINATION — ALWAYS GET ALL COSPONSORS
// ---------------------------
async function getAllCosponsors(billNumber) {
  let offset = 0;
  let all = [];

  while (true) {
    const url = buildUrl(billNumber, offset);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Cosponsor request failed (${response.status})`);
    }

    const data = await response.json();
    const cos = data.bill?.cosponsors || [];

    all.push(...cos);

    // Congress.gov uses `next` pagination links
    if (!data.pagination?.next) break;

    offset += 250; // next page
  }

  return all;
}

// ---------------------------
// FILTER TO WASHINGTON ONLY
// ---------------------------
function filterWashingtonOnly(data) {
  const waSponsor =
    data.sponsor && data.sponsor.state === WA_STATE ? data.sponsor : null;

  const waCosponsors = data.cosponsors.filter(c => c.state === WA_STATE);

  return {
    ...data,
    hasWaSponsor: waSponsor !== null,
    waSponsor,
    waCosponsors,
    waCosponsorCount: waCosponsors.length,
  };
}

// ---------------------------
// FETCH BASE BILL DATA
// ---------------------------
async function fetchBaseBill(billNumber) {
  const url = buildUrl(billNumber);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Base bill request failed (${response.status})`);
  }

  return await response.json();
}

// ---------------------------
// NORMALIZATION
// ---------------------------
function normalizeBill(raw, cosponsors, billNumber) {
  const bill = raw.bill;
  const chamber = getChamber(billNumber);

  return {
    id: `${chamber}${billNumber}`,
    chamber,
    number: billNumber,
    label: `${chamber.toUpperCase()}. ${billNumber}`,
    title: bill.title || "",
    latestAction: bill.latestAction?.text || "",
    actionDate: bill.latestAction?.actionDate || "",
    step: bill.currentChamber || "Introduced",
    legislationUrl: bill.urls?.congressURL || "",

    sponsor: bill.sponsors?.[0] || null,
    cosponsors: cosponsors,

    cosponsorCount: cosponsors.length,
    updatedDate: new Date().toISOString(),

    stageDates: {
      introduced: bill.introducedDate || null,
      passedHouse: bill.passedHouseDate || null,
      passedSenate: bill.passedSenateDate || null,
      toPresident: bill.toPresidentDate || null,
      becameLaw: bill.enactedDate || null
    },

    committeeActions: bill.committeeReports || []
  };
}

// ---------------------------
// MAIN SCRAPER
// ---------------------------
async function run() {
  console.log("=== Washington-Only Congress Scraper ===");

  const output = {};

  for (const bill of bills) {
    const chamber = getChamber(bill).toUpperCase();
    console.log(`\nChecking ${chamber}. ${bill}...`);

    try {
      // 1. Fetch page 1
      const base = await fetchBaseBill(bill);

      // 2. Fetch ALL cosponsors (multi-page)
      const allCos = await getAllCosponsors(bill);

      // 3. Normalize
      const fullBill = normalizeBill(base, allCos, bill);

      // 4. WA Filter
      const waBill = filterWashingtonOnly(fullBill);

      console.log(
        `→ WA Sponsor: ${waBill.hasWaSponsor ? "YES" : "NO"}, ` +
        `WA Cosponsors: ${waBill.waCosponsorCount}`
      );

      output[waBill.id] = waBill;
    } catch (err) {
      console.log(`✗ Failed to process ${chamber}. ${bill}: ${err.message}`);
    }
  }

  // Save file
  const outPath = path.resolve("bills.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("\n✓ Done. Saved to bills.json");
}

run();
