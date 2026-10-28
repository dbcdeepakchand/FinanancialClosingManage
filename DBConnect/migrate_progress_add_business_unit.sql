-- Run once during a maintenance window after stopping the API.
-- Existing shared progress is copied to every business unit mapped to its ledger.
-- This script creates a database-side backup and aborts if any progress ledger
-- cannot be mapped, so those rows are not silently discarded.

WHENEVER SQLERROR EXIT SQL.SQLCODE ROLLBACK

DECLARE
  progress_column_count NUMBER;
  unmatched_row_count NUMBER;
  null_business_unit_count NUMBER;
  progress_key_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO progress_column_count
    FROM USER_TAB_COLUMNS
   WHERE TABLE_NAME = 'XX_OPERATIONAL_CHECKLIST_PROGRESS'
     AND COLUMN_NAME = 'BUSINESS_UNIT_ID';

  IF progress_column_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20001, 'BUSINESS_UNIT_ID already exists; inspect the table before running this migration.');
  END IF;

  SELECT COUNT(*)
    INTO progress_key_count
    FROM USER_CONSTRAINTS
   WHERE TABLE_NAME = 'XX_OPERATIONAL_CHECKLIST_PROGRESS'
     AND CONSTRAINT_NAME = 'PK_XX_OC_PROGRESS'
     AND CONSTRAINT_TYPE = 'P';

  IF progress_key_count = 0 THEN
    RAISE_APPLICATION_ERROR(-20002, 'Expected primary key PK_XX_OC_PROGRESS was not found; inspect the table before running this migration.');
  END IF;

  SELECT COUNT(*)
    INTO unmatched_row_count
    FROM XX_OPERATIONAL_CHECKLIST_PROGRESS progress
   WHERE NOT EXISTS (
     SELECT 1
       FROM XX_BU_LE_LEDGER_MAPPING mapping
      WHERE TRIM(TO_CHAR(mapping.LEDGER_ID)) = TRIM(progress.LEDGER)
        AND mapping.BUSINESS_UNIT_ID IS NOT NULL
   );

  IF unmatched_row_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20003, 'Some progress rows have no mapped business unit. Resolve their ledger mappings before migrating.');
  END IF;

  SELECT COUNT(*)
    INTO null_business_unit_count
    FROM XX_BU_LE_LEDGER_MAPPING
   WHERE BUSINESS_UNIT_ID IS NULL;

  IF null_business_unit_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20004, 'The business-unit mapping contains rows without BUSINESS_UNIT_ID. Resolve them before migrating.');
  END IF;
END;
/

CREATE TABLE XX_OC_PROGRESS_BAK_20261028 AS
SELECT *
  FROM XX_OPERATIONAL_CHECKLIST_PROGRESS;

ALTER TABLE XX_OPERATIONAL_CHECKLIST_PROGRESS
  ADD (BUSINESS_UNIT_ID VARCHAR2(255 CHAR));

ALTER TABLE XX_OPERATIONAL_CHECKLIST_PROGRESS
  DROP CONSTRAINT PK_XX_OC_PROGRESS;

INSERT INTO XX_OPERATIONAL_CHECKLIST_PROGRESS (
  CHECKLIST_ROW_ID,
  BUSINESS_UNIT_ID,
  LEDGER,
  STATUS,
  OWNER_NAME,
  PERIOD,
  NOTE,
  NOTE_OVERRIDDEN,
  CREATED_AT,
  UPDATED_AT
)
SELECT DISTINCT
       progress.CHECKLIST_ROW_ID,
       TO_CHAR(mapping.BUSINESS_UNIT_ID),
       progress.LEDGER,
       progress.STATUS,
       progress.OWNER_NAME,
       progress.PERIOD,
       progress.NOTE,
       progress.NOTE_OVERRIDDEN,
       progress.CREATED_AT,
       progress.UPDATED_AT
  FROM XX_OC_PROGRESS_BAK_20261028 progress
  JOIN XX_BU_LE_LEDGER_MAPPING mapping
    ON TRIM(TO_CHAR(mapping.LEDGER_ID)) = TRIM(progress.LEDGER);

DELETE FROM XX_OPERATIONAL_CHECKLIST_PROGRESS
 WHERE BUSINESS_UNIT_ID IS NULL;

DECLARE
  null_business_unit_count NUMBER;
  duplicate_key_count NUMBER;
BEGIN
  SELECT COUNT(*)
    INTO null_business_unit_count
    FROM XX_OPERATIONAL_CHECKLIST_PROGRESS
   WHERE BUSINESS_UNIT_ID IS NULL;

  SELECT COUNT(*)
    INTO duplicate_key_count
    FROM (
      SELECT CHECKLIST_ROW_ID, BUSINESS_UNIT_ID, LEDGER, PERIOD
        FROM XX_OPERATIONAL_CHECKLIST_PROGRESS
       GROUP BY CHECKLIST_ROW_ID, BUSINESS_UNIT_ID, LEDGER, PERIOD
      HAVING COUNT(*) > 1
    );

  IF null_business_unit_count > 0 OR duplicate_key_count > 0 THEN
    RAISE_APPLICATION_ERROR(-20005, 'Progress migration validation failed. Restore from XX_OC_PROGRESS_BAK_20261028 and inspect duplicate mappings.');
  END IF;
END;
/

ALTER TABLE XX_OPERATIONAL_CHECKLIST_PROGRESS
  ADD CONSTRAINT PK_XX_OC_PROGRESS
  PRIMARY KEY (CHECKLIST_ROW_ID, BUSINESS_UNIT_ID, LEDGER, PERIOD);

COMMIT;

SELECT COUNT(*) AS MIGRATED_PROGRESS_ROWS
  FROM XX_OPERATIONAL_CHECKLIST_PROGRESS;

SELECT COUNT(*) AS BACKUP_PROGRESS_ROWS
  FROM XX_OC_PROGRESS_BAK_20261028;
