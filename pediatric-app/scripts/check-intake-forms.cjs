/* Temporary debug script: list recent intake forms via pg */
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");

const env = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
const m = env.match(/DATABASE_URL="([^"]+)"/);
if (!m) { console.error("DATABASE_URL not found"); process.exit(1); }

const pool = new Pool({ connectionString: m[1], ssl: { rejectUnauthorized: false } });

(async () => {
  const total = await pool.query(`SELECT count(*) FROM intake_forms`);
  console.log("TOTAL INTAKE FORMS IN DB:", total.rows[0].count);

  const forms = await pool.query(`
    SELECT id, hippatiz_form_title, status, submitted_at, created_at
    FROM intake_forms ORDER BY created_at DESC LIMIT 15
  `);
  console.log("RECENT FORMS:");
  for (const f of forms.rows) {
    console.log(`  created ${f.created_at.toISOString()} | submitted ${f.submitted_at.toISOString()} | ${f.status} | ${f.hippatiz_form_title}`);
  }

  const drafts = await pool.query(`SELECT count(*) FROM patient_drafts`);
  console.log("TOTAL PATIENT DRAFTS:", drafts.rows[0].count);

  await pool.end();
})().catch((e) => { console.error("ERROR:", e.message); process.exit(1); });
