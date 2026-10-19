import 'dotenv/config';
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import oracledb from 'oracledb';

const root = path.dirname(fileURLToPath(import.meta.url));
const distDirectory = path.join(root, 'dist');
const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '127.0.0.1';
const maxRequestBytes = 1024 * 1024;
const statuses = new Set(['Not started', 'In progress', 'Blocked', 'Complete']);
const priorities = new Set(['Low', 'Medium', 'High']);
const frequencies = new Set(['Both', 'Monthly', 'Quarterly']);
const editableColumns = {
  entity: 'ENTITY_ID',
  status: 'STATUS',
  owner: 'OWNER_NAME',
  due: 'DUE_DAY',
  note: 'NOTE'
};

const mergeSql = `
  MERGE INTO FIN_CLOSE_TASKS target
  USING (SELECT :id AS ID FROM DUAL) source
  ON (target.ID = source.ID)
  WHEN NOT MATCHED THEN INSERT
    (ID, TITLE, MODULE_NAME, FREQUENCY, OWNER_NAME, DUE_DAY, PRIORITY, STATUS, ENTITY_ID, NOTE, TEMPLATE_ID)
    VALUES
    (:id, :title, :module, :frequency, :owner, :due, :priority, :status, :entity, :note, :templateId)`;

const taskBindDefs = {
  id: { type: oracledb.STRING, maxSize: 100 },
  title: { type: oracledb.STRING, maxSize: 300 },
  module: { type: oracledb.STRING, maxSize: 100 },
  frequency: { type: oracledb.STRING, maxSize: 20 },
  owner: { type: oracledb.STRING, maxSize: 150 },
  due: { type: oracledb.NUMBER },
  priority: { type: oracledb.STRING, maxSize: 20 },
  status: { type: oracledb.STRING, maxSize: 30 },
  entity: { type: oracledb.STRING, maxSize: 50 },
  note: { type: oracledb.STRING, maxSize: 4000 },
  templateId: { type: oracledb.NUMBER }
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function validateTask(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) {
    throw new HttpError(400, 'Each task must be a JSON object.');
  }
  const stringField = (key, maxLength) => {
    const value = task[key];
    if (typeof value !== 'string' || !value.trim() || value.length > maxLength) {
      throw new HttpError(400, `Task field "${key}" is required and must be at most ${maxLength} characters.`);
    }
    return value.trim();
  };
  const id = stringField('id', 100);
  const title = stringField('title', 300);
  const module = stringField('module', 100);
  const owner = stringField('owner', 150);
  const entity = stringField('entity', 50);
  const { due, frequency, priority, status } = task;
  if (!Number.isInteger(due) || due < 1 || due > 31) {
    throw new HttpError(400, 'Task due day must be an integer between 1 and 31.');
  }
  if (!frequencies.has(frequency) || !priorities.has(priority) || !statuses.has(status)) {
    throw new HttpError(400, 'Task frequency, priority, or status is invalid.');
  }
  if (task.note !== undefined && (typeof task.note !== 'string' || task.note.length > 4000)) {
    throw new HttpError(400, 'Task note must be a string of at most 4000 characters.');
  }
  if (task.templateId !== null && task.templateId !== undefined &&
      (!Number.isInteger(task.templateId) || task.templateId < 1)) {
    throw new HttpError(400, 'Task template ID must be a positive integer or null.');
  }
  return {
    id, title, module, frequency, owner, due, priority, status, entity,
    note: task.note || '',
    templateId: task.templateId ?? null
  };
}

function mapTask(row) {
  return {
    id: row.ID,
    title: row.TITLE,
    module: row.MODULE_NAME,
    frequency: row.FREQUENCY,
    owner: row.OWNER_NAME,
    due: row.DUE_DAY,
    priority: row.PRIORITY,
    status: row.STATUS,
    entity: row.ENTITY_ID,
    note: row.NOTE || '',
    templateId: row.TEMPLATE_ID
  };
}

async function readTasks(connection) {
  const result = await connection.execute(
    `SELECT ID, TITLE, MODULE_NAME, FREQUENCY, OWNER_NAME, DUE_DAY, PRIORITY,
            STATUS, ENTITY_ID, NOTE, TEMPLATE_ID
       FROM FIN_CLOSE_TASKS
      ORDER BY ENTITY_ID, DUE_DAY, ID`,
    [],
    { outFormat: oracledb.OUT_FORMAT_OBJECT }
  );
  return result.rows.map(mapTask);
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
          sendJson(response, 200, await readTasks(connection));
        } finally {
          await connection.close();
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/tasks/initialize') {
        const body = await readRequestBody(request);
        if (!body || typeof body !== 'object' || !Array.isArray(body.tasks) || body.tasks.length > 2000) {
          throw new HttpError(400, 'Initialization requires a task array containing at most 2000 tasks.');
        }
        const tasks = body.tasks.map(validateTask);
        const connection = await pool.getConnection();
        try {
          const count = await connection.execute('SELECT COUNT(*) AS TOTAL FROM FIN_CLOSE_TASKS', [], {
            outFormat: oracledb.OUT_FORMAT_OBJECT
          });
          if (count.rows[0].TOTAL === 0 && tasks.length > 0) {
            await connection.executeMany(mergeSql, tasks, { bindDefs: taskBindDefs, autoCommit: false });
            await connection.commit();
          }
          sendJson(response, 200, await readTasks(connection));
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          await connection.close();
        }
        return;
      }

      if (request.method === 'POST' && url.pathname === '/api/tasks') {
        const body = await readRequestBody(request);
        if (!body || typeof body !== 'object' || !Array.isArray(body.tasks) ||
            body.tasks.length < 1 || body.tasks.length > 100) {
          throw new HttpError(400, 'Task creation requires between 1 and 100 tasks.');
        }
        const tasks = body.tasks.map(validateTask);
        const connection = await pool.getConnection();
        try {
          await connection.executeMany(
            `INSERT INTO FIN_CLOSE_TASKS
              (ID, TITLE, MODULE_NAME, FREQUENCY, OWNER_NAME, DUE_DAY, PRIORITY, STATUS, ENTITY_ID, NOTE, TEMPLATE_ID)
             VALUES (:id, :title, :module, :frequency, :owner, :due, :priority, :status, :entity, :note, :templateId)`,
            tasks,
            { bindDefs: taskBindDefs, autoCommit: false }
          );
          await connection.commit();
          sendJson(response, 201, tasks);
        } catch (error) {
          await connection.rollback();
          throw error;
        } finally {
          await connection.close();
        }
        return;
      }

      const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
      if (request.method === 'PATCH' && taskMatch) {
        const id = decodeURIComponent(taskMatch[1]);
        const patch = await readRequestBody(request);
        if (!patch || typeof patch !== 'object' || Array.isArray(patch) ||
            Object.keys(patch).some(key => !Object.hasOwn(editableColumns, key))) {
          throw new HttpError(400, 'Only entity, status, owner, due, and note can be updated.');
        }
        const connection = await pool.getConnection();
        try {
          const current = await connection.execute(
            `SELECT ID, TITLE, MODULE_NAME, FREQUENCY, OWNER_NAME, DUE_DAY, PRIORITY,
                    STATUS, ENTITY_ID, NOTE, TEMPLATE_ID
               FROM FIN_CLOSE_TASKS WHERE ID = :id`,
            { id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          if (current.rows.length === 0) throw new HttpError(404, 'Task not found.');
          const task = validateTask({ ...mapTask(current.rows[0]), ...patch });
          const fields = Object.keys(patch);
          if (fields.length > 0) {
            const setClauses = fields.map(field => `${editableColumns[field]} = :${field}`);
            setClauses.push('UPDATED_AT = SYSTIMESTAMP');
            await connection.execute(
              `UPDATE FIN_CLOSE_TASKS SET ${setClauses.join(', ')} WHERE ID = :id`,
              Object.fromEntries([...fields.map(field => [field, task[field]]), ['id', id]]),
              { autoCommit: true }
            );
          }
          const updated = await connection.execute(
            `SELECT ID, TITLE, MODULE_NAME, FREQUENCY, OWNER_NAME, DUE_DAY, PRIORITY,
                    STATUS, ENTITY_ID, NOTE, TEMPLATE_ID
               FROM FIN_CLOSE_TASKS WHERE ID = :id`,
            { id },
            { outFormat: oracledb.OUT_FORMAT_OBJECT }
          );
          sendJson(response, 200, mapTask(updated.rows[0]));
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
