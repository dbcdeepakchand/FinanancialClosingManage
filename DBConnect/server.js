//import 'dotenv/config';
//import { createServer } from 'node:http';
//import { readFile, stat } from 'node:fs/promises';
//import path from 'node:path';
//import { fileURLToPath } from 'node:url';
//import oracledb from 'oracledb';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const oracledb = require('oracledb');
const path = require('path');
const { createServer } = require('http');

//const root = path.dirname(fileURLToPath(import.meta.url));
const root = __dirname;
const distDirectory = path.join(root, 'dist');
const port = Number(process.env.PORT || 3002);
const host = process.env.HOST || '127.0.0.1';
const maxRequestBytes = 5 * 1024 * 1024;
const maxImportRows = 5000;
const statuses = new Set(['Not started', 'In progress', 'Blocked', 'Complete']);
const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function toLegacyPeriod(period) {
  const match = period.match(/^(0[1-9]|1[0-2])-(\d{4})$/);
  return match ? `${monthNames[Number(match[1]) - 1]}-${match[2]}` : period;
}

function normalizePeriod(period) {
  const numericMatch = period.match(/^(0[1-9]|1[0-2])-(\d{4})$/);
  if (numericMatch) return period;
  const legacyMatch = period.match(/^(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)-(\d{4})$/);
  return legacyMatch
    ? `${String(monthNames.indexOf(legacyMatch[1]) + 1).padStart(2, '0')}-${legacyMatch[2]}`
    : period;
}

const importSources = {
  checklist: {
    table: 'XX_OPERATIONAL_CHECKLIST',
    columns: [
      'MODULE_NAME', 'LEDGER_NAME', 'PROCESS_OWNER',
      'PROCESS_NAME', 'PROCESS_DESCRIPTION', 'ACTION_BY', 'PRE_REQUISITE_DESC',
      'ACTION_TYPE', 'PROCESS_TYPE'
    ],
    legacyColumns: ['LEGAL_ENTITY'],
    required: ['LEDGER_NAME', 'PROCESS_NAME'],
    derivedNumericColumns: ['LEDGER_ID']
  },
  mapping: {
    table: 'XX_BU_LE_LEDGER_MAPPING',
    columns: [
      'BUSINESS_UNIT_ID', 'BUSINESS_UNIT_NAME', 'LEGAL_ENTITY_ID', 'LEGAL_ENTITY_NAME',
      'LEDGER_ID', 'LEDGER_NAME', 'CURRENCY_CODE', 'CUTOFF_DATE', 'DUE_DAYS'
    ],
    required: [
      'BUSINESS_UNIT_ID', 'BUSINESS_UNIT_NAME', 'LEGAL_ENTITY_ID',
      'LEGAL_ENTITY_NAME', 'LEDGER_ID', 'LEDGER_NAME'
    ],
    numericIds: ['BUSINESS_UNIT_ID'],
    numericColumns: ['DUE_DAYS'],
    dateColumns: ['CUTOFF_DATE']
  }
};
const progressBindDefs = {
  checklistId: { type: oracledb.STRING, maxSize: 100 },
  ledgerId: { type: oracledb.NUMBER },
  ledgerName: { type: oracledb.STRING, maxSize: 255 },
  period: { type: oracledb.STRING, maxSize: 10 },
  status: { type: oracledb.STRING, maxSize: 30 },
  owner: { type: oracledb.STRING, maxSize: 150 },
  note: { type: oracledb.STRING, maxSize: 4000 }
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function mapTask(row) {
  const taskId = [row.CHECKLIST_ROW_ID, row.BUSINESS_UNIT_ID, row.LEDGER_ID, row.PERIOD]
    .join('|');
  return {
    id: taskId,
    checklistRowId: String(row.CHECKLIST_ROW_ID),
    title: row.STEP_DESCRIPTION,
    moduleName: row.MODULE_NAME,
    module: row.MODULE_NAME || 'Uncategorized',
    processOwner: row.PROCESS_OWNER,
    owner: row.OWNER_NAME || 'Unassigned',
    actionBy: row.ACTION_BY,
    prerequisiteDescription: row.PRE_REQUISITE_DESC,
    processDescription: row.PROCESS_DESCRIPTION,
    actionType: row.ACTION_TYPE,
    processType: row.PROCESS_TYPE,
    businessUnitId: String(row.BUSINESS_UNIT_ID),
    entity: row.BUSINESS_UNIT,
    legalEntityName: row.LEGAL_ENTITY,
    ledgerId: String(row.LEDGER_ID),
    ledgerName: row.LEDGER_NAME,
    period: row.PERIOD,
    status: row.STATUS,
    note: row.NOTE || ''
  };
}

async function readTasks(connection, ledgerId, period) {
  const result = await connection.execute(
    `SELECT TO_CHAR(checklist.CHECKLIST_ROW_ID) AS CHECKLIST_ROW_ID,
            checklist.MODULE_NAME,
            mapping.BUSINESS_UNIT_ID,
            mapping.BUSINESS_UNIT_NAME AS BUSINESS_UNIT,
            mapping.LEGAL_ENTITY_NAME AS LEGAL_ENTITY,
            mapping.LEDGER_ID,
            mapping.LEDGER_NAME,
            checklist.PROCESS_OWNER,
            checklist.PROCESS_NAME AS STEP_DESCRIPTION,
            checklist.PROCESS_DESCRIPTION,
            checklist.ACTION_BY,
            checklist.PRE_REQUISITE_DESC, checklist.ACTION_TYPE,
            checklist.PROCESS_TYPE,
            NVL(progress.STATUS, 'Not started') AS STATUS,
            NVL(progress.OWNER_NAME,
                NVL(checklist.ACTION_BY, checklist.PROCESS_OWNER)) AS OWNER_NAME,
            CASE WHEN progress.NOTE_OVERRIDDEN = 'Y' THEN progress.NOTE
                 ELSE NULL END AS NOTE,
            :period AS PERIOD
       FROM XX_OPERATIONAL_CHECKLIST checklist
       JOIN XX_BU_LE_LEDGER_MAPPING mapping
         ON TO_CHAR(mapping.LEDGER_ID) = :ledgerId
        AND (
          checklist.LEDGER_ID = mapping.LEDGER_ID
          OR (
            checklist.LEDGER_ID IS NULL
            AND (
              UPPER(TRIM(checklist.LEDGER_NAME)) = UPPER(TRIM(mapping.LEDGER_NAME))
              OR UPPER(TRIM(checklist.LEDGER_NAME)) = UPPER(TRIM(TO_CHAR(mapping.LEDGER_ID)))
            )
          )
        )
       LEFT JOIN XX_OPERATIONAL_CHECKLIST_PROGRESS progress
         ON progress.CHECKLIST_ROW_ID = TO_CHAR(checklist.CHECKLIST_ROW_ID)
        AND progress.LEDGER_ID = mapping.LEDGER_ID
        AND (
          progress.PERIOD = :period
          OR (
            progress.PERIOD = :legacyPeriod
            AND NOT EXISTS (
              SELECT 1
                FROM XX_OPERATIONAL_CHECKLIST_PROGRESS preferred
                WHERE preferred.CHECKLIST_ROW_ID = progress.CHECKLIST_ROW_ID
                  AND preferred.LEDGER_ID = progress.LEDGER_ID
                  AND preferred.PERIOD = :period
            )
          )
        )
      ORDER BY checklist.CHECKLIST_ROW_ID ASC, mapping.BUSINESS_UNIT_NAME ASC`,
    { ledgerId, period, legacyPeriod: toLegacyPeriod(period) },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  const periods = await connection.execute(
    `SELECT DISTINCT PERIOD
       FROM XX_OPERATIONAL_CHECKLIST_PROGRESS
      WHERE TO_CHAR(LEDGER_ID) = :ledgerId
      ORDER BY PERIOD DESC`,
    { ledgerId },
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return {
    tasks: result.rows.map(mapTask),
    periods: [...new Set(periods.rows.map(row => normalizePeriod(row.PERIOD)))]
  };
}

async function readBusinessUnits(connection) {
  const result = await connection.execute(
    `SELECT MAPPING_ID,
            BUSINESS_UNIT_ID,
            BUSINESS_UNIT_NAME,
            LEGAL_ENTITY_ID,
            LEGAL_ENTITY_NAME,
            LEDGER_ID,
            LEDGER_NAME,
            CURRENCY_CODE,
            TO_CHAR(CUTOFF_DATE, 'YYYY-MM-DD') AS CUTOFF_DATE,
            DUE_DAYS
       FROM XX_BU_LE_LEDGER_MAPPING
      ORDER BY MAPPING_ID`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );

  return result.rows.map(row => ({
    MAPPING_ID: row.MAPPING_ID == null ? '' : String(row.MAPPING_ID),
    BUSINESS_UNIT_ID: row.BUSINESS_UNIT_ID == null ? '' : String(row.BUSINESS_UNIT_ID),
    BUSINESS_UNIT_NAME: row.BUSINESS_UNIT_NAME || '',
    LEGAL_ENTITY_ID: row.LEGAL_ENTITY_ID || '',
    LEGAL_ENTITY_NAME: row.LEGAL_ENTITY_NAME || '',
    LEDGER_ID: row.LEDGER_ID == null ? '' : String(row.LEDGER_ID),
    LEDGER_NAME: row.LEDGER_NAME || '',
    CURRENCY_CODE: row.CURRENCY_CODE || '',
    CUTOFF_DATE: row.CUTOFF_DATE || '',
    DUE_DAYS: row.DUE_DAYS == null ? '' : String(row.DUE_DAYS)
  }));
}

function parseTaskId(id) {
  if (!/^\d+$/.test(id)) throw new HttpError(400, 'Task ID must identify a checklist row.');
  return { checklistId: id };
}

async function readRequestBody(request) {
  let body = '';
  for await (const chunk of request) {
    body += chunk;
    if (Buffer.byteLength(body) > maxRequestBytes) {
      throw new HttpError(413, 'Request body is too large.');
    }
  }
  try {
    return JSON.parse(body);
  } catch {
    throw new HttpError(400, 'Request body must contain valid JSON.');
  }
}

function sendJson(response, status, body) {
  response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(JSON.stringify(body));
}

async function serveStatic(request, response) {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
  } catch {
    sendJson(response, 400, { error: 'Invalid URL path.' });
    return;
  }
  const requestedPath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.resolve(distDirectory, `.${requestedPath}`);
  if (filePath !== distDirectory && !filePath.startsWith(`${distDirectory}${path.sep}`)) {
    sendJson(response, 403, { error: 'Forbidden.' });
    return;
  }
  try {
    const fileInfo = await stat(filePath);
    if (!fileInfo.isFile()) throw new Error('Not a file');
    const contents = await readFile(filePath);
    const type = path.extname(filePath) === '.html' ? 'text/html; charset=utf-8'
      : path.extname(filePath) === '.js' ? 'text/javascript; charset=utf-8'
        : path.extname(filePath) === '.css' ? 'text/css; charset=utf-8'
          : path.extname(filePath) === '.svg' ? 'image/svg+xml'
            : path.extname(filePath) === '.png' ? 'image/png'
              : 'application/octet-stream';
    response.writeHead(200, {
      'Content-Type': type,
      'Cache-Control': path.extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable'
    });
    response.end(contents);
  } catch {
    try {
      const index = await readFile(path.join(distDirectory, 'index.html'));
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      response.end(index);
    } catch {
      sendJson(response, 404, { error: 'Application build not found. Run npm run build first.' });
    }
  }
}

async function main() {
  const { DB_USER: user, DB_PASSWORD: password, DB_CONNECT_STRING: connectString } = process.env;
  if (!user || !password || !connectString) {
    throw new Error('Set DB_USER, DB_PASSWORD, and DB_CONNECT_STRING in your .env file before starting the server.');
  }
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port.');
  }

  if (process.env.ORACLE_CLIENT_LIB_DIR) {
    oracledb.initOracleClient({ libDir: process.env.ORACLE_CLIENT_LIB_DIR });
  }

  const pool = await oracledb.createPool({
    user,
    password,
    connectString,
    poolMin: 1,
    poolMax: 10,
    poolIncrement: 1,
    ...(process.env.DB_WALLET_LOCATION ? {
      walletLocation: process.env.DB_WALLET_LOCATION,
      walletPassword: process.env.DB_WALLET_PASSWORD
    } : {})
  });

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      if (!url.pathname.startsWith('/api/')) {
        if (request.method !== 'GET' && request.method !== 'HEAD') {
          sendJson(response, 405, { error: 'Method not allowed.' });
          return;
        }
        await serveStatic(request, response);
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/tasks') {
        const ledgerId = url.searchParams.get('ledgerId') || '';
        const period = url.searchParams.get('period') || '';
        if (!ledgerId || ledgerId.length > 255) {
          throw new HttpError(400, 'A valid ledgerId is required.');
        }
        if (!/^(0[1-9]|1[0-2])-\d{4}$/.test(period)) {
          throw new HttpError(400, 'Period must use the MM-YYYY format.');
        }
        const connection = await pool.getConnection();
        try {
          const result = await readTasks(connection, ledgerId, period);
          sendJson(response, 200, result);
        } finally {
          await connection.close();
        }
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/business-units') {
        const connection = await pool.getConnection();
        try {
          const businessUnits = await readBusinessUnits(connection);
          sendJson(response, 200, { businessUnits });
        } finally {
          await connection.close();
        }
        return;
      }

      if (request.method === 'GET' && url.pathname === '/api/ledger-overviews') {
        const period = url.searchParams.get('period') || '';
        if (!/^(0[1-9]|1[0-2])-\d{4}$/.test(period)) {
          throw new HttpError(400, 'Period must use the MM-YYYY format.');
        }
        const connection = await pool.getConnection();
        try {
          const mappings = await connection.execute(
            `SELECT LEDGER_ID,
                    MAX(LEDGER_NAME) AS LEDGER_NAME,
                    COUNT(*) AS MAPPING_COUNT,
                    COUNT(DISTINCT CUTOFF_DATE) AS CUTOFF_DATE_COUNT,
                    TO_CHAR(MIN(CUTOFF_DATE), 'YYYY-MM-DD') AS CUTOFF_DATE,
                    COUNT(DISTINCT DUE_DAYS) AS DUE_DAYS_COUNT,
                    MIN(DUE_DAYS) AS DUE_DAYS
               FROM XX_BU_LE_LEDGER_MAPPING
              WHERE LEDGER_ID IS NOT NULL
              GROUP BY LEDGER_ID
              ORDER BY MAX(LEDGER_NAME), LEDGER_ID`,
            [],
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          const ledgers = [];
          for (const mapping of mappings.rows) {
            const ledgerId = String(mapping.LEDGER_ID);
            const result = await readTasks(connection, ledgerId, period);
            const activities = [...new Map(result.tasks.map(task => [task.checklistRowId, task])).values()];
            const completedCount = activities.filter(task => task.status === 'Complete').length;
            const inProgressCount = activities.filter(task => task.status === 'In progress').length;
            const blockedCount = activities.filter(task => task.status === 'Blocked').length;
            const pendingCount = activities.filter(task => task.status === 'Not started').length;
            const completion = activities.length
              ? Math.round(completedCount / activities.length * 100)
              : 0;
            ledgers.push({
              ledgerId,
              ledgerName: mapping.LEDGER_NAME || ledgerId,
              mappingCount: Number(mapping.MAPPING_COUNT),
              activityCount: activities.length,
              completedCount,
              inProgressCount,
              blockedCount,
              pendingCount,
              openCount: activities.length - completedCount,
              completion,
              status: completion === 100 && activities.length > 0
                ? 'Complete'
                : blockedCount > 0
                  ? 'Blocked'
                  : inProgressCount > 0
                    ? 'In progress'
                    : 'Not started',
              moduleCount: new Set(activities.map(task => task.module)).size,
              cutoffDate: Number(mapping.CUTOFF_DATE_COUNT) === 1 ? mapping.CUTOFF_DATE : '',
              dueDays: Number(mapping.DUE_DAYS_COUNT) === 1 && mapping.DUE_DAYS != null
                ? String(mapping.DUE_DAYS)
                : '',
              cutoffDateMixed: Number(mapping.CUTOFF_DATE_COUNT) > 1,
              dueDaysMixed: Number(mapping.DUE_DAYS_COUNT) > 1
            });
          }
          sendJson(response, 200, { ledgers });
        } finally {
          await connection.close();
        }
        return;
      }

      const ledgerMatch = url.pathname.match(/^\/api\/ledgers\/(\d+)$/);
      if (request.method === 'PATCH' && ledgerMatch) {
        const oldLedgerId = ledgerMatch[1];
        if (!Number.isSafeInteger(Number(oldLedgerId))) {
          throw new HttpError(400, 'The selected Ledger ID is not a valid numeric identifier.');
        }
        const body = await readRequestBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            Object.keys(body).some(key => !['ledgerId', 'ledgerName', 'cutoffDate', 'dueDays'].includes(key)) ||
            typeof body.ledgerId !== 'string' || !/^\d+$/.test(body.ledgerId.trim()) ||
            !Number.isSafeInteger(Number(body.ledgerId.trim())) ||
            typeof body.ledgerName !== 'string' || !body.ledgerName.trim() || body.ledgerName.trim().length > 255 ||
            typeof body.cutoffDate !== 'string' || typeof body.dueDays !== 'string') {
          throw new HttpError(400, 'A numeric Ledger ID, Ledger name, cutoff date, and due days are required.');
        }

        const newLedgerId = body.ledgerId.trim();
        const newLedgerName = body.ledgerName.trim();
        const cutoffDateValue = body.cutoffDate.trim();
        const dueDaysValue = body.dueDays.trim();
        if (cutoffDateValue && !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDateValue)) {
          throw new HttpError(400, 'Cutoff date must use YYYY-MM-DD format.');
        }
        if (cutoffDateValue) {
          const [year, month, day] = cutoffDateValue.split('-').map(Number);
          const parsedDate = new Date(Date.UTC(year, month - 1, day));
          if (parsedDate.getUTCFullYear() !== year ||
              parsedDate.getUTCMonth() !== month - 1 ||
              parsedDate.getUTCDate() !== day) {
            throw new HttpError(400, 'Cutoff date must be a valid calendar date.');
          }
        }
        if (dueDaysValue && (!Number.isFinite(Number(dueDaysValue)) || Number(dueDaysValue) < 0)) {
          throw new HttpError(400, 'Due days must be a non-negative number.');
        }
        const cutoffDate = cutoffDateValue || null;
        const dueDays = dueDaysValue ? Number(dueDaysValue) : null;
        const connection = await pool.getConnection();
        try {
          const current = await connection.execute(
            `SELECT LEDGER_NAME
               FROM XX_BU_LE_LEDGER_MAPPING
              WHERE TO_CHAR(LEDGER_ID) = :oldLedgerId
              FETCH FIRST 1 ROWS ONLY`,
            { oldLedgerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (current.rows.length === 0) throw new HttpError(404, 'The selected Ledger has no Business Unit mappings.');
          const oldLedgerName = current.rows[0].LEDGER_NAME;
          if (!oldLedgerName) throw new HttpError(409, 'The selected Ledger mapping has no name and cannot be updated.');

          const conflict = await connection.execute(
            `SELECT COUNT(*) AS RECORD_COUNT
               FROM XX_BU_LE_LEDGER_MAPPING
              WHERE TO_CHAR(LEDGER_ID) = :newLedgerId
                AND :newLedgerId <> :oldLedgerId`,
            { newLedgerId, oldLedgerId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (Number(conflict.rows[0].RECORD_COUNT) > 0) {
            throw new HttpError(409, 'That Ledger ID is already assigned to another Ledger.');
          }

          const progressConflict = await connection.execute(
            `SELECT COUNT(*) AS RECORD_COUNT
               FROM XX_OPERATIONAL_CHECKLIST_PROGRESS source
               JOIN XX_OPERATIONAL_CHECKLIST_PROGRESS target
                 ON target.CHECKLIST_ROW_ID = source.CHECKLIST_ROW_ID
                AND target.PERIOD = source.PERIOD
                AND target.LEDGER_ID = :newLedgerId
              WHERE source.LEDGER_ID = :oldLedgerId
                AND :newLedgerId <> :oldLedgerId`,
            { newLedgerId: Number(newLedgerId), oldLedgerId: Number(oldLedgerId) },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (Number(progressConflict.rows[0].RECORD_COUNT) > 0) {
            throw new HttpError(409, 'The Ledger ID cannot be changed because matching progress already exists under the new ID.');
          }

          try {
            const ledgerBinds = {
              oldLedgerId: Number(oldLedgerId),
              newLedgerId: Number(newLedgerId),
              newLedgerName
            };
            const mappingBinds = {
              ...ledgerBinds,
              cutoffDate,
              dueDays
            };
            await connection.execute(
              `UPDATE XX_BU_LE_LEDGER_MAPPING
                  SET LEDGER_ID = :newLedgerId,
                      LEDGER_NAME = :newLedgerName,
                      CUTOFF_DATE = CASE WHEN :cutoffDate IS NULL THEN NULL
                                         ELSE TO_DATE(:cutoffDate, 'YYYY-MM-DD') END,
                      DUE_DAYS = :dueDays
                WHERE LEDGER_ID = :oldLedgerId`,
              mappingBinds,
              {
                bindDefs: {
                  cutoffDate: { type: oracledb.STRING, maxSize: 10 },
                  dueDays: { type: oracledb.NUMBER }
                }
              }
            );
            await connection.execute(
              `UPDATE XX_OPERATIONAL_CHECKLIST
                  SET LEDGER_ID = :newLedgerId,
                      LEDGER_NAME = :newLedgerName
                WHERE LEDGER_ID = :oldLedgerId
                   OR (LEDGER_ID IS NULL
                       AND UPPER(TRIM(LEDGER_NAME)) = UPPER(TRIM(:oldLedgerName)))`,
              { ...ledgerBinds, oldLedgerName }
            );
            await connection.execute(
              `UPDATE XX_OPERATIONAL_CHECKLIST_PROGRESS
                  SET LEDGER_ID = :newLedgerId,
                      LEDGER = :newLedgerName
                WHERE LEDGER_ID = :oldLedgerId`,
              ledgerBinds
            );
            await connection.commit();
          } catch (error) {
            await connection.rollback();
            throw error;
          }

          sendJson(response, 200, { ok: true, ledgerId: newLedgerId, ledgerName: newLedgerName });
        } finally {
          await connection.close();
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/business-units') {
        const body = await readRequestBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) || !body.record || typeof body.record !== 'object' || Array.isArray(body.record)) {
          throw new HttpError(400, 'Business unit updates require a record object.');
        }

        const record = body.record;
        if (body.createLedger !== undefined && typeof body.createLedger !== 'boolean') {
          throw new HttpError(400, 'createLedger must be a boolean when provided.');
        }
        const required = ['BUSINESS_UNIT_ID', 'BUSINESS_UNIT_NAME', 'LEGAL_ENTITY_ID', 'LEGAL_ENTITY_NAME', 'LEDGER_ID', 'LEDGER_NAME'];
        for (const field of required) {
          if (!String(record[field] ?? '').trim()) {
            throw new HttpError(400, `${field} is required.`);
          }
        }
        if (body.createLedger &&
            (!/^\d+$/.test(String(record.LEDGER_ID).trim()) ||
             !Number.isSafeInteger(Number(String(record.LEDGER_ID).trim())))) {
          throw new HttpError(400, 'A new Ledger ID must be a valid numeric identifier.');
        }

        const currencyCode = String(record.CURRENCY_CODE ?? '').trim() || null;
        const cutoffDate = String(record.CUTOFF_DATE ?? '').trim();
        const dueDays = String(record.DUE_DAYS ?? '').trim();
        const dueDaysValue = dueDays === '' ? null : Number(dueDays);
        if (dueDays !== '' && (!Number.isFinite(dueDaysValue) || dueDaysValue < 0)) {
          throw new HttpError(400, 'DUE_DAYS must be a non-negative number when provided.');
        }
        if (cutoffDate && !/^\d{4}-\d{2}-\d{2}$/.test(cutoffDate)) {
          throw new HttpError(400, 'CUTOFF_DATE must use YYYY-MM-DD format.');
        }

        const bindDefs = {
          BUSINESS_UNIT_ID: { type: oracledb.STRING, maxSize: 255 },
          BUSINESS_UNIT_NAME: { type: oracledb.STRING, maxSize: 255 },
          LEGAL_ENTITY_ID: { type: oracledb.STRING, maxSize: 255 },
          LEGAL_ENTITY_NAME: { type: oracledb.STRING, maxSize: 255 },
          LEDGER_ID: { type: oracledb.STRING, maxSize: 255 },
          LEDGER_NAME: { type: oracledb.STRING, maxSize: 255 },
          CURRENCY_CODE: { type: oracledb.STRING, maxSize: 50 },
          CUTOFF_DATE: { type: oracledb.STRING, maxSize: 50 },
          DUE_DAYS: { type: oracledb.NUMBER }
        };

        const connection = await pool.getConnection();
        try {
          if (body.createLedger) {
            const existingLedger = await connection.execute(
              `SELECT COUNT(*) AS RECORD_COUNT
                 FROM XX_BU_LE_LEDGER_MAPPING
                WHERE TO_CHAR(LEDGER_ID) = :ledgerId`,
              { ledgerId: String(record.LEDGER_ID).trim() },
              { outFormat: oracledb.OUT_FORMAT_OBJECT }
            );
            if (Number(existingLedger.rows[0].RECORD_COUNT) > 0) {
              throw new HttpError(409, 'That Ledger ID already exists. Choose a new Ledger ID or use Update Ledger.');
            }
          }
          await connection.execute(
            `MERGE INTO XX_BU_LE_LEDGER_MAPPING target
              USING (
                SELECT :BUSINESS_UNIT_ID AS BUSINESS_UNIT_ID,
                       :BUSINESS_UNIT_NAME AS BUSINESS_UNIT_NAME,
                       :LEGAL_ENTITY_ID AS LEGAL_ENTITY_ID,
                       :LEGAL_ENTITY_NAME AS LEGAL_ENTITY_NAME,
                       :LEDGER_ID AS LEDGER_ID,
                       :LEDGER_NAME AS LEDGER_NAME,
                       :CURRENCY_CODE AS CURRENCY_CODE,
                       TO_DATE(:CUTOFF_DATE, 'YYYY-MM-DD') AS CUTOFF_DATE,
                       :DUE_DAYS AS DUE_DAYS
                  FROM dual
              ) source
              ON (target.BUSINESS_UNIT_ID = source.BUSINESS_UNIT_ID
                  AND target.LEGAL_ENTITY_ID = source.LEGAL_ENTITY_ID
                  AND target.LEDGER_ID = source.LEDGER_ID)
              WHEN MATCHED THEN UPDATE SET
                target.BUSINESS_UNIT_NAME = source.BUSINESS_UNIT_NAME,
                target.LEGAL_ENTITY_NAME = source.LEGAL_ENTITY_NAME,
                target.LEDGER_NAME = source.LEDGER_NAME,
                target.CURRENCY_CODE = source.CURRENCY_CODE,
                target.CUTOFF_DATE = source.CUTOFF_DATE,
                target.DUE_DAYS = source.DUE_DAYS
              WHEN NOT MATCHED THEN INSERT (
                BUSINESS_UNIT_ID,
                BUSINESS_UNIT_NAME,
                LEGAL_ENTITY_ID,
                LEGAL_ENTITY_NAME,
                LEDGER_ID,
                LEDGER_NAME,
                CURRENCY_CODE,
                CUTOFF_DATE,
                DUE_DAYS
              ) VALUES (
                source.BUSINESS_UNIT_ID,
                source.BUSINESS_UNIT_NAME,
                source.LEGAL_ENTITY_ID,
                source.LEGAL_ENTITY_NAME,
                source.LEDGER_ID,
                source.LEDGER_NAME,
                source.CURRENCY_CODE,
                source.CUTOFF_DATE,
                source.DUE_DAYS
              )`,
            {
              BUSINESS_UNIT_ID: String(record.BUSINESS_UNIT_ID).trim(),
              BUSINESS_UNIT_NAME: String(record.BUSINESS_UNIT_NAME).trim(),
              LEGAL_ENTITY_ID: String(record.LEGAL_ENTITY_ID).trim(),
              LEGAL_ENTITY_NAME: String(record.LEGAL_ENTITY_NAME).trim(),
              LEDGER_ID: String(record.LEDGER_ID).trim(),
              LEDGER_NAME: String(record.LEDGER_NAME).trim(),
              CURRENCY_CODE: currencyCode,
              CUTOFF_DATE: cutoffDate || null,
              DUE_DAYS: dueDaysValue == null ? null : dueDaysValue
            },
            { bindDefs, autoCommit: true }
          );
          sendJson(response, 200, {
            ok: true,
            ...(body.createLedger ? { ledgerId: String(record.LEDGER_ID).trim() } : {})
          });
        } catch (error) {
          if (String(error.message).includes('table or view does not exist') || String(error.message).includes('ORA-00942')) {
            throw new HttpError(404, 'The XX_BU_LE_LEDGER_MAPPING table is not available in the connected Oracle schema.');
          }
          if (String(error.message).includes('ORA-01843') || String(error.message).includes('ORA-01861') || String(error.message).includes('ORA-1861')) {
            throw new HttpError(400, 'The cutoff date must be a valid date in YYYY-MM-DD format.');
          }
          throw error;
        } finally {
          await connection.close();
        }
        return;
      }

      const importMatch = url.pathname.match(/^\/api\/imports\/([^/]+)$/);
      if (request.method === 'POST' && importMatch) {
        const source = Object.hasOwn(importSources, importMatch[1])
          ? importSources[importMatch[1]]
          : null;
        if (!source) throw new HttpError(404, 'Unknown data source.');

        const body = await readRequestBody(request);
        if (!body || typeof body !== 'object' || Array.isArray(body) ||
            !Array.isArray(body.rows) || body.rows.length === 0 || body.rows.length > maxImportRows) {
          throw new HttpError(400, `Upload must contain between 1 and ${maxImportRows} rows.`);
        }

        const rows = body.rows.map((row, index) => {
          const legacyColumns = (source.legacyColumns || [])
            .filter(column => Object.hasOwn(row || {}, column));
          const acceptedColumns = [...source.columns, ...legacyColumns];
          if (!row || typeof row !== 'object' || Array.isArray(row) ||
              Object.keys(row).length !== acceptedColumns.length ||
              source.columns.some(column => !Object.hasOwn(row, column)) ||
              Object.keys(row).some(column => !acceptedColumns.includes(column))) {
            throw new HttpError(400, `Row ${index + 1} does not match the supported template columns.`);
          }

          const values = {};
          for (const column of source.columns) {
            const value = row[column];
            if (value !== null && typeof value !== 'string') {
              throw new HttpError(400, `Row ${index + 1}, ${column} must be text.`);
            }
            if (typeof value === 'string' && value.length > 4000) {
              throw new HttpError(400, `Row ${index + 1}, ${column} exceeds 4000 characters.`);
            }
            values[column] = value === '' ? null : value;
          }
          for (const column of source.required) {
            if (typeof values[column] !== 'string' || !values[column].trim()) {
              throw new HttpError(400, `Row ${index + 1}: ${column} is required.`);
            }
          }
          for (const column of source.numericIds || []) {
            if (typeof values[column] !== 'string' || !/^\d+$/.test(values[column].trim())) {
              throw new HttpError(400, `Row ${index + 1}: ${column} must contain digits only.`);
            }
            values[column] = values[column].trim();
          }
          for (const column of source.numericColumns || []) {
            if (values[column] === null) continue;
            const numericText = values[column].trim();
            if (!numericText) {
              values[column] = null;
              continue;
            }
            const numericValue = Number(numericText);
            if (!Number.isFinite(numericValue)) {
              throw new HttpError(400, `Row ${index + 1}: ${column} must be a valid number.`);
            }
            values[column] = numericValue;
          }
          for (const column of source.dateColumns || []) {
            if (values[column] === null) continue;
            const dateValue = values[column].trim();
            const match = dateValue.match(/^(\d{4})-(\d{2})-(\d{2})$/);
            if (!dateValue) {
              values[column] = null;
              continue;
            }
            const parsedDate = new Date(`${dateValue}T00:00:00.000Z`);
            if (!match || Number.isNaN(parsedDate.getTime()) ||
                parsedDate.toISOString().slice(0, 10) !== dateValue) {
              throw new HttpError(400, `Row ${index + 1}: ${column} must use a valid YYYY-MM-DD date.`);
            }
            values[column] = dateValue;
          }
          return values;
        });

        const insertColumns = [...source.columns, ...(source.derivedNumericColumns || [])];
        const connection = await pool.getConnection();
        try {
          if (source.derivedNumericColumns?.includes('LEDGER_ID')) {
            const ledgerNames = [...new Set(rows.map(row => row.LEDGER_NAME.trim().toUpperCase()))];
            const ledgerIdsByName = new Map(ledgerNames.map(name => [name, new Set()]));
            for (let offset = 0; offset < ledgerNames.length; offset += 900) {
              const names = ledgerNames.slice(offset, offset + 900);
              const nameBinds = Object.fromEntries(names.map((name, index) => [`ledgerName${index}`, name]));
              const namePlaceholders = names.map((_, index) => `:ledgerName${index}`).join(', ');
              const mappings = await connection.execute(
                `SELECT DISTINCT UPPER(TRIM(LEDGER_NAME)) AS LEDGER_NAME,
                                 TO_CHAR(LEDGER_ID) AS LEDGER_ID
                   FROM XX_BU_LE_LEDGER_MAPPING
                  WHERE UPPER(TRIM(LEDGER_NAME)) IN (${namePlaceholders})
                    AND LEDGER_ID IS NOT NULL`,
                nameBinds,
                { outFormat: oracledb.OUT_FORMAT_OBJECT }
              );
              for (const mapping of mappings.rows) {
                ledgerIdsByName.get(mapping.LEDGER_NAME)?.add(mapping.LEDGER_ID);
              }
            }

            for (const [index, row] of rows.entries()) {
              const ledgerIds = ledgerIdsByName.get(row.LEDGER_NAME.trim().toUpperCase());
              if (!ledgerIds?.size) {
                throw new HttpError(400, `Row ${index + 1}: no ledger mapping found for "${row.LEDGER_NAME}". Upload the business-unit ledger mapping first.`);
              }
              if (ledgerIds.size > 1) {
                throw new HttpError(400, `Row ${index + 1}: "${row.LEDGER_NAME}" maps to multiple ledger IDs. Resolve the mapping before uploading.`);
              }
              const [ledgerId] = ledgerIds;
              if (!/^\d+$/.test(ledgerId) || !Number.isSafeInteger(Number(ledgerId))) {
                throw new HttpError(400, `Row ${index + 1}: the mapped ledger ID is not a safe numeric value.`);
              }
              row.LEDGER_ID = Number(ledgerId);
            }
          }

          const numericColumns = [...(source.numericColumns || []), ...(source.derivedNumericColumns || [])];
          const binds = Object.fromEntries(insertColumns.map(column => {
            const isNumeric = numericColumns.includes(column);
            return [column, {
              type: isNumeric ? oracledb.NUMBER : oracledb.STRING,
              ...(!isNumeric ? { maxSize: 4000 } : {})
            }];
          }));
          const placeholders = insertColumns.map(column =>
            (source.dateColumns || []).includes(column)
              ? `TO_DATE(:${column}, 'YYYY-MM-DD')`
              : `:${column}`
          ).join(', ');
          const sql = `INSERT INTO ${source.table} (${insertColumns.join(', ')}) VALUES (${placeholders})`;
          const result = await connection.executeMany(sql, rows, {
            bindDefs: binds,
            autoCommit: false
          });
          await connection.commit();
          sendJson(response, 201, { inserted: result.rowsAffected });
        } catch (error) {
          await connection.rollback();
          if (error.errorNum === 1) {
            throw new HttpError(409, 'An uploaded row conflicts with an existing key. No rows were inserted.');
          }
          if (error.errorNum === 1400) {
            throw new HttpError(400, 'A required Oracle column is empty. No rows were inserted.');
          }
          if (error.errorNum === 1722) {
            throw new HttpError(400, 'A value must use a valid number format for its Oracle column. No rows were inserted.');
          }
          if (error.errorNum === 12899) {
            throw new HttpError(400, 'A value exceeds the allowed length for its Oracle column. No rows were inserted.');
          }
          if (error.errorNum === 1861) {
            throw new HttpError(400, 'A date value does not match the Oracle column format. No rows were inserted.');
          }
          throw error;
        } finally {
          await connection.close();
        }
        return;
      }

      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (request.method === 'PATCH' && taskMatch) {
        const { checklistId } = parseTaskId(decodeURIComponent(taskMatch[1]));
        const patch = await readRequestBody(request);
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
            Object.keys(patch).some(key => !['status', 'owner', 'note', 'businessUnitId', 'ledgerId', 'period'].includes(key)) ||
            !['status', 'owner', 'note', 'businessUnitId', 'ledgerId', 'period'].every(key => Object.hasOwn(patch, key))) {
          throw new HttpError(400, 'Updates must include task status, owner, note, business unit, ledger and period.');
        }
        if (!statuses.has(patch.status)) {
          throw new HttpError(400, 'Task status is invalid.');
        }
        if (typeof patch.businessUnitId !== 'string' || !patch.businessUnitId.trim() || patch.businessUnitId.length > 255 ||
            typeof patch.ledgerId !== 'string' || !/^\d+$/.test(patch.ledgerId.trim()) ||
            !Number.isSafeInteger(Number(patch.ledgerId.trim()))) {
          throw new HttpError(400, 'Business unit and ledger identifiers are required.');
        }
        if (typeof patch.period !== 'string' ||
            !/^(0[1-9]|1[0-2])-\d{4}$/.test(patch.period)) {
          throw new HttpError(400, 'Period must use the MM-YYYY format.');
        }
        if (typeof patch.owner !== 'string' || !patch.owner.trim() || patch.owner.trim().length > 150) {
          throw new HttpError(400, 'Task owner is required and must be at most 150 characters.');
        }
        if (typeof patch.note !== 'string' || patch.note.length > 4000) {
          throw new HttpError(400, 'Task note must be a string of at most 4000 characters.');
        }
        const connection = await pool.getConnection();
        try {
          const source = await connection.execute(
            `SELECT mapping.BUSINESS_UNIT_ID,
                    mapping.LEDGER_NAME
                 FROM XX_OPERATIONAL_CHECKLIST checklist
                 JOIN XX_BU_LE_LEDGER_MAPPING mapping
                   ON TO_CHAR(mapping.LEDGER_ID) = :ledgerId
                    AND mapping.BUSINESS_UNIT_ID = :businessUnitId
                    AND (
                      checklist.LEDGER_ID = mapping.LEDGER_ID
                      OR (
                        checklist.LEDGER_ID IS NULL
                        AND (
                          UPPER(TRIM(checklist.LEDGER_NAME)) = UPPER(TRIM(mapping.LEDGER_NAME))
                          OR UPPER(TRIM(checklist.LEDGER_NAME)) = UPPER(TRIM(TO_CHAR(mapping.LEDGER_ID)))
                        )
                      )
                    )
              WHERE TO_CHAR(checklist.CHECKLIST_ROW_ID) = :checklistId`,
            {
              checklistId,
              businessUnitId: patch.businessUnitId.trim(),
              ledgerId: patch.ledgerId.trim()
            },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (source.rows.length === 0) throw new HttpError(404, 'Checklist task not found.');
          const businessUnitId = source.rows[0].BUSINESS_UNIT_ID;
          const ledgerName = source.rows[0].LEDGER_NAME;
          if (!ledgerName) throw new HttpError(400, 'The selected ledger has no ledger name in its Business Unit mapping.');
          const progress = {
            checklistId,
            ledgerId: Number(patch.ledgerId.trim()),
            ledgerName,
            period: patch.period,
            status: patch.status,
            owner: patch.owner.trim(),
            note: patch.note
          };
          await connection.execute(
            `MERGE INTO XX_OPERATIONAL_CHECKLIST_PROGRESS target
             USING (
               SELECT :checklistId AS CHECKLIST_ROW_ID,
                      :ledgerId AS LEDGER_ID,
                      :ledgerName AS LEDGER,
                      :period AS PERIOD
                 FROM DUAL
             ) source
                ON (target.CHECKLIST_ROW_ID = source.CHECKLIST_ROW_ID
                    AND target.LEDGER_ID = source.LEDGER_ID
                    AND target.PERIOD = source.PERIOD)
             WHEN MATCHED THEN UPDATE SET
               target.LEDGER = source.LEDGER,
               target.STATUS = :status,
               target.OWNER_NAME = :owner,
               target.NOTE = :note,
               target.NOTE_OVERRIDDEN = 'Y',
               target.UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT
               (CHECKLIST_ROW_ID, LEDGER_ID, LEDGER, STATUS, OWNER_NAME, PERIOD, NOTE, NOTE_OVERRIDDEN)
               VALUES
               (:checklistId, :ledgerId, :ledgerName, :status, :owner, :period, :note, 'Y')`,
            progress,
            { bindDefs: progressBindDefs, autoCommit: true }
          );
          const taskId = [checklistId, businessUnitId, String(progress.ledgerId), progress.period].join('|');
          sendJson(response, 200, {
            id: taskId,
            status: progress.status,
            owner: progress.owner,
            note: progress.note
          });
        } finally {
          await connection.close();
        }
        return;
      }

      sendJson(response, 404, { error: 'API route not found.' });
    } catch (error) {
      if (!(error instanceof HttpError)) console.error('API request failed:', error.message);
      if (!response.headersSent) {
        sendJson(response, error instanceof HttpError ? error.status : 500, {
          error: error instanceof HttpError ? error.message : 'Oracle database request failed. Check the server logs.'
        });
      }
    }
  });

  server.listen(port, host, () => {
    console.log(`Finance Close API listening at http://${host}:${port}`);
  });
  const shutdown = async () => {
    server.close();
    await pool.close(10);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch(error => {
  console.error(`Unable to start Finance Close API: ${error.message}`);
  process.exitCode = 1;
});
