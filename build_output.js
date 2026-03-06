const fs = require("fs");
const path = require("path");
const {
  computeWashingtonFieldsForBills
} = require("./congress_api/utils/extractWashington");

const ROOT = __dirname;
const INPUT_PATH = path.join(ROOT, "bills.json");
const OUTPUT_PATH = path.join(ROOT, "bills.json");

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2) + "\n", "utf8");
}

function toArray(bills) {
  return Array.isArray(bills) ? bills : Object.values(bills || {});
}

function logBillCheck(bills, billKey) {
  const bill = Array.isArray(bills) ? bills.find(b => b.id === billKey) : bills[billKey];
  if (!bill) {
    console.log(`[check] ${billKey} not found`);
    return;
  }

  console.log(`\n[check] ${bill.label} - ${bill.title}`);
  console.log(`[check] cosponsorCount: ${bill.cosponsorCount}`);
  console.log(`[check] waCosponsorCount: ${bill.waCosponsorCount}`);
  console.log(
    `[check] waCosponsors: ${
      (bill.waCosponsors || []).map(x => x.fullName).join(", ") || "none"
    }`
  );
}

function main() {
  if (!fs.existsSync(INPUT_PATH)) {
    throw new Error(`Could not find bills.json at: ${INPUT_PATH}`);
  }

  const raw = readJson(INPUT_PATH);
  const rebuilt = computeWashingtonFieldsForBills(raw);

  writeJson(OUTPUT_PATH, rebuilt);

  const allBills = toArray(rebuilt);
  const totalBills = allBills.length;
  const totalWaSponsorBills = allBills.filter(b => b.hasWaSponsor).length;
  const totalBillsWithWaCosponsors = allBills.filter(
    b => (b.waCosponsorCount || 0) > 0
  ).length;

  console.log(`Rebuilt ${totalBills} bills.`);
  console.log(`Bills with WA sponsor: ${totalWaSponsorBills}`);
  console.log(`Bills with WA cosponsors: ${totalBillsWithWaCosponsors}`);

  logBillCheck(rebuilt, "hr2102");
  logBillCheck(rebuilt, "hr785");
}

main();
