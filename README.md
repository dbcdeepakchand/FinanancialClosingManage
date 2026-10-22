# Finance Close & Project Accounting Control Tower

A React + Vite finance-close application with a Node.js API that connects directly to Oracle Database using `node-oracledb`. The database connection and credentials stay on the server; the browser only calls the application API.

## Features

- Executive dashboard, operational checklist, business-unit overview and reports
- Checklist activities associated directly with their source business unit and legal entity
- Search and filter checklist activities, owners, modules and status
- Edit task status, owner and comments without changing the source checklist
- Upload operational-checklist rows to Oracle from a downloadable CSV template
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

2. Ensure the schema has read access to `XX_OPERATIONAL_CHECKLIST` and write access to `XX_OPERATIONAL_CHECKLIST`, `XX_OPERATIONAL_CHECKLIST_PROGRESS`, and `XX_BU_LE_LEDGER_MAPPING`. The app uploads source rows and stores workflow changes separately:

   | Table | Purpose | Key columns used by the application |
   | --- | --- | --- |
   | `XX_OPERATIONAL_CHECKLIST` | One checklist step per row | `CHECKLIST_ROW_ID`, `MODULE_NAME`, `BUSINESS_UNIT`, `LEGAL_ENTITY`, `PROCESS_OWNER`, `STEP_DESCRIPTION`, `STEP_COMMENT`, `ACTION_BY`, `PRE_REQUISITE_DESC`, `ACTION_TYPE`, `PROCESS_TYPE`, plus WHO audit columns |
   | `XX_OPERATIONAL_CHECKLIST_PROGRESS` | Editable workflow status, owner and comment per checklist row | `CHECKLIST_ROW_ID`, `BUSINESS_UNIT_ID`, `STATUS`, `OWNER_NAME`, `NOTE`, `NOTE_OVERRIDDEN`, `CREATED_AT`, `UPDATED_AT` |
   | `XX_BU_LE_LEDGER_MAPPING` | Uploaded business unit, legal entity and ledger reference data | `BUSINESS_UNIT_ID`, `BUSINESS_UNIT_NAME`, `LEGAL_ENTITY_ID`, `LEGAL_ENTITY_NAME`, `LEDGER_ID`, `LEDGER_NAME`, `CURRENCY_CODE`, `CUTOFF_DATE`, `DUE_DAYS` |

   The checklist stores business unit and legal entity names directly. Workflow progress uses the checklist row ID and business-unit name as its key.

   Run [schema.sql](./DBConnect/schema.sql) once to create `XX_OPERATIONAL_CHECKLIST` and `XX_OPERATIONAL_CHECKLIST_PROGRESS`. Create `XX_BU_LE_LEDGER_MAPPING` separately before uploading its data.

   The Data source section provides header-only CSV templates for `XX_OPERATIONAL_CHECKLIST` and `XX_BU_LE_LEDGER_MAPPING`. Keep the template column names unchanged and enter one source row per CSV row. Mapping uploads accept optional `CUTOFF_DATE` values in `YYYY-MM-DD` format and optional numeric `DUE_DAYS` values; leave either cell blank when it is not applicable. Uploads append rows transactionally; invalid database rows reject the entire upload without partial inserts. Each upload supports up to 5,000 rows and 5 MB. Business-unit/ledger mapping rows are uploaded to the reference table; checklist rows use the business unit and legal entity values in their own source columns.

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

   Open the Vite URL (usually http://localhost:5173). Vite proxies `/api` requests to the Node API on port 3001. Each checklist row is displayed for its listed business unit and legal entity; workflow edits are saved in `XX_OPERATIONAL_CHECKLIST_PROGRESS`.

The API binds to `127.0.0.1` by default. Do not expose it publicly or change `HOST` to a public interface unless it is behind TLS and an authenticated, authorized reverse proxy. The current prototype does not implement user authentication, row-level access control, or an audit trail.

## Build and run the production app

```powershell
npm run build
npm start
```

The Node server serves the `dist/` build and API on the configured port. For production, put it behind an approved TLS-terminating reverse proxy and add enterprise SSO/authorization before enabling network access.

## Important scope notes

- Checklist activities and their business unit/legal entity details come directly from `XX_OPERATIONAL_CHECKLIST`.
- Status, owner overrides and comments are workflow data stored separately; the source checklist remains unchanged. The WHO columns are present in the checklist table but are not populated by the current upload flow.
- Existing browser `localStorage` data is not automatically migrated to Oracle.
- This application stores checklist tasks only; it does not connect to Oracle Fusion, Oracle EBS or OIC.
- Before production use, implement enterprise identity and legal-entity authorization, server-side audit history, approvals, evidence storage, business calendars, reminders, monitoring, backups and deployment controls.
