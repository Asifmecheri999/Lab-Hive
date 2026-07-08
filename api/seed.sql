-- Lab Hive seed data (dev/test). Apply with:
--   npx wrangler d1 execute labhive --local --file=./seed.sql
-- passwordHash below is PBKDF2-SHA256 for "password123" (dev only — replace before any real use).

-- Test users, one per role. All share password: password123
INSERT OR REPLACE INTO User (id, email, name, role, department, passwordHash, createdAt, updatedAt) VALUES
 ('u_student',   'student@example.edu',    'Sara Student',     'STUDENT',        'Engineering', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_faculty',   'faculty@example.edu',    'Dr. Faisal Faculty','FACULTY',       'Engineering', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_tech',      'tech@example.edu',       'Tariq Technician', 'LAB_TECHNICIAN', 'Lab Ops',     'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_coord',     'coord@example.edu',      'Carla Coordinator','LAB_COORDINATOR','Lab Ops',     'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_manager',   'manager@example.edu',    'Mona Manager',     'LAB_MANAGER',    'Lab Ops',     'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_hos',       'hos@example.edu',        'Hassan Head',      'HEAD_OF_SCHOOL', 'Engineering', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_dean',      'dean@example.edu',       'Dr. Dana Dean',    'DEAN',           'Engineering', 'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('u_admin',     'admin@example.edu',      'Adam Admin',       'ADMIN',          'IT',          'pbkdf2$100000$y95yiZTXpjhMZgUrqvQgHQ==$etVuWhcA7WOI0TQEKECb1rNneJeJgApuZswcYGMX8h4=', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- A lab
INSERT OR REPLACE INTO Lab (id, name, building, floor, capacity, description, isActive) VALUES
 ('lab_fab', 'Fabrication Lab', 'GR Building', '2', 24, 'Main makerspace — 3D printers, laser cutters, CNC', 1);

-- A second lab
INSERT OR REPLACE INTO Lab (id, name, building, floor, capacity, description, isActive) VALUES
 ('lab_electronics', 'Electronics Lab', 'GR Building', '1', 30, 'Soldering, PCB, test equipment', 1);

-- Inventory items
INSERT OR REPLACE INTO InventoryItem (id, name, type, category, quantity, minQuantity, unit, location, labId, serialNumber, createdAt, updatedAt) VALUES
 ('inv_printer', 'Prusa MK4 3D Printer', 'EQUIPMENT',  '3D Printing', 4,  1, 'pcs', 'Bench A', 'lab_fab', 'PRU-MK4-001', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('inv_pla',     'PLA Filament 1kg',     'CONSUMABLE', 'Filament',    3,  5, 'spool','Shelf 2', 'lab_fab', NULL,          strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('inv_goggles', 'Safety Goggles',       'PPE',        'Eye Protection',20,10,'pcs', 'PPE Cabinet','lab_fab', NULL,        strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('inv_laser',   'Laser Cutter (CO2)',   'EQUIPMENT',  'Laser', 1, 1, 'pcs', 'Bench C', 'lab_fab', 'LC-CO2-002', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('inv_solder',  'Solder Wire 0.8mm',    'CONSUMABLE', 'Soldering', 12, 4, 'roll', 'Drawer 1', 'lab_electronics', NULL, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('inv_oscope',  'Oscilloscope',         'EQUIPMENT',  'Test Equipment', 6, 2, 'pcs', 'Bench 4', 'lab_electronics', 'OSC-114', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Lab sessions (weekly timetable)
INSERT OR REPLACE INTO LabSession (id, labId, moduleCode, title, facultyName, "group", dayOfWeek, startTime, endTime, isRecurring, createdAt) VALUES
 ('ses_1', 'lab_fab', 'B39AX', 'Design & Manufacture Lab', 'Dr. Faisal Faculty', 'Group A', 0, '09:00', '11:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('ses_2', 'lab_fab', 'B39AX', 'Design & Manufacture Lab', 'Dr. Faisal Faculty', 'Group B', 2, '13:00', '15:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('ses_3', 'lab_electronics', 'B30EE', 'Electronics Practical', 'Dr. Faisal Faculty', 'Group A', 1, '10:00', '12:00', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Vendors
INSERT OR REPLACE INTO Vendor (id, name, contactName, email, phone, category, country, isApproved, createdAt) VALUES
 ('ven_1', 'Gulf Lab Supplies', 'Ahmed K.', 'sales@gulflab.ae', '+971-4-1234567', 'lab supplies', 'UAE', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('ven_2', 'Prusa Research', 'Support', 'sales@prusa3d.com', NULL, 'equipment', 'Czechia', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('ven_3', 'Emirates Scientific', 'Layla M.', 'info@emsci.ae', '+971-2-7654321', 'consumables', 'UAE', 0, strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Service requests
INSERT OR REPLACE INTO ServiceRequest (id, type, status, userId, title, description, material, quantity, createdAt, updatedAt) VALUES
 ('req_1', 'THREE_D_PRINT', 'PENDING',  'u_student', 'Gearbox prototype', 'Print a small gearbox housing in PLA', 'PLA', 1, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('req_2', 'LASER_CUT',     'APPROVED', 'u_student', 'Acrylic enclosure', 'Cut a 3mm acrylic enclosure from DXF', 'Acrylic 3mm', 2, strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Procurement
INSERT OR REPLACE INTO ProcurementRequest (id, budgetType, title, description, supplier, quotedAmount, currency, status, vendorId, submittedById, createdAt, updatedAt) VALUES
 ('pro_1', 'CAPEX', 'New 3D Printer', 'Additional Prusa MK4 for fab lab', 'Prusa Research', 4200, 'AED', 'submitted', 'ven_2', 'u_tech', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('pro_2', 'OPEX', 'Filament restock', '20x PLA spools', 'Gulf Lab Supplies', 900, 'AED', 'approved', 'ven_1', 'u_tech', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Documents
INSERT OR REPLACE INTO Document (id, title, category, tags, fileUrl, version, isPublic, uploadedBy, createdAt, updatedAt) VALUES
 ('doc_1', '3D Printer SOP', 'sop', '["3d printing","prusa","fab lab"]', 'https://files.labhive.dev/docs/3d-printer-sop.pdf', '1.0', 1, 'Tariq Technician', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 ('doc_2', 'Laser Cutter Safety', 'policy', '["laser","safety"]', 'https://files.labhive.dev/docs/laser-safety.pdf', '2.1', 1, 'Mona Manager', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));

-- Safety documents
INSERT OR REPLACE INTO SafetyDocument (id, title, type, fileUrl, version, equipment, createdAt, updatedAt) VALUES
 ('saf_1', 'Risk Assessment — Laser Cutter', 'risk_assessment', 'https://files.labhive.dev/safety/laser-ra.pdf', '1.0', 'Laser Cutter (CO2)', strftime('%Y-%m-%dT%H:%M:%fZ','now'), strftime('%Y-%m-%dT%H:%M:%fZ','now'));
