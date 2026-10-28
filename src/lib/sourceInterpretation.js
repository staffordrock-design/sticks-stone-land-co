// Summary selection is explicit; never treat the most recently edited permit
// or the largest acreage as the controlling permit.
export function selectSummaryPermit(permits = [], site = {}) {
  const rows = [...permits].filter(Boolean);
  const active = rows.filter(p => /^(active|issued|effective)$/i.test(String(p.status || '').trim()));
  const candidates = active.length ? active : rows;
  return candidates.find(p => p.permit_number && p.permit_number === site.tdec_permit_number)
    || candidates.sort((a, b) => String(b.last_source_update || '').localeCompare(String(a.last_source_update || '')))[0]
    || null;
}

export function ownershipStatusLabel(verification, owner) {
  if (verification?.status === 'Verified') return 'Verified against cited source';
  if (owner && /no owner/i.test(String(verification?.status || ''))) {
    return 'Owner supplied by another linked source; parcel ownership verification pending';
  }
  return verification?.status || (owner ? 'Source-linked owner; title not independently verified' : 'Ownership not yet linked');
}
