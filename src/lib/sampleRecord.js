// The ONE quarry record that is deliberately unlocked in full for every visitor.
//
// Chosen from the records featured in the homepage preview sections (394 Shale,
// Algood Quarry, Bedrock Quarry and Gravel, Gordonsville Plant) because it holds
// the most complete premium intelligence of the four: recorded parcel owner and
// mining-site owner/operator/permittee/controller, a parcel/tax record with
// assessed, land and improvement values plus property and mailing address, two
// connected permits with 175.6 permitted acres, a mapped geology record,
// reported production, an environmental record, two USGS mineral occurrences and
// a parcel ownership verification.
//
// No data was invented or filled in — the page renders the record exactly as it
// exists. Mirrored server-side in base44/functions/get-premium-site-data — keep
// the ID in sync there.
export const SAMPLE_RECORD_ID = "6a79fe40925c52c762c59a12";
export const SAMPLE_RECORD_NAME = "Algood Quarry";
export const SAMPLE_RECORD_LABEL = "Sample Record — shown in full";

export function isSampleRecord(id) {
  return Boolean(id) && String(id) === SAMPLE_RECORD_ID;
}