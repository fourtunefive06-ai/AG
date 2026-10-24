-- Absel CRM database (SQLite)
-- Tables are created automatically by lib/store-sqlite.js: one table per collection,
-- each row = (id, data JSON, updated_at). Collections:
--   settings, users, rules (territories), templates, automations, leads, activities,
--   tasks, messages, jobs (automation runs), notifications, logins (sign-in and security log),
--   deposits (first deposits + verification), files (deposit proofs), dnc (do-not-contact list),
--   reviews (call quality scorecards), attendance (online time and breaks per person per day),
--   callevents (phone system events and recordings), campaigns, spend (ad spend per day), broadcasts, bonuses (company-funded accounts)
--
-- The views below flatten the JSON into columns so you can query the data directly
-- or connect a BI tool (Metabase, Power BI, Looker Studio via a connector) for MIS.

DROP VIEW IF EXISTS v_users;
CREATE VIEW v_users AS
SELECT id,
  json_extract(data,'$.name') AS name, json_extract(data,'$.username') AS username,
  json_extract(data,'$.role') AS role, json_extract(data,'$.team') AS team,
  json_extract(data,'$.active') AS active, json_extract(data,'$.accepts_leads') AS accepts_leads,
  json_extract(data,'$.target_ftd') AS target_ftd
FROM users;

DROP VIEW IF EXISTS v_leads;
CREATE VIEW v_leads AS
SELECT l.id,
  json_extract(l.data,'$.reference') AS reference,
  json_extract(l.data,'$.created_at') AS created_at,
  json_extract(l.data,'$.stage') AS stage,
  json_extract(l.data,'$.temperature') AS temperature,
  json_extract(l.data,'$.score') AS score,
  json_extract(l.data,'$.owner_id') AS owner_id,
  json_extract(u.data,'$.name') AS owner_name,
  json_extract(l.data,'$.first_name') AS first_name, json_extract(l.data,'$.last_name') AS last_name,
  json_extract(l.data,'$.email') AS email, json_extract(l.data,'$.dial_code') AS dial_code, json_extract(l.data,'$.phone') AS phone,
  json_extract(l.data,'$.country') AS country, json_extract(l.data,'$.city') AS city, json_extract(l.data,'$.area') AS area,
  json_extract(l.data,'$.interest') AS interest,
  json_extract(l.data,'$.utm_source') AS utm_source, json_extract(l.data,'$.utm_medium') AS utm_medium, json_extract(l.data,'$.utm_campaign') AS utm_campaign,
  json_extract(l.data,'$.ref_code') AS ref_code,
  json_extract(l.data,'$.attempts') AS attempts, json_extract(l.data,'$.connected_calls') AS connected_calls,
  json_extract(l.data,'$.first_contact_at') AS first_contact_at, json_extract(l.data,'$.first_connected_at') AS first_connected_at,
  json_extract(l.data,'$.reached.qualified') AS qualified_at, json_extract(l.data,'$.reached.registered') AS registered_at,
  json_extract(l.data,'$.reached.kyc') AS kyc_at, json_extract(l.data,'$.funded_at') AS funded_at,
  json_extract(l.data,'$.deposit_amount') AS deposit_amount, json_extract(l.data,'$.account_id') AS account_id,
  json_extract(l.data,'$.lost_reason') AS lost_reason,
  json_extract(l.data,'$.profile.capital') AS capital, json_extract(l.data,'$.profile.expected_deposit') AS expected_deposit,
  json_extract(l.data,'$.profile.timeline') AS timeline
FROM leads l LEFT JOIN users u ON u.id = json_extract(l.data,'$.owner_id');

DROP VIEW IF EXISTS v_calls;
CREATE VIEW v_calls AS
SELECT a.id,
  json_extract(a.data,'$.created_at') AS called_at,
  json_extract(a.data,'$.lead_id') AS lead_id,
  json_extract(a.data,'$.user_id') AS agent_id, json_extract(u.data,'$.name') AS agent_name,
  json_extract(a.data,'$.data.outcome') AS outcome,
  json_extract(a.data,'$.data.connected') AS connected,
  json_extract(a.data,'$.data.duration_sec') AS duration_sec,
  json_extract(a.data,'$.data.notes') AS notes,
  json_extract(a.data,'$.data.qa.questions') AS client_questions,
  json_extract(a.data,'$.data.qa.objections') AS objections
FROM activities a LEFT JOIN users u ON u.id = json_extract(a.data,'$.user_id')
WHERE json_extract(a.data,'$.type') = 'call';

DROP VIEW IF EXISTS v_tasks;
CREATE VIEW v_tasks AS
SELECT id,
  json_extract(data,'$.lead_id') AS lead_id, json_extract(data,'$.owner_id') AS owner_id,
  json_extract(data,'$.type') AS type, json_extract(data,'$.title') AS title,
  json_extract(data,'$.due_at') AS due_at, json_extract(data,'$.done_at') AS done_at,
  json_extract(data,'$.outcome') AS outcome, json_extract(data,'$.auto') AS auto
FROM tasks;

DROP VIEW IF EXISTS v_messages;
CREATE VIEW v_messages AS
SELECT id,
  json_extract(data,'$.created_at') AS created_at, json_extract(data,'$.lead_id') AS lead_id,
  json_extract(data,'$.channel') AS channel, json_extract(data,'$.direction') AS direction,
  json_extract(data,'$.status') AS status, json_extract(data,'$.rule_id') AS rule_id,
  json_extract(data,'$.subject') AS subject, json_extract(data,'$.error') AS error
FROM messages;

DROP VIEW IF EXISTS v_logins;
CREATE VIEW v_logins AS
SELECT id,
  json_extract(data,'$.created_at') AS created_at, json_extract(data,'$.event') AS event,
  json_extract(data,'$.username') AS username, json_extract(data,'$.user_id') AS user_id,
  json_extract(data,'$.ip') AS ip, json_extract(data,'$.ua') AS device
FROM logins;

DROP VIEW IF EXISTS v_deposits;
CREATE VIEW v_deposits AS
SELECT d.id,
  json_extract(d.data,'$.lead_id') AS lead_id, json_extract(d.data,'$.owner_id') AS agent_id, json_extract(u.data,'$.name') AS agent_name,
  json_extract(d.data,'$.amount') AS amount, json_extract(d.data,'$.currency') AS currency, json_extract(d.data,'$.method') AS method,
  json_extract(d.data,'$.tx_ref') AS tx_ref, json_extract(d.data,'$.account_id') AS account_id,
  json_extract(d.data,'$.deposited_at') AS deposited_at, json_extract(d.data,'$.status') AS status,
  json_extract(d.data,'$.verified_at') AS verified_at, json_extract(d.data,'$.reject_reason') AS reject_reason,
  json_extract(d.data,'$.created_at') AS submitted_at
FROM deposits d LEFT JOIN users u ON u.id = json_extract(d.data,'$.owner_id');

DROP VIEW IF EXISTS v_campaigns;
CREATE VIEW v_campaigns AS
SELECT id, json_extract(data,'$.name') AS name, json_extract(data,'$.channel') AS channel,
  json_extract(data,'$.utm_source') AS utm_source, json_extract(data,'$.utm_campaign') AS utm_campaign,
  json_extract(data,'$.budget') AS budget, json_extract(data,'$.status') AS status,
  json_extract(data,'$.start_date') AS start_date, json_extract(data,'$.end_date') AS end_date
FROM campaigns;

DROP VIEW IF EXISTS v_spend;
CREATE VIEW v_spend AS
SELECT s.id, json_extract(s.data,'$.date') AS date, json_extract(s.data,'$.amount') AS amount,
  json_extract(s.data,'$.campaign_id') AS campaign_id, json_extract(c.data,'$.name') AS campaign,
  json_extract(c.data,'$.utm_source') AS utm_source, json_extract(c.data,'$.utm_campaign') AS utm_campaign
FROM spend s LEFT JOIN campaigns c ON c.id = json_extract(s.data,'$.campaign_id');

DROP VIEW IF EXISTS v_reviews;
CREATE VIEW v_reviews AS
SELECT r.id, json_extract(r.data,'$.created_at') AS reviewed_at, json_extract(r.data,'$.agent_id') AS agent_id, json_extract(u.data,'$.name') AS agent_name,
  json_extract(r.data,'$.total') AS score_pct, json_extract(r.data,'$.compliance_ok') AS compliance_ok,
  json_extract(r.data,'$.activity_id') AS call_id, json_extract(r.data,'$.improve') AS to_improve
FROM reviews r LEFT JOIN users u ON u.id = json_extract(r.data,'$.agent_id');

DROP VIEW IF EXISTS v_attendance;
CREATE VIEW v_attendance AS
SELECT a.id, json_extract(a.data,'$.day') AS day, json_extract(a.data,'$.user_id') AS user_id, json_extract(u.data,'$.name') AS name,
  json_extract(a.data,'$.first_at') AS first_seen, json_extract(a.data,'$.last_at') AS last_seen,
  json_extract(a.data,'$.online_min') AS online_minutes, json_array_length(json_extract(a.data,'$.breaks')) AS breaks
FROM attendance a LEFT JOIN users u ON u.id = json_extract(a.data,'$.user_id');

DROP VIEW IF EXISTS v_broadcasts;
CREATE VIEW v_broadcasts AS
SELECT id, json_extract(data,'$.name') AS name, json_extract(data,'$.channel') AS channel, json_extract(data,'$.status') AS status,
  json_extract(data,'$.total') AS audience, json_extract(data,'$.sent_count') AS sent,
  json_extract(data,'$.started_at') AS started_at, json_extract(data,'$.done_at') AS done_at
FROM broadcasts;

DROP VIEW IF EXISTS v_dnc;
CREATE VIEW v_dnc AS
SELECT id, json_extract(data,'$.phone') AS phone, json_extract(data,'$.email') AS email, json_extract(data,'$.reason') AS reason, json_extract(data,'$.created_at') AS created_at
FROM dnc;

-- Example: cost per FTD by campaign
-- SELECT c.name, SUM(s.amount) AS spend, (SELECT COUNT(*) FROM v_leads l WHERE l.utm_campaign = c.utm_campaign AND l.funded_at IS NOT NULL) AS ftds
-- FROM v_campaigns c LEFT JOIN v_spend s ON s.campaign_id = c.id GROUP BY c.id;

-- Example MIS query: daily new leads, calls and FTDs (Dubai time)
-- SELECT date(created_at, '+4 hours') AS day, COUNT(*) AS leads,
--        SUM(funded_at IS NOT NULL) AS ftds, SUM(deposit_amount) AS ftd_amount
-- FROM v_leads GROUP BY day ORDER BY day DESC;

-- Company-funded accounts (optional journey step)
DROP VIEW IF EXISTS v_bonuses;
CREATE VIEW v_bonuses AS
SELECT id, json_extract(data,'$.lead_id') AS lead_id, json_extract(data,'$.owner_id') AS owner_id, json_extract(data,'$.status') AS status,
  json_extract(data,'$.amount') AS amount, json_extract(data,'$.account_id') AS account_id, json_extract(data,'$.credited_at') AS credited_at,
  json_extract(data,'$.expires_at') AS expires_at, json_extract(data,'$.lots') AS lots, json_extract(data,'$.profit') AS profit, json_extract(data,'$.converted_at') AS converted_at
FROM bonuses;

-- Client area
DROP VIEW IF EXISTS v_clients;
CREATE VIEW v_clients AS
SELECT id, json_extract(data,'$.lead_id') AS lead_id, json_extract(data,'$.email') AS email, json_extract(data,'$.first_name') AS first_name, json_extract(data,'$.last_name') AS last_name,
  json_extract(data,'$.country') AS country, json_extract(data,'$.kyc.status') AS kyc_status, json_extract(data,'$.status') AS status, json_extract(data,'$.created_at') AS created_at
FROM clients;
DROP VIEW IF EXISTS v_accounts;
CREATE VIEW v_accounts AS
SELECT id, json_extract(data,'$.client_id') AS client_id, json_extract(data,'$.kind') AS kind, json_extract(data,'$.type') AS type, json_extract(data,'$.login') AS login,
  json_extract(data,'$.status') AS status, json_extract(data,'$.balance') AS balance, json_extract(data,'$.balance_at') AS balance_at, json_extract(data,'$.opened_at') AS opened_at
FROM accounts;
DROP VIEW IF EXISTS v_payments;
CREATE VIEW v_payments AS
SELECT id, json_extract(data,'$.reference') AS reference, json_extract(data,'$.client_id') AS client_id, json_extract(data,'$.type') AS type, json_extract(data,'$.method') AS method,
  json_extract(data,'$.amount') AS amount, json_extract(data,'$.status') AS status, json_extract(data,'$.created_at') AS created_at, json_extract(data,'$.completed_at') AS completed_at, json_extract(data,'$.ext_reference') AS ext_reference
FROM payments;
