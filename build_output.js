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

async function fetchBill(chamber, number) {
  const url = `https://api.congress.gov/v3/bill/119/${chamber}/${number}?api_key=${apiKey}&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`Failed to fetch ${chamber.toUpperCase()}. ${number} (${res.status})`);
    return null;
  }
  const json = await res.json();
  return json.bill || null;
}

async function fetchCosponsors(bill) {
  if (!bill.cosponsors || !bill.cosponsors.url) return [];

  let url = bill.cosponsors.url;
  if (!url.includes("api_key")) {
    url += (url.includes("?") ? "&" : "?") + `api_key=${apiKey}`;
  }

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`Cosponsor fetch failed (${res.status}) for ${bill.number}`);
      return [];
    }
    const json = await res.json();

    const list =
      json.cosponsors ||
      json.items ||
      json.data ||
      [];

    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function extractRecord(bill, chamber, number, waSponsor, waCosponsors) {
  const label = `${chamber === "hr" ? "H.R." : "S."} ${number}`;
  const latestText = bill.latestAction?.text || "";
  const latestDate = bill.latestAction?.actionDate || "";

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
    sponsor: bill.sponsors?.[0] || null,
    cosponsorCount: bill.cosponsors?.count ?? 0,
    updatedDate: bill.updateDate || bill.updateDateIncludingText || null,

    // Washington-specific fields
    hasWaSponsor: !!waSponsor,
    waSponsor: waSponsor || null,
    waCosponsors,
    waCosponsorCount: waCosponsors.length
  };
}

function isWA(person) {
  if (!person) return false;
  const st = (person.state || person.stateCode || "").toUpperCase();
  return st === "WA";
}

async function run() {
  console.log("Building compact bills.json snapshot with WA filters…");

  const allNumbers = [...houseBills, ...senateBills];
  const results = {};

  let previous = {};
  try {
    const prevRaw = fs.readFileSync("bills.json", "utf8");
    previous = JSON.parse(prevRaw);
  } catch {
    previous = {};
  }

  const changedIds = [];

  for (const num of allNumbers) {
    const chamber = getChamber(num);
    console.log(`Summarizing ${chamber.toUpperCase()}. ${num}…`);

    const bill = await fetchBill(chamber, num);
    if (!bill) continue;

    const sponsors = bill.sponsors || [];
    const waSponsor = sponsors.find(isWA) || null;

    const cosponsorList = await fetchCosponsors(bill);
    const waCosponsors = cosponsorList.filter(isWA);

    const record = extractRecord(bill, chamber, num, waSponsor, waCosponsors);
    const id = record.id;

    const oldRec = previous[id] ? JSON.stringify(previous[id]) : null;
    const newRec = JSON.stringify(record);

    if (oldRec !== newRec) {
      changedIds.push(id);
    }

    results[id] = record;
  }

  fs.writeFileSync("bills.json", JSON.stringify(results, null, 2));

  if (changedIds.length === 0) {
    console.log("No bill changes detected.");
  } else {
    console.log("Changed bills:", changedIds.join(", "));
  }

  console.log("bills.json written.");
}

run();
