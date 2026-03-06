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
const CONGRESS = "119";
const WA_STATE = "WA";
const apiKey = process.env.CONGRESS_API_KEY;

if (!apiKey) {
  throw new Error("Missing CONGRESS_API_KEY environment variable.");
}

// ---------------------------
// HELPERS
// ---------------------------
function getChamber(billNumber) {
  return senateBills.includes(billNumber) ? "s" : "hr";
}

function buildBillUrl(billNumber) {
  const chamber = getChamber(billNumber);
  return `https://api.congress.gov/v3/bill/${CONGRESS}/${chamber}/${billNumber}?api_key=${apiKey}`;
}

function buildCosponsorsUrl(billNumber, offset = 0, limit = 250) {
  const chamber = getChamber(billNumber);
  return `https://api.congress.gov/v3/bill/${CONGRESS}/${chamber}/${billNumber}/cosponsors?api_key=${apiKey}&limit=${limit}&offset=${offset}`;
}

async function fetchJson(url) {
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status}) for ${url}`);
  }

  return await response.json();
}

function normalizeMember(member = {}) {
  return {
    bioguideId: member.bioguideId || member.bioguide_id || null,
    firstName: member.firstName || "",
    middleName: member.middleName || "",
    lastName: member.lastName || "",
    fullName:
      member.fullName ||
      [member.firstName, member.middleName, member.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    party: member.party || "",
    state: member.state || member.stateCode || "",
    district: member.district ?? null,
    sponsorshipDate: member.sponsorshipDate || member.sponsoredDate || null,
    isOriginalCosponsor:
      typeof member.isOriginalCosponsor === "boolean"
        ? member.isOriginalCosponsor
        : false,
    url: member.url || ""
  };
}

function uniqueMembers(members = []) {
  const seen = new Set();
  const output = [];

  for (const raw of members) {
    const member = normalizeMember(raw);
    const key =
      member.bioguideId ||
      `${member.fullName}|${member.party}|${member.state}|${member.district}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(member);
  }

  return output;
}

function sortMembers(members = []) {
  return [...members].sort((a, b) => {
    const last = a.lastName.localeCompare(b.lastName);
    if (last !== 0) return last;

    const first = a.firstName.localeCompare(b.firstName);
    if (first !== 0) return first;

    return String(a.district ?? "").localeCompare(String(b.district ?? ""));
  });
}

function isWA(member) {
  return String(member?.state || "").toUpperCase() === WA_STATE;
}

function normalizeCommitteeReports(reports) {
  if (!Array.isArray(reports)) return [];
  return reports;
}

// ---------------------------
// FETCH BASE BILL DATA
// ---------------------------
async function fetchBaseBill(billNumber) {
  return await fetchJson(buildBillUrl(billNumber));
}

// ---------------------------
// GET ALL COSPONSORS
// ---------------------------
async function getAllCosponsors(billNumber) {
  let offset = 0;
  let all = [];

  while (true) {
    const data = await fetchJson(buildCosponsorsUrl(billNumber, offset, 250));

    // Congress API list payloads typically return a top-level collection plus pagination.
    const pageItems =
      data.cosponsors ||
      data.bill?.cosponsors ||
      [];

    if (!Array.isArray(pageItems) || pageItems.length === 0) {
      break;
    }

    all.push(...pageItems);

    if (!data.pagination?.next) {
      break;
    }

    offset += 250;
  }

  return sortMembers(uniqueMembers(all));
}

// ---------------------------
// NORMALIZATION
// ---------------------------
function normalizeBill(raw, cosponsors, billNumber) {
  const bill = raw.bill;
  const chamber = getChamber(billNumber);

  const sponsor = bill.sponsors?.[0] ? normalizeMember(bill.sponsors[0]) : null;
  const normalizedCosponsors = sortMembers(uniqueMembers(cosponsors));

  return {
    id: `${chamber}${billNumber}`,
    chamber,
    number: billNumber,
    label: chamber === "hr" ? `H.R. ${billNumber}` : `S. ${billNumber}`,
    title: bill.title || "",
    latestAction: bill.latestAction?.text || "",
    actionDate: bill.latestAction?.actionDate || "",
    step: bill.currentChamber || "Introduced",
    legislationUrl: bill.url || bill.urls?.congressURL || "",

    sponsor,
    cosponsors: normalizedCosponsors,
    cosponsorCount: normalizedCosponsors.length,
    updatedDate: new Date().toISOString(),

    stageDates: {
      introduced: bill.introducedDate || null,
      passedHouse: bill.passedHouseDate || null,
      passedSenate: bill.passedSenateDate || null,
      toPresident: bill.toPresidentDate || null,
      becameLaw: bill.enactedDate || null
    },

    committeeActions: normalizeCommitteeReports(bill.committeeReports)
  };
}

// ---------------------------
// FILTER TO WASHINGTON ONLY
// ---------------------------
function filterWashingtonOnly(data) {
  const waSponsor = data.sponsor && isWA(data.sponsor) ? data.sponsor : null;
  const waCosponsors = sortMembers(uniqueMembers((data.cosponsors || []).filter(isWA)));

  return {
    ...data,
    hasWaSponsor: waSponsor !== null,
    waSponsor,
    waCosponsors,
    waCosponsorCount: waCosponsors.length
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
    console.log(`\nChecking ${chamber === "HR" ? "H.R." : "S."} ${bill}...`);

    try {
      const base = await fetchBaseBill(bill);
      const allCosponsors = await getAllCosponsors(bill);
      const fullBill = normalizeBill(base, allCosponsors, bill);
      const waBill = filterWashingtonOnly(fullBill);

      console.log(
        `→ Total cosponsors: ${waBill.cosponsorCount}, ` +
        `WA Sponsor: ${waBill.hasWaSponsor ? "YES" : "NO"}, ` +
        `WA Cosponsors: ${waBill.waCosponsorCount}`
      );

      if (waBill.id === "hr2102") {
        console.log(
          `→ H.R. 2102 WA names: ${
            waBill.waCosponsors.map(x => x.fullName).join(", ") || "none"
          }`
        );
      }

      output[waBill.id] = waBill;
    } catch (err) {
      console.log(`✗ Failed to process ${chamber}. ${bill}: ${err.message}`);
    }
  }

  const outPath = path.resolve("bills.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("\n✓ Done. Saved to bills.json");
}

run();
