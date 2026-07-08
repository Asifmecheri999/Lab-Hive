-- ─────────────────────────────────────────────────────────────────────────────
-- Lab Hive / LabSynch — DEMO SEED  (realistic demo university, "never looks empty")
--
-- Idempotent: every row uses a fixed `d_*` id via INSERT OR REPLACE, so you can
-- re-run this safely — it upserts, it does not duplicate.
--
-- Everything is scoped to ONE demo tenant (d_tenant) so it stays isolated from any
-- real customer workspace. NEVER run against production.
--
-- RUN IT ─────────────────────────────────────────────────────────────────────
--   Local (miniflare dev D1):
--     npx wrangler d1 execute labhive --local --file=./seed-demo.sql
--       (from repo root:  npm run db:seed:demo:local)
--
--   Staging D1 (remote — requires the staging DB to exist, see DEPLOYMENT.md §1):
--     npx wrangler d1 execute labhive-staging --remote --env staging --file=./seed-demo.sql
--       (from repo root:  npm run db:seed:demo:staging)
--
--   ⛔ Do NOT add --remote against the top-level `labhive` binding — that is PRODUCTION.
--
-- LOGINS (all password: password123)
--   manager@meridian.edu       Lab Manager   (approver)
--   omar.haddad@meridian.edu   Faculty
--   priya.nair@meridian.edu    Faculty
--   sara.alamiri@meridian.edu  Student
--   liam.chen@meridian.edu     Student
--   yusuf.khan@meridian.edu    Student
-- ─────────────────────────────────────────────────────────────────────────────

-- ── CLEAN SLATE (idempotency) ───────────────────────────────────────────────
-- Delete any previous demo data in child→parent order BEFORE re-inserting. This is
-- required because D1 enforces foreign keys: INSERT OR REPLACE on a parent deletes the
-- old row first, which would trip ON DELETE RESTRICT (MaintenanceLog→InventoryItem,
-- LabSession→Lab, ServiceRequest→User). Everything here is scoped to the demo tenant,
-- so it never touches another workspace's data. On a first run these match nothing.
DELETE FROM ProcurementItem     WHERE procurementId IN (SELECT id FROM ProcurementRequest WHERE tenantId = 'd_tenant');
DELETE FROM MaintenanceLog      WHERE tenantId = 'd_tenant';
DELETE FROM MaintenanceSchedule WHERE tenantId = 'd_tenant';
DELETE FROM ServiceRequest      WHERE tenantId = 'd_tenant';
DELETE FROM LabSession          WHERE tenantId = 'd_tenant';
DELETE FROM ProcurementRequest  WHERE tenantId = 'd_tenant';
DELETE FROM InventoryItem       WHERE tenantId = 'd_tenant';
DELETE FROM SafetyDocument      WHERE tenantId = 'd_tenant';
DELETE FROM Document            WHERE tenantId = 'd_tenant';
DELETE FROM Vendor              WHERE tenantId = 'd_tenant';
DELETE FROM Faculty             WHERE tenantId = 'd_tenant';
DELETE FROM Lab                 WHERE tenantId = 'd_tenant';
DELETE FROM Department          WHERE tenantId = 'd_tenant';
DELETE FROM School              WHERE tenantId = 'd_tenant';
DELETE FROM Campus              WHERE tenantId = 'd_tenant';
DELETE FROM User                WHERE tenantId = 'd_tenant';
DELETE FROM Tenant              WHERE id = 'd_tenant';

-- ── TENANT ──────────────────────────────────────────────────────────────────
-- ENTERPRISE + active so nothing is capped and the trial-gate never fires for the demo.
INSERT OR REPLACE INTO Tenant (id, name, plan, department, status, trialEndsAt, ownerEmail, notes, fiscalYearStartMonth, createdAt) VALUES
 ('d_tenant', 'Meridian University', 'ENTERPRISE', 'School of Engineering & Physical Sciences', 'active',
  strftime('%Y-%m-%dT%H:%M:%fZ','now','+365 days'), 'manager@meridian.edu',
  'Demo workspace — realistic sample data for pilot walkthroughs. Safe to reset with seed-demo.sql.', 9,
  strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── ORG HIERARCHY: Campus → School → Department ─────────────────────────────
INSERT OR REPLACE INTO Campus (id, tenantId, name, location, createdAt) VALUES
 ('d_campus', 'd_tenant', 'Main Campus', 'City Innovation District', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR REPLACE INTO School (id, tenantId, campusId, name, createdAt) VALUES
 ('d_school', 'd_tenant', 'd_campus', 'School of Engineering & Physical Sciences', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR REPLACE INTO Department (id, tenantId, schoolId, name, code, createdAt) VALUES
 ('d_dept', 'd_tenant', 'd_school', 'Mechanical & Design Engineering', 'MDE', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── USERS (1 lab manager, 2 faculty, 3 students) ────────────────────────────
-- passwordHash is PBKDF2-SHA256 for "password123". acceptedPolicyVersion matches
-- POLICY_VERSION in api/src/routes/auth.ts so demo users skip the consent screen.
INSERT OR REPLACE INTO User (id, tenantId, email, name, role, school, department, studentId, passwordHash, isApprover, acceptedPolicyVersion, acceptedPolicyAt, createdAt, updatedAt) VALUES
 ('d_mgr',   'd_tenant', 'manager@meridian.edu',      'Mona Farouk',    'LAB_MANAGER', 'School of Engineering & Physical Sciences', 'Mechanical & Design Engineering', NULL,      'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', 1, '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_fac1',  'd_tenant', 'omar.haddad@meridian.edu',  'Dr. Omar Haddad','FACULTY',     'School of Engineering & Physical Sciences', 'Mechanical & Design Engineering', NULL,      'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', 0, '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_fac2',  'd_tenant', 'priya.nair@meridian.edu',   'Dr. Priya Nair', 'FACULTY',      'School of Engineering & Physical Sciences', 'Mechanical & Design Engineering', NULL,      'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', 0, '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_stu1',  'd_tenant', 'sara.alamiri@meridian.edu', 'Sara Al-Amiri',  'STUDENT',      'School of Engineering & Physical Sciences', 'Mechanical & Design Engineering', 'H00234511', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', 0, '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_stu2',  'd_tenant', 'liam.chen@meridian.edu',    'Liam Chen',      'STUDENT',      'School of Engineering & Physical Sciences', 'Mechanical & Design Engineering', 'H00234512', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', 0, '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_stu3',  'd_tenant', 'yusuf.khan@meridian.edu',   'Yusuf Khan',     'STUDENT',      'School of Engineering & Physical Sciences', 'Mechanical & Design Engineering', 'H00234513', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', 0, '2026-07-02', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── FACULTY REGISTER (so course-leader pickers have a managed list) ─────────
INSERT OR REPLACE INTO Faculty (id, tenantId, name, email, department, createdAt) VALUES
 ('d_facr1', 'd_tenant', 'Dr. Omar Haddad', 'omar.haddad@meridian.edu', 'Mechanical & Design Engineering', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_facr2', 'd_tenant', 'Dr. Priya Nair',  'priya.nair@meridian.edu',  'Mechanical & Design Engineering', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── LABS (2) ────────────────────────────────────────────────────────────────
-- NOTE: the Lab table has no createdAt column (migration drift vs schema.prisma) — do not add one.
INSERT OR REPLACE INTO Lab (id, tenantId, departmentId, name, building, floor, roomNo, capacity, description, isActive, color) VALUES
 ('d_lab_fab',      'd_tenant', 'd_dept', 'Fabrication Lab', 'Engineering Building', '2', 'EB-214', 28, 'Digital fabrication makerspace — 3D printers, laser cutter, CNC router, and hand tools.', 1, '#00C9A7'),
 ('d_lab_robotics', 'd_tenant', 'd_dept', 'Robotics Lab',    'Engineering Building', '3', 'EB-311', 24, 'Robotics & embedded systems lab — test benches, power supplies, robotic arms, and mobile robots.', 1, '#F5A623');

-- ── EQUIPMENT (15 assets, with real statuses via notes + maintenance flags) ──
INSERT OR REPLACE INTO InventoryItem (id, tenantId, name, type, category, quantity, minQuantity, unit, labId, location, serialNumber, ownership, maintenanceRequired, maintenanceType, maintenanceFrequency, nextMaintenanceDue, patRequired, financeMode, notes, createdAt, updatedAt) VALUES
 ('d_eq_01', 'd_tenant', 'Prusa MK4 3D Printer',                'EQUIPMENT', '3D Printing',        4,  1, 'pcs', 'd_lab_fab',      'Bench A1', 'PRU-MK4-2231', 'Mechanical & Design Engineering', 1, 'INHOUSE',  'QUARTERLY', strftime('%Y-%m-%dT%H:%M:%fZ','now','+45 days'),  1, 'CAPEX', 'Operational — all 4 units in service.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_02', 'd_tenant', 'Formlabs Form 3 SLA Printer',         'EQUIPMENT', 'Resin Printing',     1,  1, 'pcs', 'd_lab_fab',      'Bench A2', 'FL-F3-0088',   'Mechanical & Design Engineering', 1, 'INHOUSE',  'BIANNUAL',  strftime('%Y-%m-%dT%H:%M:%fZ','now','+90 days'),  1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_03', 'd_tenant', 'Ultimaker S5 3D Printer',             'EQUIPMENT', '3D Printing',        2,  1, 'pcs', 'd_lab_fab',      'Bench A3', 'UM-S5-0453',   'Mechanical & Design Engineering', 1, 'INHOUSE',  'QUARTERLY', strftime('%Y-%m-%dT%H:%M:%fZ','now','+20 days'),  1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_04', 'd_tenant', 'Epilog Fusion Pro 48 Laser Cutter',   'EQUIPMENT', 'Laser Cutting',      1,  1, 'pcs', 'd_lab_fab',      'Bay B1',   'EP-FP48-0121', 'Mechanical & Design Engineering', 1, 'OUTSOURCE','ANNUAL',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+18 days'),  1, 'CAPEX', 'Operational — annual service due soon.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_05', 'd_tenant', 'Tormach 24R CNC Router',              'EQUIPMENT', 'CNC Machining',      1,  1, 'pcs', 'd_lab_fab',      'Bay B2',   'TM-24R-0009',  'Mechanical & Design Engineering', 1, 'OUTSOURCE','QUARTERLY', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days'),   1, 'CAPEX', 'MAINTENANCE OVERDUE — lubrication & spindle service.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_06', 'd_tenant', 'Bench Drill Press',                   'EQUIPMENT', 'Machining',          2,  1, 'pcs', 'd_lab_fab',      'Bench C1', NULL,           'Mechanical & Design Engineering', 1, 'INHOUSE',  'ANNUAL',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+120 days'), 1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_07', 'd_tenant', 'Metal/Wood Bandsaw',                  'EQUIPMENT', 'Machining',          1,  1, 'pcs', 'd_lab_fab',      'Bench C2', NULL,           'Mechanical & Design Engineering', 1, 'INHOUSE',  'ANNUAL',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+100 days'), 1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_08', 'd_tenant', 'Roland CAMM-1 Vinyl Cutter',          'EQUIPMENT', 'Fabrication',        1,  1, 'pcs', 'd_lab_fab',      'Bench A4', 'RO-VC-0302',   'Mechanical & Design Engineering', 0, NULL,       NULL,        NULL,                                             1, 'CAPEX', 'Out of service — awaiting blade-carriage replacement part.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_09', 'd_tenant', 'Rigol DS1054Z Oscilloscope',          'EQUIPMENT', 'Test & Measurement', 6,  2, 'pcs', 'd_lab_robotics', 'Bench R1', NULL,           'Mechanical & Design Engineering', 1, 'INHOUSE',  'ANNUAL',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+60 days'),  1, 'CAPEX', 'Operational — 6 test benches.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_10', 'd_tenant', 'Weller WE1010 Soldering Station',     'EQUIPMENT', 'Soldering',          8,  3, 'pcs', 'd_lab_robotics', 'Bench R2', NULL,           'Mechanical & Design Engineering', 0, NULL,       NULL,        NULL,                                             1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_11', 'd_tenant', 'Rigol DP832 Bench Power Supply',      'EQUIPMENT', 'Test & Measurement', 4,  2, 'pcs', 'd_lab_robotics', 'Bench R3', NULL,           'Mechanical & Design Engineering', 1, 'INHOUSE',  'ANNUAL',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'),  1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_12', 'd_tenant', 'Rigol DG1032Z Function Generator',    'EQUIPMENT', 'Test & Measurement', 3,  1, 'pcs', 'd_lab_robotics', 'Bench R3', NULL,           'Mechanical & Design Engineering', 0, NULL,       NULL,        NULL,                                             1, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_13', 'd_tenant', 'Universal Robots UR5e Robotic Arm',   'EQUIPMENT', 'Robotics',           1,  1, 'pcs', 'd_lab_robotics', 'Cell R5',  'UR-5E-0017',   'Mechanical & Design Engineering', 1, 'OUTSOURCE','BIANNUAL',  strftime('%Y-%m-%dT%H:%M:%fZ','now','+30 days'),  1, 'CAPEX', 'Operational — safety inspection in progress.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_14', 'd_tenant', 'TurtleBot3 Burger Mobile Robot',      'EQUIPMENT', 'Robotics',           5,  2, 'pcs', 'd_lab_robotics', 'Cabinet R6', NULL,         'Mechanical & Design Engineering', 0, NULL,       NULL,        NULL,                                             0, 'CAPEX', 'Operational — 5 units for teaching.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_eq_15', 'd_tenant', 'Fluke 87V Digital Multimeter',        'EQUIPMENT', 'Test & Measurement', 10, 4, 'pcs', 'd_lab_robotics', 'Cabinet R4', NULL,         'Mechanical & Design Engineering', 1, 'INHOUSE',  'ANNUAL',    strftime('%Y-%m-%dT%H:%M:%fZ','now','+200 days'), 0, 'CAPEX', 'Operational.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── CONSUMABLES / PPE (stock levels; 5 are below their low-stock threshold) ──
INSERT OR REPLACE INTO InventoryItem (id, tenantId, name, type, category, quantity, minQuantity, unit, labId, location, financeMode, notes, createdAt, updatedAt) VALUES
 ('d_inv_01', 'd_tenant', 'PLA Filament 1kg — Grey',           'CONSUMABLE', 'Filament',        4,  10, 'spool', 'd_lab_fab',      'Shelf F2',   'OPEX', 'Low stock — reorder.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_02', 'd_tenant', 'PLA Filament 1kg — Black',          'CONSUMABLE', 'Filament',        16, 8,  'spool', 'd_lab_fab',      'Shelf F2',   'OPEX', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_03', 'd_tenant', 'PETG Filament 1kg — Clear',         'CONSUMABLE', 'Filament',        11, 6,  'spool', 'd_lab_fab',      'Shelf F2',   'OPEX', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_04', 'd_tenant', 'Formlabs Grey Resin 1L',            'CONSUMABLE', 'Resin',           2,  4,  'bottle','d_lab_fab',      'Cabinet F3', 'OPEX', 'Low stock — reorder.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_05', 'd_tenant', 'Acrylic Sheet 3mm (600x400)',       'CONSUMABLE', 'Sheet Material',  35, 15, 'sheet', 'd_lab_fab',      'Rack F4',    'OPEX', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_06', 'd_tenant', 'Plywood Sheet 3mm (600x400)',       'CONSUMABLE', 'Sheet Material',  9,  10, 'sheet', 'd_lab_fab',      'Rack F4',    'OPEX', 'Low stock — reorder.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_07', 'd_tenant', 'Solder Wire 0.8mm (250g)',          'CONSUMABLE', 'Soldering',       20, 6,  'roll',  'd_lab_robotics', 'Drawer R1',  'OPEX', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_08', 'd_tenant', 'Jumper Wire Assortment (pack)',     'CONSUMABLE', 'Electronics',     28, 10, 'pack',  'd_lab_robotics', 'Drawer R2',  'OPEX', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_09', 'd_tenant', 'Arduino Uno R3',                    'CONSUMABLE', 'Microcontrollers',14, 20, 'pcs',   'd_lab_robotics', 'Cabinet R7', 'OPEX', 'Low stock — high demand this term.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_10', 'd_tenant', 'Breadboard (830-point)',            'CONSUMABLE', 'Electronics',     22, 8,  'pcs',   'd_lab_robotics', 'Cabinet R7', 'OPEX', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_11', 'd_tenant', 'Safety Goggles',                    'PPE',        'Eye Protection',  30, 12, 'pcs',   'd_lab_fab',      'PPE Cabinet', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_12', 'd_tenant', 'Nitrile Gloves (box of 100)',       'PPE',        'Hand Protection', 5,  10, 'box',   'd_lab_fab',      'PPE Cabinet', NULL, 'Low stock — reorder.', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_inv_13', 'd_tenant', 'Lab Coats',                         'PPE',        'Body Protection', 18, 8,  'pcs',   'd_lab_fab',      'PPE Cabinet', NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── LAB SESSIONS (weekly bookings, spread Mon–Fri of the current week) ───────
-- dayOfWeek: 0=Mon … 4=Fri. Recurring within an active semester window bracketing "now".
INSERT OR REPLACE INTO LabSession (id, tenantId, labId, moduleCode, title, facultyName, "group", dayOfWeek, startTime, endTime, isRecurring, semesterStart, semesterEnd, scheduledById, createdAt) VALUES
 ('d_ses_1', 'd_tenant', 'd_lab_fab',      'MDE201', 'Design & Manufacture Lab', 'Dr. Omar Haddad', 'Group A', 0, '09:00', '11:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'), 'd_fac1', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ses_2', 'd_tenant', 'd_lab_robotics', 'MDE310', 'Embedded Systems Lab',     'Dr. Priya Nair',  'Group A', 0, '14:00', '16:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'), 'd_fac2', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ses_3', 'd_tenant', 'd_lab_fab',      'MDE201', '3D Printing Workshop',     'Dr. Omar Haddad', 'Group B', 1, '10:00', '12:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'), 'd_fac1', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ses_4', 'd_tenant', 'd_lab_robotics', 'MDE330', 'Robotics & Control',       'Dr. Priya Nair',  'Group A', 2, '13:00', '15:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'), 'd_fac2', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ses_5', 'd_tenant', 'd_lab_fab',      'MDE215', 'CNC Machining Practical',  'Dr. Omar Haddad', 'Group A', 3, '09:00', '11:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'), 'd_fac1', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ses_6', 'd_tenant', 'd_lab_robotics', 'MDE320', 'Instrumentation Lab',      'Dr. Priya Nair',  'Group B', 4, '11:00', '13:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','-30 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+75 days'), 'd_fac2', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── VENDORS ─────────────────────────────────────────────────────────────────
INSERT OR REPLACE INTO Vendor (id, tenantId, name, contactName, email, phone, category, country, isApproved, createdAt) VALUES
 ('d_ven_1', 'd_tenant', 'Gulf Scientific & Laboratory Supplies', 'Ahmed Khalid', 'sales@gulfscientific.example', '+971-4-555-0111', 'lab supplies', 'United Arab Emirates', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ven_2', 'd_tenant', 'Prusa Research',                        'Support Team',  'sales@prusa3d.example',        NULL,               'equipment',    'Czechia',              1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_ven_3', 'd_tenant', 'Emirates Robotics & Automation',        'Layla Mansour', 'info@emiratesrobotics.example','+971-2-555-0199',  'equipment',    'United Arab Emirates', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- ── MAINTENANCE — schedules (one overdue, one due soon) + completed logs ────
INSERT OR REPLACE INTO MaintenanceSchedule (id, tenantId, itemId, title, frequencyDays, lastDone, nextDue, assignedTo, notes, createdAt) VALUES
 ('d_msch_1', 'd_tenant', 'd_eq_04', 'Laser cutter — annual service & optics clean', 365, strftime('%Y-%m-%dT%H:%M:%fZ','now','-347 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','+18 days'), 'Mona Farouk', 'Outsourced to Epilog service partner.', strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_msch_2', 'd_tenant', 'd_eq_05', 'CNC router — lubrication & spindle check',     90,  strftime('%Y-%m-%dT%H:%M:%fZ','now','-96 days'),  strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days'),  'Mona Farouk', 'OVERDUE — schedule with vendor.', strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR REPLACE INTO MaintenanceLog (id, tenantId, itemId, type, status, mode, description, performedBy, cost, includeInOpex, dueDate, nextDueDate, notes, createdAt) VALUES
 ('d_mlog_1', 'd_tenant', 'd_eq_01', 'REPAIR',      'DONE',        'INHOUSE',  'Replaced worn nozzle and re-levelled bed on unit #2.', 'Mona Farouk', 120, 1, NULL, NULL, 'Test print passed.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-9 days')),
 ('d_mlog_2', 'd_tenant', 'd_eq_09', 'CALIBRATION', 'DONE',        'OUTSOURCE','Annual calibration of all 6 oscilloscopes with certificates issued.', 'Gulf Scientific', 300, 1, NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','+350 days'), NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now','-15 days')),
 ('d_mlog_3', 'd_tenant', 'd_eq_13', 'PREVENTIVE',  'IN_PROGRESS', 'OUTSOURCE','Biannual safety inspection of UR5e robotic arm.', 'Emirates Robotics', NULL, 1, strftime('%Y-%m-%dT%H:%M:%fZ','now','+3 days'), NULL, 'Awaiting vendor sign-off.', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'));

-- ── PROCUREMENT (open requests awaiting approval + one approved) ─────────────
INSERT OR REPLACE INTO ProcurementRequest (id, tenantId, budgetType, budgetYear, title, description, supplier, quotedAmount, currency, status, vendorId, submittedById, createdAt, updatedAt) VALUES
 ('d_pro_1', 'd_tenant', 'CAPEX', CAST(strftime('%Y','now') AS INTEGER), 'Two additional Prusa MK4 3D printers', 'Expand the fabrication print farm to meet MDE201 demand this semester.', 'Prusa Research', 8400, 'AED', 'submitted', 'd_ven_2', 'd_mgr', strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days')),
 ('d_pro_2', 'd_tenant', 'OPEX',  CAST(strftime('%Y','now') AS INTEGER), 'Filament & resin restock',              'Replenish low-stock PLA (grey), PETG and SLA resin for the makerspace.', 'Gulf Scientific & Laboratory Supplies', 1500, 'AED', 'submitted', 'd_ven_1', 'd_mgr', strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-1 days')),
 ('d_pro_3', 'd_tenant', 'OPEX',  CAST(strftime('%Y','now') AS INTEGER), 'TurtleBot3 spare wheels & LiDAR units', 'Consumable spares for the robotics teaching fleet.', 'Emirates Robotics & Automation', 2100, 'AED', 'approved', 'd_ven_3', 'd_mgr', strftime('%Y-%m-%dT%H:%M:%fZ','now','-12 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-7 days'));

INSERT OR REPLACE INTO ProcurementItem (id, procurementId, itemId, customName, category, quantity, unit, estPrice) VALUES
 ('d_pit_1', 'd_pro_1', 'd_eq_01', NULL,                 'Equipment',  2,  'PIECE', 4200),
 ('d_pit_2', 'd_pro_2', 'd_inv_01', NULL,                'Consumable', 20, 'PIECE', 45),
 ('d_pit_3', 'd_pro_2', 'd_inv_04', NULL,                'Consumable', 6,  'PIECE', 110),
 ('d_pit_4', 'd_pro_3', NULL,       'TurtleBot3 wheel set', 'Consumable', 10, 'PIECE', 90);

-- ── SERVICE REQUESTS (student jobs — shows the request workflow, not empty) ──
INSERT OR REPLACE INTO ServiceRequest (id, tenantId, type, status, userId, title, description, material, quantity, course, supervisor, createdAt, updatedAt) VALUES
 ('d_req_1', 'd_tenant', 'THREE_D_PRINT', 'PENDING',     'd_stu1', 'Gearbox housing prototype', 'Print a small planetary gearbox housing in PLA for my capstone project.', 'PLA', 1, 'MDE201', 'Dr. Omar Haddad', strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-2 days')),
 ('d_req_2', 'd_tenant', 'LASER_CUT',     'APPROVED',    'd_stu2', 'Acrylic enclosure panels', 'Cut a 3mm acrylic enclosure from the attached DXF for the robotics project.', 'Acrylic 3mm', 4, 'MDE330', 'Dr. Priya Nair', strftime('%Y-%m-%dT%H:%M:%fZ','now','-4 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-3 days')),
 ('d_req_3', 'd_tenant', 'CNC',           'IN_PROGRESS', 'd_stu3', 'Aluminium mounting bracket', 'CNC a 6082 aluminium mounting bracket per drawing.', 'Aluminium 6082', 2, 'MDE215', 'Dr. Omar Haddad', strftime('%Y-%m-%dT%H:%M:%fZ','now','-6 days'), strftime('%Y-%m-%dT%H:%M:%fZ','now','-5 days'));

-- ── SAFETY DOCS + DOCUMENTATION (so those libraries aren't empty) ───────────
INSERT OR REPLACE INTO SafetyDocument (id, tenantId, title, type, fileUrl, version, equipment, status, createdAt, updatedAt) VALUES
 ('d_saf_1', 'd_tenant', 'Risk Assessment — CO2 Laser Cutter', 'risk_assessment', 'https://example.com/demo/laser-ra.pdf', '1.0', 'Epilog Fusion Pro 48 Laser Cutter', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_saf_2', 'd_tenant', 'SOP — CNC Router Safe Operation',     'sop',             'https://example.com/demo/cnc-sop.pdf',  '1.2', 'Tormach 24R CNC Router', 'approved', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

INSERT OR REPLACE INTO Document (id, tenantId, title, category, tags, fileUrl, version, isPublic, uploadedBy, createdAt, updatedAt) VALUES
 ('d_doc_1', 'd_tenant', '3D Printer Standard Operating Procedure', 'sop',    '["3d printing","prusa","fabrication lab"]', 'https://example.com/demo/3d-printer-sop.pdf', '1.0', 1, 'Mona Farouk', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_doc_2', 'd_tenant', 'Laser Cutter Safety Guide',               'policy', '["laser","safety","fabrication lab"]',     'https://example.com/demo/laser-safety.pdf',   '2.1', 1, 'Mona Farouk', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('d_doc_3', 'd_tenant', 'Robotics Lab Induction Handbook',         'manual', '["robotics","induction","safety"]',        'https://example.com/demo/robotics-induction.pdf', '1.0', 1, 'Dr. Priya Nair', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
