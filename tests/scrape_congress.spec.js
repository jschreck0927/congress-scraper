import { test, expect } from "@playwright/test";
import fs from "fs/promises";

// House + Senate Bills (ALL YOU LISTED)
const houseBills = [
  467, 530, 647, 659, 740, 785, 913, 965, 980, 981,
  983, 1039, 1228, 1286, 1344, 1404, 1423, 1578, 1646,
  1741, 1845, 1965, 2055, 2068, 2102, 2137, 2138, 2148, 2201,
  2334, 2605, 2623, 2701, 2721, 2878, 3123, 3132, 3386, 3387,
  3400, 3481, 3627, 3726, 3753, 3833, 3834, 3835, 3951, 3983, 4837
];

const senateBills = [
  275, 478, 585, 599, 605, 607, 609, 610, 611, 649,
  778, 784, 793, 800, 827, 879, 892, 1032, 1245, 1318,
  1320, 1441, 1533, 1543
];

const apiKey = process.env.CONGRESS_API_KEY;
if (!apiKey) throw new Error("Missing Congress.gov API key.");

// Pull all cosponsors with pagination
async function getAllCosponsors(type, number) {
  const base = `https://api.congress.gov/v3/bill/119/${type}/${number}/cosponsors?api_key=${apiKey}&format=json`;

  let page = 1;
  let totalPages = 1;
  let results = [];

  do {
    const url = `${base}&page=${page}`;
    const res = await fetch(url);
    if (!res.ok) break;

    const json = await res.json();

    let cosArr = [];
    if (Array.isArray(json.cosponsors)) {
      cosArr = json.cosponsors;
    } else if (Array.isArray(json.cosponsors?.cosponsors)) {
      cosArr = json.cosponsors.cosponsors;
    }

    results = results.concat(cosArr);

    totalPages = json.pagination?.totalPages || 1;
    page++;
  } while (page <= totalPages);

  return results;
}

// Extract all WA delegation from list
function getWA(list) {
  return list.filter(c => (c.state || "").toUpperCase() === "WA");
}

// Fetch full bill data, sponsor, all cosponsors, committees, etc.
async function fetchBill(type, number) {
  const url = `https://api.congress.gov/v3/bill/119/${type}/${number}?api_key=${apiKey}&format=json`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`✗ API error for ${type.toUpperCase()} ${number}`);
      return null;
    }

    const json = await res.json();
    const bill = json.bill;

    // Sponsor
    const sponsor = bill.sponsors?.[0] || null;

    // Full cosponsor list
    const allCosponsors = await getAllCosponsors(type, number);
    const waCosponsors = getWA(allCosponsors);

    // WA sponsor?
    const waSponsor =
      sponsor && (sponsor.state || "").toUpperCase() === "WA"
        ? sponsor
        : null;

    // Latest action
    const latestAction = bill.latestAction?.text || "None";

    // Extract any committee/subcommittee text
    let committeeActions = [];

    if (bill.commitees || bill.committees) {
      // Use API committee list if available
      const committeeGroups = bill.committees?.count || 0;
      // Optional: fetch committee endpoint if needed
    }

    const output = {
      id: `${type}${number}`,
      chamber: type,
      number: number.toString(),
      label: `${type.toUpperCase()}. ${number}`,
      title: bill.title || "No title available",
      latestAction: latestAction,
      actionDate: bill.latestAction?.actionDate || null,
      introducedDate: bill.introducedDate || null,
      step: bill.latestAction?.text || "Introduced",
      legislationUrl: bill.legislationUrl,

      sponsor,
      cosponsors: allCosponsors,
      cosponsorCount: allCosponsors.length,

      hasWaSponsor: !!waSponsor,
      waSponsor,
      waCosponsors,
      waCosponsorCount: waCosponsors.length,

      committeeActions
    };

    console.log(`✓ Success: ${type.toUpperCase()} ${number} (WA: ${waCosponsors.length})`);
    return output;

  } catch (err) {
    console.log(`✗ Failed to fetch ${type} ${number}`, err);
    return null;
  }
}

test("Fetch all bills with WA sponsors/cosponsors and save to bills.json", async () => {
  const results = {};

  // HOUSE
  for (const num of houseBills) {
    const bill = await fetchBill("hr", num);
    if (bill) results[bill.id] = bill;
  }

  // SENATE
  for (const num of senateBills) {
    const bill = await fetchBill("s", num);
    if (bill) results[bill.id] = bill;
  }

  await fs.writeFile("bills.json", JSON.stringify(results, null, 2));
  console.log("✔ bills.json updated successfully.");
});
