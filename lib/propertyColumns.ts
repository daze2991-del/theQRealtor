// Every properties column a browser (anon/authenticated) client may read.
// report_token is deliberately absent — migration 070 revokes SELECT on it, so
// `select('*')` on properties from the browser fails. Agents get their own
// tokens from /api/properties/report-links (lib/reportLinks.ts).
export const PROPERTY_COLUMNS =
  'id, address, agent_name, created_at, user_id, active, city, state, price, beds, baths, description, agent_phone, deleted_at, deactivated_at, plan_locked_at'
