/**
 * Idempotent migration checker for 002_personas_and_financial.sql
 * Verifies required tables exist in Supabase.
 * Run with: npx tsx scripts/apply-migration.ts
 *
 * If tables don't exist, prints the SQL to run manually in Supabase dashboard.
 */

import { createClient } from '@supabase/supabase-js';
import { config } from 'dotenv';
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

config({ path: path.resolve(__dirname, '../../../.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function tableExists(tableName: string): Promise<boolean> {
  const { error } = await supabase.from(tableName).select('*').limit(1);
  if (error && error.code === '42P01') return false;
  return true;
}

async function main() {
  console.log('Checking migration status...');

  const personasExists = await tableExists('agent_personas');
  const financialExists = await tableExists('financial_positions');

  console.log(`  agent_personas: ${personasExists ? 'OK' : 'MISSING'}`);
  console.log(`  financial_positions: ${financialExists ? 'OK' : 'MISSING'}`);

  if (personasExists && financialExists) {
    console.log('\nAll tables present. No migration needed.');
    return;
  }

  const sqlPath = path.resolve(__dirname, '../supabase/migrations/002_personas_and_financial.sql');
  const sql = readFileSync(sqlPath, 'utf-8');

  console.log('\nTables missing. Run this SQL in your Supabase SQL editor:\n');
  console.log(sql);
  process.exit(1);
}

main().catch(console.error);
