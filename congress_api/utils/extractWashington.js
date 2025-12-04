// extractWashington.js
//
// This function modifies the bill object in-place,
// adding WA-specific sponsor/cosponsor fields.

export function extractWashington(bill) {
  const WA_STATE = "WA";

  // WA sponsor
  if (bill.sponsor?.state === WA_STATE) {
    bill.hasWaSponsor = true;
    bill.waSponsor = bill.sponsor;
  } else {
    bill.hasWaSponsor = false;
    bill.waSponsor = null;
  }

  // WA cosponsors
  bill.waCosponsors = bill.cosponsors.filter(c => c.state === WA_STATE);
  bill.waCosponsorCount = bill.waCosponsors.length;
}
