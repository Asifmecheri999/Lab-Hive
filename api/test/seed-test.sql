-- Test-only seed: two tenants + users, for auth + tenant-isolation tests. Idempotent.
-- passwordHash below is PBKDF2-SHA256 for "password123" (matches api/seed.sql).
-- acceptedPolicyVersion is set to the current POLICY_VERSION (api/src/routes/auth.ts) so
-- test users go straight to the app instead of the privacy-consent gate. If POLICY_VERSION
-- changes, update the value here too.
INSERT OR REPLACE INTO Tenant (id, name, plan, status, createdAt) VALUES
 ('tenantA', 'Tenant A (test)', 'ENTERPRISE', 'active', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('tenantB', 'Tenant B (test)', 'ENTERPRISE', 'active', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR REPLACE INTO User (id, tenantId, email, name, role, passwordHash, acceptedPolicyVersion, acceptedPolicyAt, createdAt, updatedAt) VALUES
 ('t_adminA',   'tenantA', 'admin.a@test.dev',   'Admin A',   'ADMIN',   'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('t_facultyA', 'tenantA', 'faculty.a@test.dev', 'Faculty A', 'FACULTY', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('t_studentA', 'tenantA', 'student.a@test.dev', 'Student A', 'STUDENT', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('t_adminB',   'tenantB', 'admin.b@test.dev',   'Admin B',   'ADMIN',   'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- An InventoryItem owned by tenant B, used by tenant-isolation regression tests: a tenant-A
-- caller must never be able to attach/leak/mutate this via a body-supplied itemId.
INSERT OR REPLACE INTO InventoryItem (id, tenantId, name, type, category, quantity, minQuantity, createdAt, updatedAt) VALUES
 ('itemB', 'tenantB', 'Tenant B Secret Widget', 'EQUIPMENT', 'Secret', 5, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- A tenant-B Activity, used to test that a tenant-A issuance can't link to (or write into) it.
INSERT OR REPLACE INTO Activity (id, tenantId, title) VALUES ('actB', 'tenantB', 'Tenant B Secret Project');
