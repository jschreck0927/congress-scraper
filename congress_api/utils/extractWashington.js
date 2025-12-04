// Washington state federal delegation (House + Senate)
const WA_MEMBERS = [
  // House (10 districts)
  "DelBene",     // WA-01
  "Larsen",      // WA-02
  "Gluesenkamp", // WA-03 (Perez)
  "Perez",
  "Newhouse",    // WA-04
  "Baumgartner", // WA-05
  "Randall",     // WA-06
  "Jayapal",     // WA-07
  "Schrier",     // WA-08
  "Smith",       // WA-09
  "Strickland",  // WA-10

  // Senate
  "Murray",
  "Cantwell"
];

// Normalize for easy matching
function isWashingtonMember(name = "") {
  return WA_MEMBERS.some(last => name.includes(last));
}

export function extractWashington(bill) {
  // Defaults
  bill.hasWaSponsor = false;
  bill.waSponsor = null;
  bill.waCosponsors = [];
  bill.waCosponsorCount = 0;

  // Check primary sponsor
  if (bill.sponsor && isWashingtonMember(bill.sponsor.lastName || bill.sponsor.fullName)) {
    bill.hasWaSponsor = true;
    bill.waSponsor = bill.sponsor;
  }

  // Check cosponsors
  if (Array.isArray(bill.cosponsors)) {
    bill.waCosponsors = bill.cosponsors.filter(c =>
      isWashingtonMember(c.lastName || c.fullName)
    );
    bill.waCosponsorCount = bill.waCosponsors.length;
  }

  return bill;
}
