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
  'opportunity_owner_user_id', 'nda_agreed',
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
  'base44.entities.MiningSite.filter({ state }, "mine_name", 500)',
  'buildCompanyNetwork(sites)',
  'base44.entities.CompanyWatch.create({',
  '/network/company/${companySlug(company.name)}?name=${encodeURIComponent(company.name)}',
  'Open company network',
  'Open full intelligence',
  '/network/watchlist',
  '/network/deals',
  '/network/community?tab=opportunities',
]);

requireText('src/pages/CompanyNetworkDetail.jsx', [
  'Company Network Profile',
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
  'Linked quarry intelligence',
  "I'm interested",
]);

requireText('src/App.jsx', [
  '<Route path="/network" element={<NetworkIntel />} />',
  '<Route path="/network/company/:companySlug" element={<CompanyNetworkDetail />} />',
  '<Route path="/network/watchlist" element={<NetworkWatchlist />} />',
  '<Route path="/network/deals" element={<NetworkDeals />} />',
  '<Route path="/network/community" element={<Network />} />',
  '<Route path="/ownership-intelligence" element={<OwnershipIntelligence />} />',
  '<Route path="/messages" element={<Messages />} />',
  '<Route path="/profile" element={<Profile />} />',
]);

requireText('src/components/BottomNav.jsx', [
  '{ to: "/network", label: "Network", icon: Users',
  'const alwaysOpenRoot = tab.to === "/network";',
]);

requireText('src/components/AccountProfileGate.jsx', [
  '"/network/community"',
]);

console.log('Quarry Network contract validation passed.');
