# Finance Close & Project Accounting Control Tower

A React + Vite finance-close application with a Node.js API that connects directly to Oracle Database using `node-oracledb`. The database connection and credentials stay on the server; the browser only calls the application API.

## Features

- Executive dashboard, operational checklist, business-unit overview and reports
- Ledger-based checklist templates expanded to the business units mapped to the selected ledger
- Searchable Ledger and monthly-period selectors that scope dashboard, checklist, business-unit, calendar and report information
- Period-specific workflow status, owner and comment tracking with historical periods available for review
- Search and filter checklist activities, owners, modules and status
- Edit task status, owner and comments without changing the source checklist
- Upload operational-checklist rows to Oracle from a downloadable CSV template
- Export visible checklist rows to CSV
- Shared Oracle Database persistence and responsive desktop, tablet and mobile layout

## Frontend organization

`src/App.jsx` owns shared application state, navigation, API interactions and the task/business-unit editors. Each page view is implemented separately in `src/pages/` (`DashboardPage`, `ChecklistPage`, `BusinessUnitsPage`, `CalendarPage`, `ReportsPage` and `DataSourcePage`), with shared display components in `src/components/`.

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
   | `XX_OPERATIONAL_CHECKLIST` | One ledger-based checklist step per row | `CHECKLIST_ROW_ID`, `MODULE_NAME`, `LEDGER_NAME`, `LEGAL_ENTITY`, `PROCESS_OWNER`, `PROCESS_NAME`, `PROCESS_DESCRIPTION`, `ACTION_BY`, `PRE_REQUISITE_DESC`, `ACTION_TYPE`, `PROCESS_TYPE`, plus WHO audit columns |
   | `XX_OPERATIONAL_CHECKLIST_PROGRESS` | Editable workflow status, owner and comment per checklist row, mapped business unit, ledger and period | `CHECKLIST_ROW_ID`, `BUSINESS_UNIT_ID`, `LEDGER`, `STATUS`, `OWNER_NAME`, `PERIOD`, `NOTE`, `NOTE_OVERRIDDEN`, `CREATED_AT`, `UPDATED_AT` |
   | `XX_BU_LE_LEDGER_MAPPING` | Uploaded business unit, legal entity and ledger reference data | `BUSINESS_UNIT_ID`, `BUSINESS_UNIT_NAME`, `LEGAL_ENTITY_ID`, `LEGAL_ENTITY_NAME`, `LEDGER_ID`, `LEDGER_NAME`, `CURRENCY_CODE`, `CUTOFF_DATE`, `DUE_DAYS` |

   The checklist stores ledger names and process information. Each selected ledger's checklist rows are associated with business units in the mapping table. In progress records, `LEDGER` stores the corresponding `LEDGER_ID`. Workflow progress is keyed by checklist row ID, business-unit ID, ledger ID and `PERIOD` (`MM-YYYY`, for example `10-2026`). The UI lets you pick any month and year using a calendar control and displays the abbreviated month and year (for example `OCT 2026`). Existing progress rows stored in the previous `MMM-YYYY` format remain readable; newly saved rows use `MM-YYYY`. A newly selected period has no progress rows yet, so all tasks initially display as `Not started`.

   Run [schema.sql](./DBConnect/schema.sql) once to create `XX_OPERATIONAL_CHECKLIST` and `XX_OPERATIONAL_CHECKLIST_PROGRESS`. `XX_BU_LE_LEDGER_MAPPING` is managed separately and must provide the mapping columns shown above, including `MAPPING_ID`, `BUSINESS_UNIT_ID`, `BUSINESS_UNIT_NAME`, `LEGAL_ENTITY_ID`, `LEGAL_ENTITY_NAME`, `LEDGER_ID`, `LEDGER_NAME`, `CURRENCY_CODE`, `CUTOFF_DATE` and `DUE_DAYS`. Existing installations must migrate these tables to the listed structure before starting the updated API; preserve existing progress rows when adding the ledger and period key columns.

   The Data source section provides header-only CSV templates for `XX_OPERATIONAL_CHECKLIST` and `XX_BU_LE_LEDGER_MAPPING`. Checklist uploads use `LEDGER_NAME`, `PROCESS_NAME` and `PROCESS_DESCRIPTION` instead of business-unit fields; keep template column names unchanged. Mapping uploads accept optional `CUTOFF_DATE` values in `YYYY-MM-DD` format and optional numeric `DUE_DAYS` values; leave either cell blank when it is not applicable. Uploads append rows transactionally; invalid database rows reject the entire upload without partial inserts. Each upload supports up to 5,000 rows and 5 MB. The selected ledger and its mapping rows determine which business units receive each checklist task.

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

   Open the Vite URL (usually http://localhost:5173). Vite proxies `/api` requests to the Node API on port 3001. Each checklist row is displayed for the business units mapped to the selected ledger; dashboard metrics, reports and workflow edits are scoped to the selected period and saved in `XX_OPERATIONAL_CHECKLIST_PROGRESS`.

The API binds to `127.0.0.1` by default. Do not expose it publicly or change `HOST` to a public interface unless it is behind TLS and an authenticated, authorized reverse proxy. The current prototype does not implement user authentication, row-level access control, or a full audit trail.

## Build and run the production app

```powershell
npm run build
npm start
```

The Node server serves the `dist/` build and API on the configured port. For production, put it behind an approved TLS-terminating reverse proxy and add enterprise SSO/authorization before enabling network access.

## Important scope notes

- Checklist activities come from `XX_OPERATIONAL_CHECKLIST`; business units and ledger association come from `XX_BU_LE_LEDGER_MAPPING`.
- Status, owner overrides and comments are workflow data stored separately for each period; the source checklist remains unchanged. The WHO columns are present in the checklist table but are not populated by the current upload flow.
- Existing browser `localStorage` data is not automatically migrated to Oracle.
- This application stores checklist tasks only; it does not connect to Oracle Fusion, Oracle EBS or OIC.
- Before production use, implement enterprise identity and legal-entity authorization, server-side audit history, approvals, evidence storage, business calendars, reminders, monitoring, backups and deployment controls.
