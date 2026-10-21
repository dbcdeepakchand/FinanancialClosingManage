require("dotenv").config();
const oracledb = require("oracledb");

async function main() {
  let connection;

  try {
    connection = await oracledb.getConnection({
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      connectString: process.env.DB_CONNECT_STRING
    });

    const result = await connection.execute(
      `SELECT
         SYS_CONTEXT('USERENV', 'DB_NAME') AS DB_NAME,
         SYS_CONTEXT('USERENV', 'SERVICE_NAME') AS SERVICE_NAME
       FROM DUAL`
    );

    console.log("Oracle connection successful");
    console.log(result.rows);
  } catch (err) {
    console.error("Oracle connection failed:", err.message);
  } finally {
    if (connection) await connection.close();
  }
}

main();