import fetch from "node-fetch";

const apiKey = process.env.CONGRESS_API_KEY;

// House bills
const houseBills = [
  "467","647","659","740","785","913","965","980","981","983",
  "1039","1228","1286","1344","1404","1423","1578","1646","1741",
  "1845","1965","2055","2068","2102","2137","2138","2148","2201",
  "2334","2605","2623","2701","2721","2878","3123","3132","3386",
  "3387","3400","3481","3627","3726","3753","3833","3834","3835",
  "3951","3983","4837"
];

// Senate bills
const senateBills = [
  "275","478","585","599","605","607","609","610","611","649",
  "778","784","793","800","827","879","892","1032","1245","1318",
  "1320","1441","1533","1543"
];

// Combined
const bills = [...houseBills, ...senateBills];

// Detect chamber
function getChamber(billNumber) {
  if (senateBills.includes(billNumber)) return "s";
  return "hr";
}

// Build Congress.gov API URL
function buildUrl(billNumber) {
  const chamber = getChamber(billNumber);
  return `https://api.congress.gov/v3/bill/119/${chamber}/${billNumber}?api_key=${apiKey}`;
}

// Fetch bill data
async function getBillData(billNumber) {
  const url = buildUrl(billNumber);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }

  const data = await response.json();
  return data;
}

// Run scraper
async function run() {
  console.log("Starting Congress bill update check...\n");

  for (const bill of bills) {
    const chamber = getChamber(bill).toUpperCase();

    console.log(`Checking ${chamber}. ${bill}...`);

    try {
      const info = await getBillData(bill);

      console.log(`✓ Success: ${chamber}. ${bill}`);
      console.log(JSON.stringify(info, null, 2));
      console.log("\n--------------------------------------\n");

    } catch (err) {
      console.log(`✗ Failed: ${chamber}. ${bill} — ${err.message}`);
      console.log("\n--------------------------------------\n");
    }
  }

  console.log("All bills processed.");
}

run();
