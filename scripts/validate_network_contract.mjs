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

requireText('src/App.jsx', [
  '<Route path="/network" element={<Network />} />',
  '<Route path="/messages" element={<Messages />} />',
  '<Route path="/profile" element={<Profile />} />',
]);

requireText('src/components/BottomNav.jsx', [
  '{ to: "/network", label: "Network", icon: Users',
]);

console.log('Quarry Network contract validation passed.');
