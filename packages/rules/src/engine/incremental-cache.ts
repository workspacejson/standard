import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Finding } from '../types.js';

/**
 * Current engine version. Bump this to invalidate all caches on engine changes.
 */
const ENGINE_VERSION = '0.2.0';

interface CacheEntry {
  fileHash: string;
  ruleVersion: string;
  engineVersion: string;
  findings: Finding[];
}

/**
 * SHA-256 based incremental cache for rule findings.
 *
 * Cache files are stored under `{repoRoot}/.agentsaudit-cache/`.
 * Cache keys are the first 16 hex characters of SHA-256(filePath + ruleId + ruleVersion).
 *
 * Invalidation triggers:
 * - Rule version changed
 * - Engine version changed (ENGINE_VERSION constant above)
 * - File content or metadata changed
 */
export class IncrementalCache {
  private readonly cacheDir: string;

  constructor(repoRoot: string) {
    this.cacheDir = join(repoRoot, '.agentsaudit-cache');
  }

  /**
   * Retrieve cached findings for a file + rule combination.
   *
   * @returns Finding[] on cache hit, null on miss or invalidation.
   */
  get(filePath: string, ruleId: string, ruleVersion: string): Finding[] | null {
    const cacheFile = this.cacheFilePath(filePath, ruleId, ruleVersion);
    if (!existsSync(cacheFile)) return null;

    try {
      const raw = readFileSync(cacheFile, 'utf8');
      const entry: CacheEntry = JSON.parse(raw) as CacheEntry;

      // Invalidate on rule version or engine version mismatch
      if (entry.ruleVersion !== ruleVersion || entry.engineVersion !== ENGINE_VERSION) {
        return null;
      }

      // Invalidate if file content/metadata changed
      const currentHash = this.hashFile(filePath);
      if (currentHash !== entry.fileHash) {
        return null;
      }

      return entry.findings;
    } catch {
      // Corrupt cache entry — treat as miss (threat T-02-01)
      return null;
    }
  }

  /**
   * Store findings for a file + rule combination.
   * Creates the cache directory if it does not exist.
   */
  set(filePath: string, ruleId: string, ruleVersion: string, findings: Finding[]): void {
    if (!existsSync(this.cacheDir)) {
      mkdirSync(this.cacheDir, { recursive: true });
    }

    const entry: CacheEntry = {
      fileHash: this.hashFile(filePath),
      ruleVersion,
      engineVersion: ENGINE_VERSION,
      findings,
    };

    const cacheFile = this.cacheFilePath(filePath, ruleId, ruleVersion);
    writeFileSync(cacheFile, JSON.stringify(entry), 'utf8');
  }

  /**
   * Computes the cache file path using a SHA-256 key derived from
   * filePath, ruleId, and ruleVersion. Uses the first 16 hex chars.
   */
  private cacheFilePath(filePath: string, ruleId: string, ruleVersion: string): string {
    const key = createHash('sha256')
      .update(`${filePath}::${ruleId}::${ruleVersion}`)
      .digest('hex')
      .slice(0, 16);
    return join(this.cacheDir, `${key}.json`);
  }

  /**
   * Hashes file content + size + mtime to detect changes.
   * Returns 'missing' if the file doesn't exist, 'unreadable' on read error.
   */
  private hashFile(filePath: string): string {
    try {
      if (!existsSync(filePath)) return 'missing';
      const stat = statSync(filePath);
      const content = readFileSync(filePath, 'utf8');
      return createHash('sha256')
        .update(`${content}::${stat.size}::${stat.mtimeMs}`)
        .digest('hex')
        .slice(0, 16);
    } catch {
      return 'unreadable';
    }
  }
}
