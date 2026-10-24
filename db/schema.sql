-- Absel CRM database (PostgreSQL)
-- Tables are created automatically by lib/store-postgres.js: one table per collection,
-- each row = (id, data JSONB, updated_at). Collections:
--   settings, users, rules (territories), templates, automations, leads, activities,
--   tasks, messages, jobs (automation runs), notifications, logins (sign-in and security log),
--   deposits (first deposits + verification), files (deposit proofs, KYC documents), dnc (do-not-contact list),
--   reviews (call quality scorecards), attendance (online time and breaks per person per day),
--   callevents (phone system events and recordings), campaigns, spend (ad spend per day), broadcasts, bonuses (company-funded accounts),
--   clients, accounts, payments (client area)
--
-- The views below flatten the JSON into text columns (cast numbers, e.g. amount::numeric) so you can query the data directly
-- or connect a BI tool (Metabase, Power BI, Looker Studio via a connector) for MIS.

DROP VIEW IF EXISTS v_users;
CREATE VIEW v_users AS
SELECT id,
  data->>'name' AS name, data->>'username' AS username,
  data->>'role' AS role, data->>'team' AS team,
  data->>'active' AS active, data->>'accepts_leads' AS accepts_leads,
  data->>'target_ftd' AS target_ftd
FROM users;

DROP VIEW IF EXISTS v_leads;
CREATE VIEW v_leads AS
SELECT l.id,
  l.data->>'reference' AS reference,
  l.data->>'created_at' AS created_at,
  l.data->>'stage' AS stage,
  l.data->>'temperature' AS temperature,
  l.data->>'score' AS score,
  l.data->>'owner_id' AS owner_id,
  u.data->>'name' AS owner_name,
  l.data->>'first_name' AS first_name, l.data->>'last_name' AS last_name,
  l.data->>'email' AS email, l.data->>'dial_code' AS dial_code, l.data->>'phone' AS phone,
  l.data->>'country' AS country, l.data->>'city' AS city, l.data->>'area' AS area,
  l.data->>'interest' AS interest,
  l.data->>'utm_source' AS utm_source, l.data->>'utm_medium' AS utm_medium, l.data->>'utm_campaign' AS utm_campaign,
  l.data->>'ref_code' AS ref_code,
  l.data->>'attempts' AS attempts, l.data->>'connected_calls' AS connected_calls,
  l.data->>'first_contact_at' AS first_contact_at, l.data->>'first_connected_at' AS first_connected_at,
  l.data#>>'{reached,qualified}' AS qualified_at, l.data#>>'{reached,registered}' AS registered_at,
  l.data#>>'{reached,kyc}' AS kyc_at, l.data->>'funded_at' AS funded_at,
  l.data->>'deposit_amount' AS deposit_amount, l.data->>'account_id' AS account_id,
  l.data->>'lost_reason' AS lost_reason,
  l.data#>>'{profile,capital}' AS capital, l.data#>>'{profile,expected_deposit}' AS expected_deposit,
  l.data#>>'{profile,timeline}' AS timeline
FROM leads l LEFT JOIN users u ON u.id = l.data->>'owner_id';

DROP VIEW IF EXISTS v_calls;
CREATE VIEW v_calls AS
SELECT a.id,
  a.data->>'created_at' AS called_at,
  a.data->>'lead_id' AS lead_id,
  a.data->>'user_id' AS agent_id, u.data->>'name' AS agent_name,
  a.data#>>'{data,outcome}' AS outcome,
  a.data#>>'{data,connected}' AS connected,
  a.data#>>'{data,duration_sec}' AS duration_sec,
  a.data#>>'{data,notes}' AS notes,
  a.data#>>'{data,qa,questions}' AS client_questions,
  a.data#>>'{data,qa,objections}' AS objections
FROM activities a LEFT JOIN users u ON u.id = a.data->>'user_id'
WHERE a.data->>'type' = 'call';

DROP VIEW IF EXISTS v_tasks;
CREATE VIEW v_tasks AS
SELECT id,
  data->>'lead_id' AS lead_id, data->>'owner_id' AS owner_id,
  data->>'type' AS type, data->>'title' AS title,
  data->>'due_at' AS due_at, data->>'done_at' AS done_at,
  data->>'outcome' AS outcome, data->>'auto' AS auto
FROM tasks;

DROP VIEW IF EXISTS v_messages;
CREATE VIEW v_messages AS
SELECT id,
  data->>'created_at' AS created_at, data->>'lead_id' AS lead_id,
  data->>'channel' AS channel, data->>'direction' AS direction,
  data->>'status' AS status, data->>'rule_id' AS rule_id,
  data->>'subject' AS subject, data->>'error' AS error
FROM messages;

DROP VIEW IF EXISTS v_logins;
CREATE VIEW v_logins AS
SELECT id,
  data->>'created_at' AS created_at, data->>'event' AS event,
  data->>'username' AS username, data->>'user_id' AS user_id,
  data->>'ip' AS ip, data->>'ua' AS device
FROM logins;

DROP VIEW IF EXISTS v_deposits;
CREATE VIEW v_deposits AS
SELECT d.id,
  d.data->>'lead_id' AS lead_id, d.data->>'owner_id' AS agent_id, u.data->>'name' AS agent_name,
  d.data->>'amount' AS amount, d.data->>'currency' AS currency, d.data->>'method' AS method,
  d.data->>'tx_ref' AS tx_ref, d.data->>'account_id' AS account_id,
  d.data->>'deposited_at' AS deposited_at, d.data->>'status' AS status,
  d.data->>'verified_at' AS verified_at, d.data->>'reject_reason' AS reject_reason,
  d.data->>'created_at' AS submitted_at
FROM deposits d LEFT JOIN users u ON u.id = d.data->>'owner_id';

DROP VIEW IF EXISTS v_campaigns;
CREATE VIEW v_campaigns AS
SELECT id, data->>'name' AS name, data->>'channel' AS channel,
  data->>'utm_source' AS utm_source, data->>'utm_campaign' AS utm_campaign,
  data->>'budget' AS budget, data->>'status' AS status,
  data->>'start_date' AS start_date, data->>'end_date' AS end_date
FROM campaigns;

DROP VIEW IF EXISTS v_spend;
CREATE VIEW v_spend AS
SELECT s.id, s.data->>'date' AS date, s.data->>'amount' AS amount,
  s.data->>'campaign_id' AS campaign_id, c.data->>'name' AS campaign,
  c.data->>'utm_source' AS utm_source, c.data->>'utm_campaign' AS utm_campaign
FROM spend s LEFT JOIN campaigns c ON c.id = s.data->>'campaign_id';

DROP VIEW IF EXISTS v_reviews;
CREATE VIEW v_reviews AS
SELECT r.id, r.data->>'created_at' AS reviewed_at, r.data->>'agent_id' AS agent_id, u.data->>'name' AS agent_name,
  r.data->>'total' AS score_pct, r.data->>'compliance_ok' AS compliance_ok,
  r.data->>'activity_id' AS call_id, r.data->>'improve' AS to_improve
FROM reviews r LEFT JOIN users u ON u.id = r.data->>'agent_id';

DROP VIEW IF EXISTS v_attendance;
CREATE VIEW v_attendance AS
SELECT a.id, a.data->>'day' AS day, a.data->>'user_id' AS user_id, u.data->>'name' AS name,
  a.data->>'first_at' AS first_seen, a.data->>'last_at' AS last_seen,
  a.data->>'online_min' AS online_minutes, jsonb_array_length(a.data->'breaks') AS breaks
FROM attendance a LEFT JOIN users u ON u.id = a.data->>'user_id';

DROP VIEW IF EXISTS v_broadcasts;
CREATE VIEW v_broadcasts AS
SELECT id, data->>'name' AS name, data->>'channel' AS channel, data->>'status' AS status,
  data->>'total' AS audience, data->>'sent_count' AS sent,
  data->>'started_at' AS started_at, data->>'done_at' AS done_at
FROM broadcasts;

DROP VIEW IF EXISTS v_dnc;
CREATE VIEW v_dnc AS
SELECT id, data->>'phone' AS phone, data->>'email' AS email, data->>'reason' AS reason, data->>'created_at' AS created_at
FROM dnc;

-- Example: cost per FTD by campaign
-- SELECT c.name, SUM(s.amount::numeric) AS spend, (SELECT COUNT(*) FROM v_leads l WHERE l.utm_campaign = c.utm_campaign AND l.funded_at IS NOT NULL) AS ftds
-- FROM v_campaigns c LEFT JOIN v_spend s ON s.campaign_id = c.id GROUP BY c.id, c.name, c.utm_campaign;

-- Example MIS query: daily new leads, calls and FTDs (Dubai time)
-- SELECT (created_at::timestamptz AT TIME ZONE 'Asia/Dubai')::date AS day, COUNT(*) AS leads,
--        COUNT(funded_at) AS ftds, SUM(deposit_amount::numeric) AS ftd_amount
-- FROM v_leads GROUP BY day ORDER BY day DESC;

-- Company-funded accounts (optional journey step)
DROP VIEW IF EXISTS v_bonuses;
CREATE VIEW v_bonuses AS
SELECT id, data->>'lead_id' AS lead_id, data->>'owner_id' AS owner_id, data->>'status' AS status,
  data->>'amount' AS amount, data->>'account_id' AS account_id, data->>'credited_at' AS credited_at,
  data->>'expires_at' AS expires_at, data->>'lots' AS lots, data->>'profit' AS profit, data->>'converted_at' AS converted_at
FROM bonuses;

-- Client area
DROP VIEW IF EXISTS v_clients;
CREATE VIEW v_clients AS
SELECT id, data->>'lead_id' AS lead_id, data->>'email' AS email, data->>'first_name' AS first_name, data->>'last_name' AS last_name,
  data->>'country' AS country, data#>>'{kyc,status}' AS kyc_status, data->>'status' AS status, data->>'created_at' AS created_at
FROM clients;
DROP VIEW IF EXISTS v_accounts;
CREATE VIEW v_accounts AS
SELECT id, data->>'client_id' AS client_id, data->>'kind' AS kind, data->>'type' AS type, data->>'login' AS login,
  data->>'status' AS status, data->>'balance' AS balance, data->>'balance_at' AS balance_at, data->>'opened_at' AS opened_at
FROM accounts;
DROP VIEW IF EXISTS v_payments;
CREATE VIEW v_payments AS
SELECT id, data->>'reference' AS reference, data->>'client_id' AS client_id, data->>'type' AS type, data->>'method' AS method,
  data->>'amount' AS amount, data->>'status' AS status, data->>'created_at' AS created_at, data->>'completed_at' AS completed_at, data->>'ext_reference' AS ext_reference
FROM payments;
