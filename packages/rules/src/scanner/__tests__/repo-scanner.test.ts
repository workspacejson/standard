import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { RepoScanner } from '../../scanner/repo-scanner.js';

describe('RepoScanner', () => {
  it('falls back when git metadata is unavailable and still detects packages', async () => {
    const root = await mkdtemp(join(tmpdir(), 'agents-audit-scan-'));
    await mkdir(join(root, 'packages', 'app'), { recursive: true });
    await mkdir(join(root, 'packages', 'tool'), { recursive: true });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'root' }), 'utf8');
    await writeFile(join(root, 'packages', 'app', 'package.json'), JSON.stringify({ name: '@scope/app' }), 'utf8');
    await writeFile(join(root, 'packages', 'app', 'AGENTS.md'), '# App\n', 'utf8');
    await writeFile(join(root, 'packages', 'tool', 'package.json'), JSON.stringify({ name: '@scope/tool' }), 'utf8');
    await writeFile(join(root, 'pyproject.toml'), '[project]\nname = "demo"\n', 'utf8');
    await writeFile(join(root, 'requirements.txt'), 'requests>=2\n# comment\n', 'utf8');

    const scanner = new RepoScanner();
    const repo = await scanner.scan(root);

    expect(repo.root).toBe(root);
    expect(repo.isMonorepo).toBe(true);
    expect(repo.packages.length).toBe(2);
    expect(repo.packages.some((pkg) => pkg.name === '@scope/app' && pkg.path === 'packages/app' && pkg.agentsMd === 'packages/app/AGENTS.md')).toBe(true);
    expect(repo.packages.some((pkg) => pkg.name === '@scope/tool' && pkg.path === 'packages/tool')).toBe(true);

    expect(repo.manifests.some((manifest) => manifest.type === 'package.json' && manifest.path === 'packages/app/package.json')).toBe(true);
    expect(repo.manifests.some((manifest) => manifest.type === 'pyproject.toml' && manifest.path === 'pyproject.toml')).toBe(true);
    expect(repo.manifests.some((manifest) => manifest.type === 'requirements.txt' && manifest.path === 'requirements.txt')).toBe(true);
    expect(repo.gitHistory.nonAgentsCommitCount30Days).toBeGreaterThanOrEqual(0);
    expect(repo.gitHistory.filesChangedLast30Days.length).toBeGreaterThanOrEqual(0);
  });
});
