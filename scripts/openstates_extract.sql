-- PlainRecord — extract Texas roll calls from the Open States Postgres dump
--
-- The dump is fully public: no account, and not behind Cloudflare (which is what
-- makes legiscan.com unautomatable).
--   https://data.openstates.org/postgres/monthly/YYYY-MM-public.pgdump   (~10 GB)
--   https://data.openstates.org/postgres/schema/YYYY-MM-schema.pgdump    (~0.7 MB)
--
-- Runs inside a disposable Postgres container, writing to /out:
--
--   docker run -d --name plainrecord-pg -e POSTGRES_PASSWORD=x \
--     -e POSTGRES_DB=openstates --shm-size=1g postgres:18 \
--     -c fsync=off -c synchronous_commit=off -c maintenance_work_mem=1GB
--   docker cp dump.pgdump plainrecord-pg:/tmp/
--   docker exec plainrecord-pg pg_restore -U postgres -d openstates \
--     --no-owner --no-privileges -j 4 <table flags> /tmp/dump.pgdump
--   docker exec plainrecord-pg mkdir -p /out
--   docker exec plainrecord-pg psql -U postgres -d openstates -v session=89 \
--     -f /tmp/openstates_extract.sql
--   docker cp plainrecord-pg:/out ./raw/tx_89
--
-- Then:
--   npx tsx scripts/ingest_openstates.ts ./raw/tx_89 89R \
--     --people ./raw/tx_89/tx_people.csv
--
-- Output paths are hardcoded under /out rather than built from psql variables:
-- \set does not concatenate interpolated variables the way you would hope, and
-- COPY TO needs a plain literal. The container is ours, so a fixed path is
-- simpler and cannot silently produce a file named with quote characters in it.
--
-- Pass the session BARE (-v session=89), not pre-quoted. This script uses
-- psql's :'session' form where a SQL string literal is needed.
--
-- Why this route at all, when the per-session CSV export exists? Because the
-- session CSV export contains NO PARTY DATA, and the only public roster carries
-- present-day party, which DATA_PIPELINE.md forbids relying on. The membership
-- table below has date ranges, so party can be resolved AS OF the session. That
-- is the whole argument for the 10 GB download.

\set ON_ERROR_STOP on
\timing on

\echo '=== Texas sessions present in this dump ==='
SELECT identifier, name, start_date, end_date
  FROM opencivicdata_legislativesession
 WHERE jurisdiction_id LIKE '%state:tx%'
 ORDER BY identifier;

-- Resolve the target session once. NULLIF guards the '' that this schema uses
-- for "unbounded" in its text date columns.
DROP VIEW IF EXISTS target_session;
CREATE TEMP VIEW target_session AS
SELECT s.id,
       s.identifier,
       COALESCE(NULLIF(s.start_date, ''), '0000-01-01') AS start_date,
       COALESCE(NULLIF(s.end_date,   ''), '9999-12-31') AS end_date
  FROM opencivicdata_legislativesession s
 WHERE s.jurisdiction_id LIKE '%state:tx%'
   AND s.identifier = :'session';

-- Fail loudly on a wrong identifier instead of exporting empty files.
-- (A DO $$ ... $$ block cannot be used for this: psql does not substitute :vars
-- inside dollar-quoted strings, so the session name would never reach the error.)
SELECT COUNT(*) = 0 AS session_missing FROM target_session
\gset
\if :session_missing
  \echo '!!!'
  \echo '!!! No Texas session with that identifier. Pick one from the list above.'
  \echo '!!!'
  \quit
\endif

\echo '=== target session ==='
SELECT * FROM target_session;

-- Upstream date sanity check. Open States session 87 (87th Legislature, 2021)
-- carries start_date 2019-01-08, which is wrong by two years. The party-roster
-- query below tests membership overlap against these dates, so a bad start_date
-- silently pulls in memberships that had already ended and produces a wrong
-- roster. Refuse rather than emit one.
--
-- The check is on span, not on absolute dates: a Texas regular session runs 140
-- days and a called session 30, so anything over 200 days means the row's dates
-- are wrong. Session 87 spans 2019-01-08..2021-05-27 (869 days) and is caught.
SELECT (end_date::date - start_date::date) > 200 AS session_span_implausible
  FROM target_session
\gset
\if :session_span_implausible
  \echo '!!!'
  \echo '!!! Session start/end dates span more than 200 days. A Texas regular'
  \echo '!!! session runs 140 days; a called session 30. This session row has'
  \echo '!!! bad upstream dates (Open States session 87 is known to carry'
  \echo '!!! start_date 2019-01-08 instead of 2021). The party roster below is'
  \echo '!!! derived from these dates and would be WRONG. Fix the dates first:'
  \echo '!!!   UPDATE opencivicdata_legislativesession'
  \echo '!!!      SET start_date = <correct> WHERE identifier = <id>;'
  \echo '!!!'
  \quit
\endif

-- ---------------------------------------------------------------------------
-- bills
-- ---------------------------------------------------------------------------
\echo '--- /out/tx_bills.csv ---'
COPY (
  SELECT b.id,
         b.identifier,
         b.title,
         b.classification::text,
         b.subject::text,
         ts.identifier    AS session_identifier,
         'Texas'          AS jurisdiction,
         o.classification AS organization_classification
    FROM opencivicdata_bill b
    JOIN target_session ts ON ts.id = b.legislative_session_id
    LEFT JOIN opencivicdata_organization o ON o.id = b.from_organization_id
) TO '/out/tx_bills.csv' WITH (FORMAT csv, HEADER true);

-- ---------------------------------------------------------------------------
-- vote events
-- ---------------------------------------------------------------------------
\echo '--- /out/tx_votes.csv ---'
COPY (
  SELECT v.id,
         v.identifier,
         v.motion_text,
         v.motion_classification::text,
         v.start_date,
         v.result,
         v.organization_id,
         v.bill_id,
         v.bill_action_id,
         'Texas'       AS jurisdiction,
         ts.identifier AS session_identifier
    FROM opencivicdata_voteevent v
    JOIN target_session ts ON ts.id = v.legislative_session_id
) TO '/out/tx_votes.csv' WITH (FORMAT csv, HEADER true);

-- ---------------------------------------------------------------------------
-- individual positions
-- ---------------------------------------------------------------------------
\echo '--- /out/tx_vote_people.csv ---'
COPY (
  SELECT pv.id,
         pv.vote_event_id,
         pv.option,
         pv.voter_name,
         pv.voter_id,
         pv.note
    FROM opencivicdata_personvote pv
    JOIN opencivicdata_voteevent v ON v.id = pv.vote_event_id
    JOIN target_session ts ON ts.id = v.legislative_session_id
) TO '/out/tx_vote_people.csv' WITH (FORMAT csv, HEADER true);

-- ---------------------------------------------------------------------------
-- tallies
-- ---------------------------------------------------------------------------
\echo '--- /out/tx_vote_counts.csv ---'
COPY (
  SELECT vc.id, vc.vote_event_id, vc.option, vc.value
    FROM opencivicdata_votecount vc
    JOIN opencivicdata_voteevent v ON v.id = vc.vote_event_id
    JOIN target_session ts ON ts.id = v.legislative_session_id
) TO '/out/tx_vote_counts.csv' WITH (FORMAT csv, HEADER true);

-- ---------------------------------------------------------------------------
-- sponsorships (for the author-against-own-bill review flag)
-- ---------------------------------------------------------------------------
-- `primary` is a reserved word and MUST be quoted. Unquoted it is a syntax error.
\echo '--- /out/tx_bill_sponsorships.csv ---'
COPY (
  SELECT bs.id, bs.bill_id, bs.name, bs.entity_type,
         bs.organization_id, bs.person_id, bs."primary", bs.classification
    FROM opencivicdata_billsponsorship bs
    JOIN opencivicdata_bill b ON b.id = bs.bill_id
    JOIN target_session ts ON ts.id = b.legislative_session_id
) TO '/out/tx_bill_sponsorships.csv' WITH (FORMAT csv, HEADER true);

-- ---------------------------------------------------------------------------
-- SESSION-SCOPED PARTY ROSTER — the reason this route exists
-- ---------------------------------------------------------------------------
-- Party comes from membership in an Organization of classification 'party' whose
-- date range overlaps the session. '' means unbounded in this schema. Where a
-- member has several overlapping party memberships (a mid-session switch), the
-- latest start wins, and every such collision is listed afterwards so it can be
-- reviewed by hand rather than silently resolved.
--
-- The column is deliberately named `party`, not `current_party`:
-- ingest_openstates.ts keys on that difference and hard-errors on a
-- `current_party` roster unless --allow-current-party is passed.
\echo '--- /out/tx_people.csv ---'
COPY (
  WITH ts AS (SELECT * FROM target_session),
  voted_in_session AS (
    SELECT DISTINCT pv.voter_id AS person_id
      FROM opencivicdata_personvote pv
      JOIN opencivicdata_voteevent v ON v.id = pv.vote_event_id
      JOIN ts ON ts.id = v.legislative_session_id
     WHERE pv.voter_id IS NOT NULL
  ),
  party_membership AS (
    SELECT m.person_id,
           o.name AS party,
           m.start_date,
           m.end_date,
           ROW_NUMBER() OVER (
             PARTITION BY m.person_id
             ORDER BY NULLIF(m.start_date, '') DESC NULLS LAST
           ) AS rn
      FROM opencivicdata_membership m
      JOIN opencivicdata_organization o ON o.id = m.organization_id
      JOIN voted_in_session vs ON vs.person_id = m.person_id
      CROSS JOIN ts
     WHERE o.classification = 'party'
       AND (NULLIF(m.start_date, '') IS NULL OR m.start_date <= ts.end_date)
       AND (NULLIF(m.end_date,   '') IS NULL OR m.end_date   >= ts.start_date)
  )
  SELECT p.id,
         p.name,
         pm.party,
         pm.start_date AS party_start_date,
         pm.end_date   AS party_end_date
    FROM opencivicdata_person p
    JOIN party_membership pm ON pm.person_id = p.id AND pm.rn = 1
) TO '/out/tx_people.csv' WITH (FORMAT csv, HEADER true);

\echo ''
\echo '=== members with MORE THAN ONE overlapping party membership ==='
\echo '=== (mid-session switches — review before publishing) ==='
WITH ts AS (SELECT * FROM target_session)
SELECT p.name,
       COUNT(*) AS overlapping,
       string_agg(o.name || ' [' || COALESCE(NULLIF(m.start_date, ''), '?') || '..'
                  || COALESCE(NULLIF(m.end_date, ''), 'now') || ']', ', ') AS memberships
  FROM opencivicdata_membership m
  JOIN opencivicdata_organization o ON o.id = m.organization_id
  JOIN opencivicdata_person p ON p.id = m.person_id
  CROSS JOIN ts
 WHERE o.classification = 'party'
   AND (NULLIF(m.start_date, '') IS NULL OR m.start_date <= ts.end_date)
   AND (NULLIF(m.end_date,   '') IS NULL OR m.end_date   >= ts.start_date)
   AND EXISTS (
     SELECT 1 FROM opencivicdata_personvote pv
       JOIN opencivicdata_voteevent v ON v.id = pv.vote_event_id
       JOIN ts ts2 ON ts2.id = v.legislative_session_id
      WHERE pv.voter_id = p.id
   )
 GROUP BY p.id, p.name
HAVING COUNT(*) > 1
 ORDER BY p.name;

\echo ''
\echo '=== summary ==='
SELECT (SELECT COUNT(*) FROM opencivicdata_bill b
          JOIN target_session ts ON ts.id = b.legislative_session_id)   AS bills,
       (SELECT COUNT(*) FROM opencivicdata_voteevent v
          JOIN target_session ts ON ts.id = v.legislative_session_id)   AS vote_events,
       (SELECT COUNT(*) FROM opencivicdata_personvote pv
          JOIN opencivicdata_voteevent v ON v.id = pv.vote_event_id
          JOIN target_session ts ON ts.id = v.legislative_session_id)   AS person_votes,
       (SELECT COUNT(*) FROM opencivicdata_personvote pv
          JOIN opencivicdata_voteevent v ON v.id = pv.vote_event_id
          JOIN target_session ts ON ts.id = v.legislative_session_id
         WHERE pv.voter_id IS NULL)                                     AS unresolved_voters;
