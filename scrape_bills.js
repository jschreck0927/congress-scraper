// scrape_bills.js
import fetch from "node-fetch";
import fs from "fs";
import path from "path";
import { extractWashington } from "./congress_api/utils/extractWashington.js";

const apiKey = process.env.CONGRESS_API_KEY;

// ---------------------------
// Bill Lists
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

function getChamber(billNumber) {
  return senateBills.includes(billNumber) ? "s" : "hr";
}

// ---------------------------
// API URL builder
// ---------------------------
function buildUrl(billNumber, offset = 0) {
  const chamber = getChamber(billNumber);
  return `https://api.congress.gov/v3/bill/119/${chamber}/${billNumber}?api_key=${apiKey}&offset=${offset}`;
}

// ---------------------------
// Pagination for cosponsors
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

    // Check if we need another page
    if (!data.pagination || cos.length === 0) break;
    if (offset + cos.length >= data.pagination.count) break;

    offset += cos.length;
  }

  return all;
}

// ---------------------------
// Normalize sponsor/cosponsor
// ---------------------------
function normalizeSponsor(sponsor) {
  if (!sponsor) return null;

  return {
    bioguideId: sponsor.bioguideId,
    firstName: sponsor.firstName,
    lastName: sponsor.lastName,
    middleName: sponsor.middleName || "",
    fullName: sponsor.fullName || "",
    party: sponsor.party || "",
    state: sponsor.state || "",
    district: sponsor.district || null,
    isByRequest: sponsor.isByRequest || "N",
    url: sponsor.url || ""
  };
}

function normalizeCosponsors(list) {
  return list.map(c => ({
    bioguideId: c.bioguideId,
    firstName: c.firstName,
    lastName: c.lastName,
    middleName: c.middleName || "",
    fullName: c.fullName || "",
    party: c.party || "",
    state: c.state || "",
    district: c.district || null,
    isOriginalCosponsor: c.isOriginalCosponsor || false,
    sponsorshipDate: c.sponsorshipDate || "",
    url: c.url || ""
  }));
}

// ---------------------------
// Fetch bill (page 1 only)
// ---------------------------
async function getBillBase(billNumber) {
  const url = buildUrl(billNumber);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  return await response.json();
}

// ---------------------------
// Build simplified bill
// ---------------------------
function extractBillData(apiObj, cosponsors, billNumber) {
  const chamber = getChamber(billNumber);
  const bill = apiObj.bill;

  return {
    id: `${chamber}${billNumber}`,
    chamber,
    number: billNumber,
    label: `${chamber.toUpperCase()}. ${billNumber}`,
    title: bill.title || "",
    latestAction: bill.latestAction?.text || "",
    actionDate: bill.latestAction?.actionDate || "",
    sponsor: normalizeSponsor(bill.sponsors?.[0] || null),
    cosponsors: normalizeCosponsors(cosponsors),
    cosponsorCount: cosponsors.length
  };
}

// ---------------------------
// Main Runner
// ---------------------------
async function run() {
  console.log("Starting Congress WA-filtered update...\n");

  const output = {};

  for (const bill of bills) {
    const chamber = getChamber(bill).toUpperCase();
    console.log(`Checking ${chamber}. ${bill}...`);

    try {
      // Page 1
      const baseData = await getBillBase(bill);

      // All cosponsors (paginated)
      const allCos = await getAllCosponsors(bill);

      // Final cleaned bill
      const clean = extractBillData(baseData, allCos, bill);

      // Washington-only filter
      extractWashington(clean);

      output[clean.id] = clean;

      console.log(`✓ Success: ${clean.label} (WA cosponsors: ${clean.waCosponsorCount})`);
    } catch (err) {
      console.log(`✗ Failed: ${chamber}. ${bill} — ${err.message}`);
    }

    console.log("--------------------------------------\n");
  }

  const outPath = path.resolve("bills.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("Done. Saved to bills.json");
}

run();
