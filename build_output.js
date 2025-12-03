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
  if (t.includes("became law") || t.includes("became public law")) return "Became Law";
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
  let url = bill.cosponsors.url;
  if (!url.includes("api_key")) {
    url += (url.includes("?") ? "&" : "?") + "api_key=" + apiKey;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const list = json?.cosponsors || json?.data || json?.items || [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function fetchActions(bill) {
  if (!bill.actions || !bill.actions.url) return [];
  let url = bill.actions.url;
  if (!url.includes("api_key")) {
    url += (url.includes("?") ? "&" : "?") + "api_key=" + apiKey;
  }
  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const json = await res.json();
    const list = json?.actions || json?.data || [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

function extractStageDatesAndCommittee(actions) {
  const lowerText = a => (a.text || "").toLowerCase();

  const findDate = (predicate) => {
    const hit = actions.find(a => predicate(lowerText(a)));
    return hit ? (hit.actionDate || null) : null;
  };

  const stageDates = {
    introduced: findDate(t => t.includes("introduced")),
    passedHouse: findDate(t =>
      (t.includes("passed") || t.includes("on passage")) && t.includes("house")
    ),
    passedSenate: findDate(t =>
      (t.includes("passed") || t.includes("on passage")) && t.includes("senate")
    ),
    toPresident: findDate(t =>
      t.includes("presented to president") || t.includes("sent to the president")
    ),
    becameLaw: findDate(t =>
      t.includes("became public law") || t.includes("signed into law")
    )
  };

  const committeeActions = actions
    .filter(a => /committee|subcommittee/i.test(a.text || ""))
    .map(a => ({
      text: a.text,
      actionDate: a.actionDate || null
    }));

  return { stageDates, committeeActions };
}

function isWA(person) {
  const st = (person.state || person.stateCode || "").toUpperCase();
  return st === "WA";
}

function extractRecord(bill, chamber, number, cosponsors, actions) {
  const label = `${chamber === "hr" ? "H.R." : "S."} ${number}`;
  const latestText = bill.latestAction?.text || "";
  const latestDate = bill.latestAction?.actionDate || "";
  const { stageDates, committeeActions } = extractStageDatesAndCommittee(actions);

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

    sponsor,
    cosponsors: cosponsors,
    cosponsorCount: cosponsors.length,

    updatedDate: bill.updateDate || bill.updateDateIncludingText || null,

    // Stage dates for tracker
    stageDates,

    // Committee / subcommittee actions
    committeeActions,

    // Washington involvement
    hasWaSponsor: !!waSponsor,
    waSponsor: waSponsor,
    waCosponsors: waCosp,
    waCosponsorCount: waCosp.length
  };
}

async function run() {
  console.log("Building complete bills.json with stage dates and committee actions…");

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

    const [cosponsors, actions] = await Promise.all([
      fetchCosponsors(bill),
      fetchActions(bill)
    ]);

    const record = extractRecord(bill, chamber, num, cosponsors, actions);

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
