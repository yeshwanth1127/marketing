# EXORA job contract

PostgreSQL `jobs` stores durable payloads. The worker claims due jobs inside a transaction using `FOR UPDATE SKIP LOCKED`. States: queued → running → completed / failed / blocked. External jobs recheck the approved target and asset version immediately before calling a connector. With connectors deferred, they transition to blocked and never claim a delivery.

Rendering writes new draft asset files; approved records are immutable. Worker startup recovers stale render jobs, while interrupted external jobs remain blocked for manual reconciliation. Never automatically retry an external action after an ambiguous network failure.
