import fs from 'node:fs';

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function parseJsonc(path) {
  const raw = read(path)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  return JSON.parse(raw);
}

function requireFields(path, fields) {
  const schema = parseJsonc(path);
  const props = schema?.properties || {};
  const missing = fields.filter((field) => !(field in props));
  if (missing.length) {
    throw new Error(`${path} is missing required network fields: ${missing.join(', ')}`);
  }
}

function requireText(path, snippets) {
  const source = read(path);
  const missing = snippets.filter((snippet) => !source.includes(snippet));
  if (missing.length) {
    throw new Error(`${path} is missing required network wiring: ${missing.join(' | ')}`);
  }
}

requireFields('base44/entities/UserProfile.jsonc', [
  'headline', 'bio', 'website', 'skills', 'industry_years',
  'open_to_opportunities', 'profile_visibility',
]);

requireFields('base44/entities/DataRoomRequest.jsonc', [
  'network_opportunity_id', 'mining_site_id', 'opportunity_title',
  'opportunity_owner_user_id', 'buyer_company', 'purpose', 'nda_agreed',
]);

requireFields('base44/entities/DealInterest.jsonc', [
  'network_opportunity_id', 'mining_site_id', 'opportunity_owner_user_id',
  'opportunity_title', 'buyer_email', 'buyer_company', 'interest_type', 'status',
]);

requireFields('base44/entities/DataRoomAccess.jsonc', [
  'network_opportunity_id', 'data_room_request_id', 'mining_site_id',
  'opportunity_owner_user_id', 'access_status', 'granted_at',
]);

requireFields('base44/entities/DealPipeline.jsonc', [
  'network_opportunity_id', 'data_room_request_id', 'mining_site_id',
  'seller_user_id', 'buyer_user_id',
]);

requireFields('base44/entities/CompanyWatch.jsonc', [
  'user_id', 'company_name', 'relationship_type', 'created_at',
]);

requireFields('base44/entities/QuarryNetworkCompany.jsonc', [
  'company_key', 'company_name', 'roles', 'site_count', 'active_site_count',
  'states', 'counties', 'commodities', 'last_built_at',
]);

requireFields('base44/entities/QuarryNetworkLink.jsonc', [
  'company_key', 'company_name', 'relationship_type', 'mining_site_id',
  'mine_name', 'operator_name', 'controller_name', 'landowner_name',
  'permittee_name', 'last_built_at',
]);

requireText('src/pages/Network.jsx', [
  'onClick={() => toggleLike(post)}',
  'listing_id: item.linked_listing_id || `network:${item.id}`',
  'network_opportunity_id: item.id',
  'opportunity_owner_user_id: item.author_user_id',
  'await base44.entities.NetworkOpportunity.update(item.id, { status, updated_at:',
  'await base44.entities.ProfessionalConnection.update(connection.id, { status: "Accepted"',
]);

requireText('src/pages/Messages.jsx', [
  'setProfiles((people || []).filter((p) => p.user_id !== user.id));',
  'setNotice("Message sent.")',
]);

requireText('src/pages/NetworkIntel.jsx', [
  'S&amp;S Quarry Network Intelligence',
  'base44.entities.MiningSite.filter({ state }, "-updated_date", 500, offset)',
  'loadQuarrySitesForState(state, 500)',
  'buildCompanyNetwork(sites)',
  'base44.entities.CompanyWatch.create({',
  'base44.entities.QuarryNetworkCompany.list("-active_site_count", 500, offset)',
  '/network/company/${companySlug(company.name)}?name=${encodeURIComponent(company.name)}',
  'Open company network',
  'Open full intelligence',
  '/network/watchlist',
  '/network/deals',
  '/network/deals/new',
  '/network/deals/activity',
  '/network/deals/${item.id}',
]);

requireText('src/pages/CompanyNetworkDetail.jsx', [
  'Company Network Profile',
  'base44.entities.QuarryNetworkLink.filter({ company_key: targetKey }',
  'base44.entities.TDECPermit.filter(byMsha',
  'base44.entities.GeologyRecord.filter(bySite',
  'base44.entities.EnvironmentalRecord.filter(byMsha',
  'base44.entities.ProductionRecord.filter(bySite',
  'base44.entities.ContractIntelligence.filter(bySite',
  'Open quarry intelligence',
]);

requireText('src/pages/NetworkWatchlist.jsx', [
  'Network Watchlist',
  'base44.entities.CompanyWatch.filter({ user_id: user.id }',
  'base44.entities.SavedOpportunity.filter({ user_id: user.id }',
  'Open company network',
  'Open full intelligence',
]);

requireText('src/pages/NetworkDeals.jsx', [
  'Deal Network',
  'base44.entities.NetworkOpportunity.list("-created_at", 500)',
  'base44.entities.DealInterest.list("-submitted_at", 500)',
  'Open deal workspace',
  '/network/deals/new',
  '/network/deals/activity',
]);

requireText('src/pages/NetworkPostDeal.jsx', [
  'Post a quarry opportunity',
  'base44.entities.NetworkOpportunity.create({',
  'linked_mining_site_id: site?.id || ""',
  'navigate("/network/deals?posted=1"',
]);

requireText('src/pages/NetworkDealDetail.jsx', [
  'Deal Network',
  'base44.entities.DealInterest.create({',
  'base44.entities.DataRoomRequest.create({',
  'base44.entities.DataRoomRequest.update(request.id',
  'base44.entities.DealInterest.update(interest.id',
  'base44.entities.NetworkOpportunity.update(deal.id',
  "I'm interested",
  'Request Data Room / NDA',
]);

requireText('src/pages/NetworkDealActivity.jsx', [
  'Deal Activity',
  'Incoming buyer interest',
  'Interest I sent',
  'Data-room activity',
  'base44.entities.DealInterest.list("-submitted_at", 500)',
  'base44.entities.DataRoomRequest.list("-requested_at", 500)',
]);

requireText('base44/functions/build-quarry-network-index/entry.ts', [
  'allRows(base44.asServiceRole.entities.MiningSite',
  'QuarryNetworkCompany.bulkCreate',
  'QuarryNetworkCompany.bulkUpdate',
  'QuarryNetworkLink.bulkCreate',
  'QuarryNetworkLink.bulkUpdate',
  'quarry_records_scanned',
]);

requireText('base44/workflows/Quarry Network Index Refresh.jsonc', [
  'build-quarry-network-index',
  'interval_value": 6',
  'interval_unit": "hours"',
]);

requireText('src/App.jsx', [
  '<Route path="/network" element={<NetworkIntel />} />',
  '<Route path="/network/company/:companySlug" element={<CompanyNetworkDetail />} />',
  '<Route path="/network/watchlist" element={<NetworkWatchlist />} />',
  '<Route path="/network/deals" element={<NetworkDeals />} />',
  '<Route path="/network/deals/new" element={<NetworkPostDeal />} />',
  '<Route path="/network/deals/activity" element={<NetworkDealActivity />} />',
  '<Route path="/network/deals/:id" element={<NetworkDealDetail />} />',
  '<Route path="/network/community" element={<Network />} />',
  '<Route path="/ownership-intelligence" element={<OwnershipIntelligence />} />',
  '<Route path="/messages" element={<Messages />} />',
  '<Route path="/profile" element={<Profile />} />',
]);

requireText('src/components/BottomNav.jsx', [
  '{ to: "/network", label: "Network", icon: Users',
  'const alwaysOpenRoot = tab.to === "/network" || tab.to === "/intelligence";',
]);

requireText('src/components/QuarryActionBar.jsx', [
  '/network?site=',
  '/network/deals/new?site=',
  'Network intel',
  'Post deal',
]);

requireText('src/components/AccountProfileGate.jsx', [
  '"/network/community"',
]);

console.log('Quarry Network contract validation passed.');
