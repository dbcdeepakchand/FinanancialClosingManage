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
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const maxRequestBytes = 5 * 1024 * 1024;
const maxImportRows = 5000;
const statuses = new Set(['Not started', 'In progress', 'Blocked', 'Complete']);
const importSources = {
  checklist: {
    table: 'XX_OPERATIONAL_CHECKLIST',
    columns: [
      'MODULE_NAME', 'BUSINESS_UNIT', 'LEGAL_ENTITY', 'PROCESS_OWNER',
      'STEP_DESCRIPTION', 'STEP_COMMENT', 'ACTION_BY', 'PRE_REQUISITE_DESC',
      'ACTION_TYPE', 'PROCESS_TYPE'
    ],
    required: ['BUSINESS_UNIT', 'STEP_DESCRIPTION']
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
  businessUnitId: { type: oracledb.STRING, maxSize: 255 },
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
  return {
    id: row.CHECKLIST_ROW_ID,
    checklistRowId: row.CHECKLIST_ROW_ID,
    title: row.STEP_DESCRIPTION,
    moduleName: row.MODULE_NAME,
    module: row.MODULE_NAME || 'Uncategorized',
    processOwner: row.PROCESS_OWNER,
    owner: row.OWNER_NAME || 'Unassigned',
    actionBy: row.ACTION_BY,
    prerequisiteDescription: row.PRE_REQUISITE_DESC,
    stepComment: row.STEP_COMMENT,
    actionType: row.ACTION_TYPE,
    processType: row.PROCESS_TYPE,
    businessUnitId: row.BUSINESS_UNIT_ID,
    entity: row.BUSINESS_UNIT,
    legalEntityName: row.LEGAL_ENTITY,
    status: row.STATUS,
    note: row.NOTE || ''
  };
}

async function readTasks(connection) {
  const result = await connection.execute(
    `SELECT TO_CHAR(checklist.CHECKLIST_ROW_ID) AS CHECKLIST_ROW_ID,
            checklist.MODULE_NAME,
            NVL(checklist.BUSINESS_UNIT, 'Unassigned') AS BUSINESS_UNIT,
            checklist.LEGAL_ENTITY,
            NVL(checklist.BUSINESS_UNIT, 'Unassigned') AS BUSINESS_UNIT_ID,
            checklist.PROCESS_OWNER, checklist.STEP_DESCRIPTION,
            checklist.STEP_COMMENT, checklist.ACTION_BY,
            checklist.PRE_REQUISITE_DESC, checklist.ACTION_TYPE,
            checklist.PROCESS_TYPE,
            NVL(progress.STATUS, 'Not started') AS STATUS,
            NVL(progress.OWNER_NAME,
                NVL(checklist.ACTION_BY, checklist.PROCESS_OWNER)) AS OWNER_NAME,
            CASE WHEN progress.NOTE_OVERRIDDEN = 'Y' THEN progress.NOTE
                 ELSE checklist.STEP_COMMENT END AS NOTE
       FROM XX_OPERATIONAL_CHECKLIST checklist
       LEFT JOIN XX_OPERATIONAL_CHECKLIST_PROGRESS progress
         ON progress.CHECKLIST_ROW_ID = TO_CHAR(checklist.CHECKLIST_ROW_ID)
        AND progress.BUSINESS_UNIT_ID = NVL(checklist.BUSINESS_UNIT, 'Unassigned')
      ORDER BY checklist.BUSINESS_UNIT, checklist.LEGAL_ENTITY,
               checklist.MODULE_NAME, checklist.CHECKLIST_ROW_ID`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows.map(mapTask);
}

async function readEntities(connection) {
  const result = await connection.execute(
    `SELECT DISTINCT
            NVL(BUSINESS_UNIT, 'Unassigned') AS BUSINESS_UNIT_NAME
       FROM XX_OPERATIONAL_CHECKLIST
      ORDER BY BUSINESS_UNIT_NAME`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows.map(row => ({
    id: row.BUSINESS_UNIT_NAME,
    name: row.BUSINESS_UNIT_NAME
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
        const connection = await pool.getConnection();
        try {
          const tasks = await readTasks(connection);
          const entities = await readEntities(connection);
          sendJson(response, 200, { tasks, entities });
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
          if (!row || typeof row !== 'object' || Array.isArray(row) ||
              Object.keys(row).length !== source.columns.length ||
              source.columns.some(column => !Object.hasOwn(row, column)) ||
              Object.keys(row).some(column => !source.columns.includes(column))) {
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

        const binds = Object.fromEntries(source.columns.map(column => {
          const isNumeric = (source.numericColumns || []).includes(column);
          return [column, {
            type: isNumeric ? oracledb.NUMBER : oracledb.STRING,
            ...(!isNumeric ? { maxSize: 4000 } : {})
          }];
        }));
        const placeholders = source.columns.map(column =>
          (source.dateColumns || []).includes(column)
            ? `TO_DATE(:${column}, 'YYYY-MM-DD')`
            : `:${column}`
        ).join(', ');
        const sql = `INSERT INTO ${source.table} (${source.columns.join(', ')}) VALUES (${placeholders})`;
        const connection = await pool.getConnection();
        try {
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
            Object.keys(patch).some(key => !['status', 'owner', 'note'].includes(key)) ||
            !Object.hasOwn(patch, 'status') || !Object.hasOwn(patch, 'owner') || !Object.hasOwn(patch, 'note')) {
          throw new HttpError(400, 'Updates must include status, owner, and note only.');
        }
        if (!statuses.has(patch.status)) {
          throw new HttpError(400, 'Task status is invalid.');
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
            `SELECT NVL(BUSINESS_UNIT, 'Unassigned') AS BUSINESS_UNIT_ID
               FROM XX_OPERATIONAL_CHECKLIST
              WHERE TO_CHAR(CHECKLIST_ROW_ID) = :checklistId`,
            { checklistId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (source.rows.length === 0) throw new HttpError(404, 'Checklist task not found.');
          const progress = {
            checklistId,
            businessUnitId: source.rows[0].BUSINESS_UNIT_ID,
            status: patch.status,
            owner: patch.owner.trim(),
            note: patch.note
          };
          await connection.execute(
            `MERGE INTO XX_OPERATIONAL_CHECKLIST_PROGRESS target
             USING (
               SELECT :checklistId AS CHECKLIST_ROW_ID,
                      :businessUnitId AS BUSINESS_UNIT_ID
                 FROM DUAL
             ) source
                ON (target.CHECKLIST_ROW_ID = source.CHECKLIST_ROW_ID
                    AND target.BUSINESS_UNIT_ID = source.BUSINESS_UNIT_ID)
             WHEN MATCHED THEN UPDATE SET
               target.STATUS = :status,
               target.OWNER_NAME = :owner,
               target.NOTE = :note,
               target.NOTE_OVERRIDDEN = 'Y',
               target.UPDATED_AT = SYSTIMESTAMP
             WHEN NOT MATCHED THEN INSERT
               (CHECKLIST_ROW_ID, BUSINESS_UNIT_ID, STATUS, OWNER_NAME, NOTE, NOTE_OVERRIDDEN)
               VALUES
               (:checklistId, :businessUnitId, :status, :owner, :note, 'Y')`,
            progress,
            { bindDefs: progressBindDefs, autoCommit: true }
          );
          const updated = await connection.execute(
            `SELECT TO_CHAR(checklist.CHECKLIST_ROW_ID) AS CHECKLIST_ROW_ID,
                    NVL(checklist.BUSINESS_UNIT, 'Unassigned') AS BUSINESS_UNIT_ID,
                    NVL(progress.STATUS, 'Not started') AS STATUS,
                    NVL(progress.OWNER_NAME,
                        NVL(checklist.ACTION_BY, checklist.PROCESS_OWNER)) AS OWNER_NAME,
                    CASE WHEN progress.NOTE_OVERRIDDEN = 'Y' THEN progress.NOTE
                         ELSE checklist.STEP_COMMENT END AS NOTE
               FROM XX_OPERATIONAL_CHECKLIST checklist
               LEFT JOIN XX_OPERATIONAL_CHECKLIST_PROGRESS progress
                 ON progress.CHECKLIST_ROW_ID = TO_CHAR(checklist.CHECKLIST_ROW_ID)
                AND progress.BUSINESS_UNIT_ID = NVL(checklist.BUSINESS_UNIT, 'Unassigned')
              WHERE TO_CHAR(checklist.CHECKLIST_ROW_ID) = :checklistId`,
            { checklistId },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          const task = updated.rows[0];
          sendJson(response, 200, {
            id: task.CHECKLIST_ROW_ID,
            status: task.STATUS,
            owner: task.OWNER_NAME,
            note: task.NOTE || ''
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
