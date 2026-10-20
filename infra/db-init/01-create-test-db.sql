-- Runs once, the first time the database volume is created.
-- A separate database for automated tests, so tests never touch your real data.
CREATE DATABASE lifeos_test OWNER lifeos;
