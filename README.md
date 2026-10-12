# Finance Close & Project Accounting Control Tower

A React + Vite prototype for managing monthly and quarterly closing activities across multiple legal entities.

## Features in this prototype

- Executive dashboard with close completion KPIs and priority attention list
- 12 sample legal entities across regions
- Monthly and quarterly checklist views
- Search and filters by entity, task status and module
- Edit task status, owner, due close day and comments
- Create a task for one entity or all entities
- Close calendar and reporting pages
- Export visible checklist rows to CSV
- Local browser persistence using `localStorage`
- Responsive desktop, tablet and mobile layout

## Requirements

- Node.js 18 or later
- npm

## Run locally

```bash
npm install
npm run dev
```

Open the local URL shown by Vite (usually http://localhost:5173).

## Build for deployment

```bash
npm run build
npm run preview
```

The production build is created in `dist/`.

## Important scope notes

This is a front-end MVP using illustrative sample data. It is **not connected to Oracle Fusion, Oracle EBS, OIC, an enterprise identity provider, or a shared database**. `localStorage` only persists changes in the current browser profile.

Before production use, implement:

1. A secure backend API and shared Oracle Database / Autonomous Database persistence.
2. Enterprise SSO and role-based authorization, including legal-entity data access controls.
3. Oracle Fusion integration through approved REST APIs and/or Oracle Integration Cloud.
4. Server-side audit history, approvals, evidence storage and validation.
5. Configurable business calendars, time zones, period-specific task templates and dependencies.
6. Automated reminders and escalation policies.
7. Security review, logging, monitoring, backup and deployment pipeline.

The entity names, owners, statuses, close dates and KPI values are fictional demo values and should be replaced with approved company data.
