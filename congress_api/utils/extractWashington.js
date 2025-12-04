function extractWashington(bill) {
  if (bill.sponsor && bill.sponsor.state === "WA") {
    bill.hasWaSponsor = true;
    bill.waSponsor = bill.sponsor;
  } else {
    bill.hasWaSponsor = false;
    bill.waSponsor = null;
  }

  const waCos = (bill.cosponsors || []).filter(c => c.state === "WA");

  bill.waCosponsors = waCos;
  bill.waCosponsorCount = waCos.length;

  return bill;
}

module.exports = { extractWashington };

