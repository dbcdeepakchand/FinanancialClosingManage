# Finance Close & Project Accounting Control Tower

A React + Vite finance-close application with a Node.js API that connects directly to Oracle Database using `node-oracledb`. The database connection and credentials stay on the server; the browser only calls the application API.

## Features

- Executive dashboard, operational checklist, business-unit overview, timing and reports
- Operational checklist expanded across the mapped business units
- Search and filter checklist activities, owners, modules and status
- Edit task status, owner and comments without changing the source checklist or BU/ledger mapping
- Export visible checklist rows to CSV
- Shared Oracle Database persistence and responsive desktop, tablet and mobile layout

## Requirements

- Node.js 18 or later
- An Oracle Database schema/user accessible to the application server
- For Autonomous Database connections, the wallet files and wallet password from your Oracle administrator

## Connect an Oracle schema

1. Install the Node dependencies:

   ```powershell
   npm install
   ```

2. Ensure the schema has read access to `XX_OPERATIONAL_CHECKLIST` and `XX_BU_LE_LEDGER_MAPPING`, and write access to `XX_OPERATIONAL_CHECKLIST_PROGRESS`. The recommended separation is:

   | Table | Purpose | Key columns used by the application |
   | --- | --- | --- |
   | `XX_OPERATIONAL_CHECKLIST` | Checklist step definitions; one row per checklist step | `CHECKLIST_ROW_ID`, `CHECKLIST_NO`, `MODULE_NAME`, `SUM_SEQ`, `PROCESS_OWNER`, `STEP_ID`, `PRE_REQUISITE_ID`, `PRE_REQUISITE_DESC`, `STEP_DESCRIPTION`, `STEP_COMMENT`, `ACTION_BY`, `WORKDAYS`, `TARGET_DATE`, `TPIT`, `TPIDL`, `TENITALYPS`, `BUSINESS_UNIT`, `USER_ROLE`, `ASSIGNED_USER`, `COMPLETION_CHECK`, `EXPECTED_OUTCOME`, `ACTION_TYPE`, `PROCESS_TYPE`, `NAVIGATION_PATH`, `ACTION_ITEM_DETAILS`, `EXPECTED_START_TIME`, `EXPECTED_COMP_TIME`, `SUSPENSION_STATUS` |
   | `XX_BU_LE_LEDGER_MAPPING` | Business unit, legal entity, ledger and currency mapping | `BUSINESS_UNIT_ID`, `BUSINESS_UNIT_NAME`, `LEGAL_ENTITY_ID`, `LEGAL_ENTITY_NAME`, `LEDGER_ID`, `LEDGER_NAME`, `CURRENCY_CODE` |
   | `XX_OPERATIONAL_CHECKLIST_PROGRESS` | Editable checklist status, owner and note, per checklist row and business unit | `CHECKLIST_ROW_ID`, `BUSINESS_UNIT_ID`, `STATUS`, `OWNER_NAME`, `NOTE`, `NOTE_OVERRIDDEN`, `CREATED_AT`, `UPDATED_AT` |

   Keep `BUSINESS_UNIT_ID` and `LEGAL_ENTITY_ID` in the mapping table; do not add them to the checklist definition table for the current application behavior. The app displays each checklist step for every mapping row, and uses the checklist-row/business-unit pair to store progress. If checklist steps later need to apply only to selected business units or legal entities, the source data and API query must be changed together.

   The source tables are not created or modified by the application; their columns must match the extracts in `Checklist.xlsx` and `LedgerBU.xlsx`. Run [schema.sql](./DBConnect/schema.sql) once to create `XX_OPERATIONAL_CHECKLIST_PROGRESS`.

3. Copy `.env.example` to `.env` and set `DB_USER`, `DB_PASSWORD` and `DB_CONNECT_STRING`. For Autonomous Database, also set `DB_WALLET_LOCATION` and `DB_WALLET_PASSWORD`. Keep `.env` private; it is excluded from Git.

   If the API reports `NJS-533` with `ORA-12660`, the database requires Native Network Encryption or Data Integrity, which node-oracledb Thin mode does not support. Install the Oracle Instant Client that matches the API process architecture, then add its library directory to the API's `.env` file:

   ```dotenv
   ORACLE_CLIENT_LIB_DIR=C:\oracle\instantclient_23_7
   ```

   On Windows, ensure the Instant Client directory is also on `PATH` if it contains dependent DLLs. The API initializes node-oracledb in Thick mode when `ORACLE_CLIENT_LIB_DIR` is set; leave it unset to keep using Thin mode. If your database administrator can instead configure a compatible connection policy, that is another option.

4. Start the API and Vite in separate terminals:

   ```powershell
   npm run api
   npm run dev
   ```

   Open the Vite URL (usually http://localhost:5173). Vite proxies `/api` requests to the Node API on port 3001. The checklist is formed by applying each operational checklist row to each mapped business unit; edits are saved in `XX_OPERATIONAL_CHECKLIST_PROGRESS`.

The API binds to `127.0.0.1` by default. Do not expose it publicly or change `HOST` to a public interface unless it is behind TLS and an authenticated, authorized reverse proxy. The current prototype does not implement user authentication, row-level access control, or an audit trail.

## Build and run the production app

```powershell
npm run build
npm start
```

The Node server serves the `dist/` build and API on the configured port. For production, put it behind an approved TLS-terminating reverse proxy and add enterprise SSO/authorization before enabling network access.

## Important scope notes

- Checklist timing and action metadata come from `XX_OPERATIONAL_CHECKLIST`; business unit, legal entity, ledger and currency details come from `XX_BU_LE_LEDGER_MAPPING`. Checklist rows are shown for every mapped business unit because the extract's `BUSINESS_UNIT` cells are blank.
- Status, owner overrides and comments are workflow data stored separately; the source checklist and mapping remain unchanged.
- Existing browser `localStorage` data is not automatically migrated to Oracle.
- This application stores checklist tasks only; it does not connect to Oracle Fusion, Oracle EBS or OIC.
- Before production use, implement enterprise identity and legal-entity authorization, server-side audit history, approvals, evidence storage, business calendars, reminders, monitoring, backups and deployment controls.
