-- 0006 · Client outbox sequence on sync_ops (F12 re-review N1, NFR-OFF-006). Earlier migrations are never edited.
-- The server ignores a device's own earlier edits when it checks an UPDATE for conflicts (review H3). With the
-- client's `seq` stored, an own change counts as a server change when it came from a LATER outbox position than
-- the incoming operation, so an older edit that arrives after a newer one (retries, backoff) becomes an explicit
-- conflict instead of silently overwriting it. `seq` is per device workspace (account + organization); it is
-- compared only between operations of the same user and device.
-- Nullable: rows stored before this migration have no seq, and those own changes are then counted as server
-- changes (a conflict rather than a possible silent overwrite). No uniqueness: a retried operation keeps its
-- original seq under a new op_id. The table-level SELECT, INSERT grants of 0004 cover the new column.
ALTER TABLE sync_ops ADD COLUMN seq bigint CHECK (seq >= 0);
