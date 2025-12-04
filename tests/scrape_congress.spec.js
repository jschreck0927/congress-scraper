import { test } from "@playwright/test";
import fs from "fs/promises";

// Give the test plenty of time
test.setTimeout(300000);

// All House + Senate bills you listed
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
if (!apiKey) {
  throw new Error("Missing CONGRESS_API_KEY environment variable.");
}

// --- Helpers ---

function isWA(person) {
  return (person?.state || person?.stateCode || "").toUpperCase() === "WA";
}

function extractStateFromName(fullName) {
  if (!fullName) return null;
  const m = fullName.match(/\[[A-Z]-([A-Z]{2})-/);
  return m ? m[1] : null;
}

function extractBioguideFromHref(href) {
  if (!href) return null;
  const m = href.match(/\/member\/[^/]+\/([A-Z0-9]+)$/);
  return m ? m[1] : null;
}

function ensureStageDates(billJson) {
  const stageDates = billJson.stageDates || {};
  if (!stageDates.introduced) {
    stageDates.introduced = billJson.introducedDate || billJson.actionDate || null;
  }
  if (!("passedHouse" in stageDates)) stageDates.passedHouse = null;
  if (!("passedSenate" in stageDates)) stageDates.passedSenate = null;
  if (!("toPresident" in stageDates)) stageDates.toPresident = null;
  if (!("becameLaw" in stageDates)) stageDates.becameLaw = null;
  return stageDates;
}

// --- API metadata: title, sponsor, latest action, introduced date, etc. ---

async function fetchBillMetadata(type, number) {
  const url = `https://api.congress.gov/v3/bill/119/${type}/${number}?api_key=${apiKey}&format=json`;
  const res = await fetch(url);
  if (!res.ok) {
    console.log(`API error for ${type.toUpperCase()} ${number}: ${res.status}`);
    return null;
  }
  const json = await res.json();
  const bill = json.bill;

  const sponsor = bill.sponsors?.[0] || null;
  const latestAction = bill.latestAction?.text || "None";
  const actionDate = bill.latestAction?.actionDate || null;
  const introducedDate = bill.introducedDate || null;

  // Simple committee activity from actions endpoint
  let committeeActions = [];
  try {
    const actionsUrl = `https://api.congress.gov/v3/bill/119/${type}/${number}/actions?api_key=${apiKey}&format=json`;
    const actionsRes = await fetch(actionsUrl);
    if (actionsRes.ok) {
      const actionsJson = await actionsRes.json();
      const actionList = actionsJson.actions?.actions || actionsJson.actions || [];
      committeeActions = actionList
        .filter(a => /committee|subcommittee/i.test(a.text || ""))
        .map(a => ({
          text: a.text,
          actionDate: a.actionDate || null
        }));
    }
  } catch (e) {
    console.log(`Failed to fetch committee actions for ${type.toUpperCase()} ${number}`, e);
  }

  const billJson = {
    id: `${type}${number}`,
    chamber: type,
    number: number.toString(),
    label: `${type.toUpperCase()}. ${number}`,
    title: bill.title || "No title available",
    latestAction,
    actionDate,
    introducedDate,
    step: bill.latestAction?.text ? "Introduced" : "Introduced",
    legislationUrl: bill.legislationUrl,
    sponsor,
    updatedDate: bill.updateDate || bill.updateDateIncludingText || null,
    committeeActions
  };

  billJson.stageDates = ensureStageDates(billJson);
  return billJson;
}

// --- HTML cosponsor scraping with Playwright ---

async function scrapeCosponsorsFromHtml(page, type, number) {
  const baseUrl = `https://www.congress.gov/bill/119th-congress/${type === "hr" ? "house-bill" : "senate-bill"}/${number}/cosponsors`;

  let pageNum = 1;
  let all = [];

  while (true) {
    const url = pageNum === 1 ? baseUrl : `${baseUrl}?page=${pageNum}`;
    console.log(`  Scraping cosponsors HTML: ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });

    const pageData = await page.$$eval(
      'table.item_table tbody tr, table.item-table tbody tr, table tbody tr',
      rows => {
        return rows
          .map(row => {
            const tds = Array.from(row.querySelectorAll("td"));
            if (!tds.length) return null;

            // First cell: name/link
            const nameCell = tds[0];
            const link = nameCell.querySelector("a");
            const fullName = nameCell.innerText.trim();

            // Last cell often date
            const dateCell = tds[tds.length - 1];
            const sponsorshipDate = dateCell ? dateCell.innerText.trim() : null;

            // A middle cell may contain "Original", etc.
            let isOriginalCosponsor = false;
            for (let i = 1; i < tds.length - 1; i++) {
              const txt = tds[i].innerText.toLowerCase();
              if (txt.includes("original")) {
                isOriginalCosponsor = true;
                break;
              }
            }

            const href = link ? link.getAttribute("href") : null;

            return {
              fullName,
              sponsorshipDate,
              isOriginalCosponsor,
              state: null, // filled below
              bioguideId: href ? href.replace(/.*\/member\/[^/]+\//, "") || null : null,
              memberUrl: href || null
            };
          })
          .filter(Boolean);
      }
    );

    // If no cosponsors found on this page, stop
    if (!pageData.length) break;

    all = all.concat(pageData);

    // Try to detect a Next link
    const hasNext = await page.$('a[aria-label="Next"], a.next, a:has-text("Next")');
    if (!hasNext) break;

    pageNum++;
  }

  // Fill state from fullName
  all = all.map(c => ({
    ...c,
    state: c.state || extractStateFromName(c.fullName)
  }));

  return all;
}

// --- Main test: fetch metadata + HTML cosponsors, then write bills.json ---

test("scrape Congress.gov (API + HTML) and write bills.json", async ({ page }) => {
  const results = {};

  // HOUSE
  for (const num of houseBills) {
    console.log(`\n=== H.R. ${num} ===`);
    const meta = await fetchBillMetadata("hr", num);
    if (!meta) {
      console.log(`Skipping H.R. ${num} (metadata error)`);
      continue;
    }

    // Scrape ALL cosponsors via HTML (full list, including WA)
    const cosponsors = await scrapeCosponsorsFromHtml(page, "hr", num);

    // WA delegation
    const waCosponsors = cosponsors.filter(c => (c.state || "").toUpperCase() === "WA");
    const sponsor = meta.sponsor;
    const hasWaSponsor = sponsor ? isWA(sponsor) : false;
    const waSponsor = hasWaSponsor ? sponsor : null;

    const billJson = {
      ...meta,
      cosponsors,
      cosponsorCount: cosponsors.length,
      hasWaSponsor,
      waSponsor,
      waCosponsors,
      waCosponsorCount: waCosponsors.length
    };

    results[billJson.id] = billJson;

    console.log(
      `  → Cosponsors: ${billJson.cosponsorCount}, WA cosponsors: ${billJson.waCosponsorCount}`
    );
  }

  // SENATE
  for (const num of senateBills) {
    console.log(`\n=== S. ${num} ===`);
    const meta = await fetchBillMetadata("s", num);
    if (!meta) {
      console.log(`Skipping S. ${num} (metadata error)`);
      continue;
    }

    const cosponsors = await scrapeCosponsorsFromHtml(page, "s", num);

    const waCosponsors = cosponsors.filter(c => (c.state || "").toUpperCase() === "WA");
    const sponsor = meta.sponsor;
    const hasWaSponsor = sponsor ? isWA(sponsor) : false;
    const waSponsor = hasWaSponsor ? sponsor : null;

    const billJson = {
      ...meta,
      cosponsors,
      cosponsorCount: cosponsors.length,
      hasWaSponsor,
      waSponsor,
      waCosponsors,
      waCosponsorCount: waCosponsors.length
    };

    results[billJson.id] = billJson;

    console.log(
      `  → Cosponsors: ${billJson.cosponsorCount}, WA cosponsors: ${billJson.waCosponsorCount}`
    );
  }

  await fs.writeFile("bills.json", JSON.stringify(results, null, 2));
  console.log("\n✔ bills.json updated successfully.");
});
