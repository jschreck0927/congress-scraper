import fetch from "node-fetch";
import fs from "fs";
import path from "path";

// WA extraction helper (API-level)
import { extractWashington } from "./congress_api/utils/extractWashington.js";

// HTML fallback helper (real-time Congress.gov HTML scraper)
import { fetchWaFromHtml } from "./congress_api/utils/fetchWaFromHtml.js";

const apiKey = process.env.CONGRESS_API_KEY;

// House bills
const houseBills = [
  "467","647","659","740","785","913","965","980","981","983",
  "1039","1228","1286","1344","1404","1423","1578","1646","1741",
  "1845","1965","2055","2068","2102","2137","2138","2148","2201",
  "2334","2605","2623","2701","2721","2878","3123","3132","3386",
  "3387","3400","3481","3627","3726","3753","3833","3834","3835",
  "3951","3983","4837"
];

// Senate bills
const senateBills = [
  "275","478","585","599","605","607","609","610","611","649",
  "778","784","793","800","827","879","892","1032","1245","1318",
  "1320","1441","1533","1543"
];

// Combined list
const bills = [...houseBills, ...senateBills];

// Chamber detection
function getChamber(billNumber) {
  return senateBills.includes(billNumber) ? "s" : "hr";
}

// Build Congress.gov API URL
function buildUrl(billNumber) {
  const chamber = getChamber(billNumber);
  return `https://api.congress.gov/v3/bill/119/${chamber}/${billNumber}?api_key=${apiKey}`;
}

// Normalize sponsor structure
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

// Normalize cosponsor structure
function normalizeCosponsors(list) {
  if (!list) return [];
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

// Extract simplified bill object from API response
function extractBillData(apiObj, billNumber) {
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
    sponsor: normalizeSponsor(bill.sponsors?.[0]),
    cosponsors: normalizeCosponsors(bill.cosponsors)
  };
}

// Fetch bill data from Congress API
async function getBillData(billNumber) {
  const url = buildUrl(billNumber);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return data;
}

// Main scraper
async function run() {
  console.log("Starting Congress bill update...\n");

  const output = {};

  for (const bill of bills) {
    const chamber = getChamber(bill).toUpperCase();
    console.log(`Checking ${chamber}. ${bill}...`);

    try {
      const apiData = await getBillData(bill);
      const cleanBill = extractBillData(apiData, bill);

      //
      // STEP 1 — Extract WA data using API
      //
      extractWashington(cleanBill);

      //
      // STEP 2 — HTML fallback (if API shows ZERO WA engagement)
      //
      if (cleanBill.waCosponsorCount === 0) {
        console.log(`→ API shows no WA cosponsors… checking Congress.gov HTML for ${cleanBill.label}`);

        const htmlMatches = await fetchWaFromHtml(cleanBill.chamber, cleanBill.number);

        if (htmlMatches.length > 0) {
          console.log(`→ HTML discovered WA cosponsors:`, htmlMatches);

          cleanBill.waCosponsors = htmlMatches.map(name => ({
            name,
            source: "html"
          }));

          cleanBill.waCosponsorCount = htmlMatches.length;
        }
      }

      //
      // Store the fully processed bill
      //
      output[cleanBill.id] = cleanBill;

      console.log(`✓ Success: ${cleanBill.label}`);
    } catch (err) {
      console.log(`✗ Failed: ${chamber}. ${bill} — ${err.message}`);
    }

    console.log("--------------------------------------\n");
  }

  //
  // Write output file
  //
  const outPath = path.resolve("bills.json");
  fs.writeFileSync(outPath, JSON.stringify(output, null, 2));

  console.log("All bills processed.");
  console.log(`Saved to: ${outPath}`);
}

run();
