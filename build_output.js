import fs from "fs";
import fetch from "node-fetch";

const apiKey = process.env.CONGRESS_API_KEY;

// House bills
const houseBills = [
  467,647,659,740,785,913,965,980,981,983,1039,1228,1286,1344,1404,1423,1578,
  1646,1741,1845,1965,2055,2068,2102,2137,2138,2148,2201,2334,2605,2623,2701,
  2721,2878,3123,3132,3386,3387,3400,3481,3627,3726,3753,3833,3834,3835,3951,
  3983,4837
];

// Senate bills
const senateBills = [
  275,478,585,599,605,607,609,610,611,649,778,784,793,800,827,879,892,1032,
  1245,1318,1320,1441,1533,1543
];

function determineStep(text = "") {
  const t = text.toLowerCase();
  if (t.includes("became law")) return "Became Law";
  if (t.includes("president")) return "To President";
  if (t.includes("passed senate")) return "Passed Senate";
  if (t.includes("passed house")) return "Passed House";
  return "Introduced";
}

function getChamber(num) {
  return senateBills.includes(Number(num)) ? "s" : "hr";
}

async function fetchBillDetails(chamber, number) {
  const url = `https://api.congress.gov/v3/bill/119/${chamber}/${number}?api_key=${apiKey}&format=json`;

  const res = await fetch(url);
  if (!res.ok) {
    console.log(`Failed bill fetch for ${chamber.toUpperCase()}. ${number} (${res.status})`);
    return null;
  }
  const json = await res.json();
  return json.bill || null;
}

async function fetchCosponsors(bill) {
  if (!bill.cosponsors || !bill.cosponsors.url) return [];

  let url = bill.cosponsors.url.includes("api_key")
    ? bill.cosponsors.url
    : `${bill.cosponsors.url}&api_key=${apiKey}`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();

    // Congress.gov returns cosponsors in different keys depending on endpoint structure
    const list = json?.cosponsors || json?.data || json?.items || [];
    return Array.isArray(list) ? list : [];

  } catch {
    return [];
  }
}

function isWA(person) {
  const st = (person.state || person.stateCode || "").toUpperCase();
  return st === "WA";
}

function extractRecord(bill, chamber, number, cosponsors) {
  const label = `${chamber === "hr" ? "H.R." : "S."} ${number}`;
  const latestText = bill.latestAction?.text || "";
  const latestDate = bill.latestAction?.actionDate || "";

  const sponsor = bill.sponsors?.[0] || null;
  const waSponsor = sponsor && isWA(sponsor) ? sponsor : null;

  const waCosp = cosponsors.filter(isWA);

  return {
    id: `${chamber}${number}`,
    chamber,
    number: String(number),
    label,
    title: bill.title || "",
    latestAction: latestText,
    actionDate: latestDate,
    step: determineStep(latestText),
    legislationUrl: bill.legislationUrl || "",

    // FULL sponsor object
    sponsor,

    // FULL cosponsor list
    cosponsors: cosponsors,

    cosponsorCount: cosponsors.length,
    updatedDate: bill.updateDate || bill.updateDateIncludingText || null,

    // WA-specific fields
    hasWaSponsor: !!waSponsor,
    waSponsor: waSponsor,
    waCosponsors: waCosp,
    waCosponsorCount: waCosp.length
  };
}

async function run() {
  console.log("Building complete bills.json with full cosponsor lists…");

  const allNumbers = [...houseBills, ...senateBills];
  const results = {};

  let previous = {};
  try {
    previous = JSON.parse(fs.readFileSync("bills.json", "utf8"));
  } catch {
    previous = {};
  }

  const changedIds = [];

  for (const num of allNumbers) {
    const chamber = getChamber(num);
    console.log(`Processing ${chamber.toUpperCase()}. ${num}…`);

    const bill = await fetchBillDetails(chamber, num);
    if (!bill) continue;

    const cosponsors = await fetchCosponsors(bill);

    const record = extractRecord(bill, chamber, num, cosponsors);

    const id = record.id;
    const oldRec = previous[id] ? JSON.stringify(previous[id]) : null;
    const newRec = JSON.stringify(record);

    if (oldRec !== newRec) {
      changedIds.push(id);
    }

    results[id] = record;
  }

  fs.writeFileSync("bills.json", JSON.stringify(results, null, 2));

  if (changedIds.length) {
    console.log("Changed bills:", changedIds.join(", "));
  } else {
    console.log("No changes detected.");
  }

  console.log("bills.json updated successfully.");
}

run();
