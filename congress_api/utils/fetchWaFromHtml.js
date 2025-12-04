import { chromium } from "playwright";

const WA_REPS = [
  "DelBene",
  "Larsen",
  "Perez",
  "Newhouse",
  "Baumgartner",
  "Randall",
  "Jayapal",
  "Schrier",
  "Smith",
  "Strickland"
];

export async function fetchWaFromHtml(chamber, billNumber) {
  const url = `https://www.congress.gov/bill/119th-congress/${chamber === "hr" ? "house" : "senate"}-bill/${billNumber}/cosponsors`;

  const browser = await chromium.launch();
  const page = await browser.newPage();

  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Select cosponsor names in the table
  const names = await page.$$eval("table tbody tr td a", elems =>
    elems.map(e => e.textContent.trim())
  );

  await browser.close();

  // Filter for Washington delegation last names
  const matches = names.filter(name =>
    WA_REPS.some(last => name.includes(last))
  );

  return matches; // returns array of names
}
