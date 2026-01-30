/**
 * Pipeline Configuration
 * Resolves paths relative to the pipeline package root
 */

import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Root of the pipeline package (packages/pipeline/) */
export const PACKAGE_ROOT = path.resolve(__dirname, '../..');

/** Root of the monorepo */
export const REPO_ROOT = path.resolve(PACKAGE_ROOT, '../..');

/** Data directory for pipeline artifacts */
export const DATA_DIR = path.join(PACKAGE_ROOT, 'data');

/** Path to sources.json */
export const SOURCES_PATH = path.join(DATA_DIR, 'sources.json');

/** Path to status.json */
export const STATUS_PATH = path.join(DATA_DIR, 'status.json');

/** Path to chunks directory */
export const CHUNKS_DIR = path.join(DATA_DIR, 'chunks');
