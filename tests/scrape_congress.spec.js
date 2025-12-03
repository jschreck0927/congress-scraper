import { test, expect } from "@playwright/test";

// Increase total test timeout to prevent workflow failures
test.setTimeout(180000);

const bills = [
  "467", "530", "647", "659", "740", "785", "913", "965", "980", "981",
  "983", "1039", "1228", "1286", "1344", "1404", "1423", "1578", "1646",
  "1741", "1845", "1965", "2055", "2068", "2102", "2137"
];

test("scrape Congress.gov for WA sponsors, cosponsors, and recent activity", async ({ page }) => {
  for (const bill of bills) {
    console.log(`\nChecking H.R. ${bill}...`);
    const url = `https://www.congress.gov/bill/119th-congress/house-bill/${bill}`;

    try {
      // More generous timeout + stable wait for slow pages
      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 120000
      });

      // Scrape sponsor
      const sponsor = await page
        .locator(".overview li:has-text('Sponsor')")
        .innerText()
        .catch(() => "None found");

      // Scrape cosponsors
      const cosponsors = await page
        .locator(".overview li:has-text('Cosponsors')")
        .innerText()
        .catch(() => "None found");

      // Scrape latest action
      const latestAction = await page
        .locator(".latest-summary, .latest-action")
        .innerText()
        .catch(() => "None found");

      console.log(`Sponsor: ${sponsor}`);
      console.log(`Cosponsors: ${cosponsors}`);
      console.log(`Latest Action: ${latestAction}`);

    } catch (err) {
      console.log(`Timed out or failed on bill ${bill}. Skipping.`);
    }
  }
});
