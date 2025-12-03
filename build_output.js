import fs from "fs";
import fetch from "node-fetch";

const apiKey = process.env.CONGRESS_API_KEY;

// House + Senate bills
const houseBills = [...]; // you already have these
const senateBills = [...];

function getChamber(num) {
  return senateBills.includes(Number(num)) ? "s" : "hr";
}

async function fetchBill(chamber, number) {
  const url = `https://api.congress.gov/v3/bill/119/${chamber}/${number}?api_key=${apiKey}&format=json`;

  const res = await fetch(url);
  if (!res.ok) return null;

  const data = await res.json();
  return data.bill || null;
}

function extractKeyFields(bill, chamber, number) {
  return {
    bill_id: `${chamber}${number}`,
    chamber,
    number,
    title: bill?.title || "",
    latestAction: bill?.latestAction?.text || "",
    actionDate: bill?.latestAction?.actionDate || "",
    sponsors: bill?.sponsors || [],
    cosponsors: bill?.cosponsors?.count || 0,
    statusStep: determineStep(bill?.latestAction?.text || "")
  };
}

function determineStep(text) {
  text = text?.toLowerCase() || "";
  if (text.includes("became law")) return "law";
  if (text.includes("president")) return "president";
  if (text.includes("passed senate")) return "passed_senate";
  if (text.includes("passed house")) return "passed_house";
  return "introduced";
}

async function run() {
  const bills = [...houseBills.map(String), ...senateBills.map(String)];

  let results = {};

  for (const number of bills) {
    const chamber = getChamber(number);
    const bill = await fetchBill(chamber, number);

    if (!bill) continue;

    results[`${chamber}${number}`] = extractKeyFields(bill, chamber, number);
  }

  fs.writeFileSync("bills.json", JSON.stringify(results, null, 2));
}

run();
