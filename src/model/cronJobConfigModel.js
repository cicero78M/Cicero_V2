import { query } from '../repository/db.js';

const CRON_JOB_CONFIG_BOOTSTRAP_SQL = `
CREATE TABLE IF NOT EXISTS cron_job_config (
    job_key TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION set_cron_job_config_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS cron_job_config_set_updated_at ON cron_job_config;
CREATE TRIGGER cron_job_config_set_updated_at
BEFORE UPDATE ON cron_job_config
FOR EACH ROW
EXECUTE PROCEDURE set_cron_job_config_updated_at();

INSERT INTO cron_job_config (job_key, display_name)
VALUES
    ('./src/cron/cronDbBackup.js', 'Database Backup'),
    ('./src/cron/cronInstaService.js', 'Instagram Service Aggregator'),
    ('./src/cron/cronInstaLaphar.js', 'Instagram Laphar Sync'),
    ('./src/cron/cronRekapLink.js', 'Link Recap Dispatcher'),
    ('./src/cron/cronAmplifyLinkMonthly.js', 'Monthly Amplify Link'),
    ('./src/cron/cronDirRequestRekapUpdate.js', 'Directorate Rekap Update'),
    ('./src/cron/cronDirRequestFetchSosmed.js', 'Directorate Fetch Sosmed'),
    ('./src/cron/cronDirRequestRekapAllSocmed.js', 'Directorate Rekap All Sosmed'),
    ('./src/cron/cronDirRequestSosmedRank.js', 'Directorate Sosmed Rank'),
    ('./src/cron/cronDirRequestEngageRank.js', 'Directorate Engage Rank'),
    ('./src/cron/cronDirRequestLapharKasatker.js', 'Directorate Laphar Kasatker'),
    ('./src/cron/cronDirRequestDirektorat.js', 'Directorate Report Dispatcher'),
    ('./src/cron/cronDirRequestHighLow.js', 'Directorate High Low Ranking')
ON CONFLICT (job_key) DO NOTHING;
`;

let bootstrapPromise;

async function ensureCronJobConfigTable() {
  if (!bootstrapPromise) {
    bootstrapPromise = query(CRON_JOB_CONFIG_BOOTSTRAP_SQL).catch(err => {
      bootstrapPromise = undefined;
      throw err;
    });
  }

  return bootstrapPromise;
}

async function withCronJobBootstrap(callback) {
  try {
    return await callback();
  } catch (err) {
    if (err?.code === '42P01' && /cron_job_config/.test(err?.message ?? '')) {
      await ensureCronJobConfigTable();
      return callback();
    }
    throw err;
  }
}

export async function listCronJobs() {
  const { rows } = await withCronJobBootstrap(() =>
    query(
      `SELECT job_key, display_name, is_active, created_at, updated_at
       FROM cron_job_config
       ORDER BY job_key`,
    ),
  );
  return rows;
}

export async function getCronJob(jobKey) {
  const { rows } = await withCronJobBootstrap(() =>
    query(
      `SELECT job_key, display_name, is_active, created_at, updated_at
       FROM cron_job_config
       WHERE job_key = $1
       LIMIT 1`,
      [jobKey],
    ),
  );
  return rows[0] ?? null;
}

export async function updateCronJobStatus(jobKey, isActive) {
  const { rows } = await withCronJobBootstrap(() =>
    query(
      `UPDATE cron_job_config
       SET is_active = $2
       WHERE job_key = $1
       RETURNING job_key, display_name, is_active, created_at, updated_at`,
      [jobKey, isActive],
    ),
  );
  return rows[0] ?? null;
}
