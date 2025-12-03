import { test, expect } from "@playwright/test";

const bills = [
  "467",
  "530",
  "647",
  "659",
  "740",
  "785",
  "913",
  "965",
  "980",
  "981",
  "983",
  "1039",
  "1228",
  "1286",
  "1344",
  "1404",
  "1423",
  "1578",
  "1646",
  "1741",
  "1845",
  "1965",
  "2055",
  "2068",
  "2102",
  "2137"
];

test("scrape Congress.gov for WA sponsors, cosponsors, and recent activity", async ({ page }) => {
  for (const bill of bills) {
    const url = `https://www.congress.gov/bill/119th-congress/house-bill/${bill}`;
    console.log(`Checking H.R. ${bill}...`);

    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

    const sponsor = await page.locator(".overview li:has-text('Sponsor')").innerText().catch(() => "None found");
    const cosponsors = await page.locator(".overview li:has-text('Cosponsors')").innerText().catch(() => "None found");
    const latestAction = await page.locator(".latest-summary").innerText().catch(() => "None found");

    console.log(`Sponsor: ${sponsor}`);
    console.log(`Cosponsors: ${cosponsors}`);
    console.log(`Latest Action: ${latestAction}`);
  }
});

