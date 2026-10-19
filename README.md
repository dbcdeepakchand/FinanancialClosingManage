# Finance Close & Project Accounting Control Tower

A React + Vite finance-close application with a Node.js API that connects directly to Oracle Database using `node-oracledb`. The database connection and credentials stay on the server; the browser only calls the application API.

## Features

- Executive dashboard, close checklist, legal-entity overview, calendar and reports
- Monthly and quarterly checklist views with search and filters
- Edit task status, owner, due close day, entity and comments
- Create a task for one entity or all entities
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

2. Connect to the same Oracle schema that the application will use. Run [schema.sql](./schema.sql) once in Oracle APEX SQL Workshop or another approved Oracle SQL client. This creates the `FIN_CLOSE_TASKS` table.

3. Copy `.env.example` to `.env` and set `DB_USER`, `DB_PASSWORD` and `DB_CONNECT_STRING`. For Autonomous Database, also set `DB_WALLET_LOCATION` and `DB_WALLET_PASSWORD`. Keep `.env` private; it is excluded from Git.

4. Start the API and Vite in separate terminals:

   ```powershell
   npm run api
   npm run dev
   ```

   Open the Vite URL (usually http://localhost:5173). Vite proxies `/api` requests to the Node API on port 3001. The first request seeds an empty table with the prototype checklist; an already populated table is left unchanged.

The API binds to `127.0.0.1` by default. Do not expose it publicly or change `HOST` to a public interface unless it is behind TLS and an authenticated, authorized reverse proxy. The current prototype does not implement user authentication, row-level access control, or an audit trail.

## Build and run the production app

```powershell
npm run build
npm start
```

The Node server serves the `dist/` build and API on the configured port. For production, put it behind an approved TLS-terminating reverse proxy and add enterprise SSO/authorization before enabling network access.

## Important scope notes

- The sample legal entities, owners, statuses, close dates and KPI values are fictional. Replace them with approved company data.
- Existing browser `localStorage` data is not automatically migrated to Oracle.
- This application stores checklist tasks only; it does not connect to Oracle Fusion, Oracle EBS or OIC.
- Before production use, implement enterprise identity and legal-entity authorization, server-side audit history, approvals, evidence storage, business calendars, reminders, monitoring, backups and deployment controls.
