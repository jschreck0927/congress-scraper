const WA = "WA";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeState(member) {
  return normalizeText(member?.state || member?.stateCode).toUpperCase();
}

function isWA(member) {
  return normalizeState(member) === WA;
}

function normalizeMember(member = {}) {
  return {
    bioguideId: member.bioguideId || null,
    district: member.district ?? null,
    firstName: member.firstName || "",
    fullName:
      member.fullName ||
      [member.firstName, member.middleName, member.lastName]
        .filter(Boolean)
        .join(" ")
        .trim(),
    isOriginalCosponsor:
      typeof member.isOriginalCosponsor === "boolean"
        ? member.isOriginalCosponsor
        : member.isOriginalCosponsor ?? false,
    isByRequest: member.isByRequest ?? undefined,
    lastName: member.lastName || "",
    middleName: member.middleName || undefined,
    party: member.party || "",
    sponsorshipDate: member.sponsorshipDate || undefined,
    state: normalizeText(member.state || member.stateCode),
    url: member.url || ""
  };
}

function uniqueMembers(members = []) {
  const seen = new Set();
  const output = [];

  for (const raw of members) {
    const member = normalizeMember(raw);
    const key =
      member.bioguideId ||
      `${member.fullName}|${member.party}|${member.state}|${member.district}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(member);
  }

  return output;
}

function sortMembers(members = []) {
  return [...members].sort((a, b) => {
    const last = a.lastName.localeCompare(b.lastName);
    if (last !== 0) return last;

    const first = a.firstName.localeCompare(b.firstName);
    if (first !== 0) return first;

    return String(a.district ?? "").localeCompare(String(b.district ?? ""));
  });
}

function computeWashingtonFieldsForBill(bill = {}) {
  const sponsor = bill.sponsor ? normalizeMember(bill.sponsor) : null;

  const cosponsors = Array.isArray(bill.cosponsors)
    ? uniqueMembers(bill.cosponsors)
    : [];

  const waSponsor = sponsor && isWA(sponsor) ? sponsor : null;
  const waCosponsors = sortMembers(uniqueMembers(cosponsors.filter(isWA)));

  return {
    ...bill,
    sponsor,
    cosponsors,
    cosponsorCount: cosponsors.length,
    hasWaSponsor: Boolean(waSponsor),
    waSponsor,
    waCosponsors,
    waCosponsorCount: waCosponsors.length
  };
}

function computeWashingtonFieldsForBills(bills) {
  if (Array.isArray(bills)) {
    return bills.map(computeWashingtonFieldsForBill);
  }

  if (bills && typeof bills === "object") {
    const output = {};
    for (const [key, bill] of Object.entries(bills)) {
      output[key] = computeWashingtonFieldsForBill(bill);
    }
    return output;
  }

  throw new Error("Bills payload must be an object or array.");
}

module.exports = {
  isWA,
  normalizeMember,
  computeWashingtonFieldsForBill,
  computeWashingtonFieldsForBills
};
