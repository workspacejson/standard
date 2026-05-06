import { readFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import fg from 'fast-glob';
import simpleGit from 'simple-git';
import type { GitHistory, ManifestInfo, PackageInfo, RepoState } from '../types.js';

const MANIFEST_TYPES: Array<ManifestInfo['type']> = [
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'Gemfile',
];

export class RepoScanner {
  async scan(root: string): Promise<RepoState> {
    const files = await this.getTrackedFiles(root);
    const packages = await this.getPackages(root, files);
    const manifests = await this.getManifests(root, files);
    const history = await this.getGitHistory(root, files);

    return {
      root,
      files,
      isMonorepo: packages.length > 1,
      packages,
      manifests,
      gitHistory: history,
    };
  }

  private async getTrackedFiles(root: string): Promise<string[]> {
    const git = simpleGit(root);
    try {
      const raw = await git.raw(['ls-files', '-z']);
      return raw
        .split('\0')
        .map((entry) => entry.trim())
        .filter(Boolean);
    } catch {
      return fg.sync(['**/*'], {
        cwd: root,
        dot: true,
        ignore: ['node_modules/**', 'dist/**', '.git/**'],
      });
    }
  }

  private async getPackages(root: string, files: string[]): Promise<PackageInfo[]> {
    const candidates = files.filter((file) => basename(file) === 'package.json' && dirname(file) !== '.');
    const packages: PackageInfo[] = [];

    for (const file of candidates) {
      try {
        const manifest = JSON.parse(await readFile(resolve(root, file), 'utf8')) as { name?: string };
        const packageInfo: PackageInfo = {
          name: manifest.name ?? basename(dirname(file)),
          path: dirname(file),
        };
        const agentsMdPath = `${dirname(file)}/AGENTS.md`;
        if (files.includes(agentsMdPath)) {
          packageInfo.agentsMd = agentsMdPath;
        }
        packages.push(packageInfo);
      } catch {
        const packageInfo: PackageInfo = {
          name: basename(dirname(file)),
          path: dirname(file),
        };
        packages.push(packageInfo);
      }
    }

    return packages;
  }

  private async getManifests(root: string, files: string[]): Promise<ManifestInfo[]> {
    const manifests: ManifestInfo[] = [];
    for (const file of files) {
      const type = MANIFEST_TYPES.find((manifestType) => basename(file) === manifestType);
      if (!type) continue;
      const abs = resolve(root, file);
      const dependencies = await this.readDependencies(type, abs);
      manifests.push({ type, path: file, dependencies });
    }
    return manifests;
  }

  private async readDependencies(type: ManifestInfo['type'], filePath: string): Promise<string[]> {
    try {
      const content = await readFile(filePath, 'utf8');
      switch (type) {
        case 'package.json': {
          const pkg = JSON.parse(content) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
            peerDependencies?: Record<string, string>;
            optionalDependencies?: Record<string, string>;
          };
          return [
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {}),
            ...Object.keys(pkg.peerDependencies ?? {}),
            ...Object.keys(pkg.optionalDependencies ?? {}),
          ];
        }
        case 'requirements.txt':
          return content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'))
            .map((line) => line.split(/[<=>\[]/, 1)[0] ?? line);
        case 'pyproject.toml':
          return [...content.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)].map((match) => match[1] ?? '').filter(Boolean);
        case 'Cargo.toml':
          return [...content.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)].map((match) => match[1] ?? '').filter(Boolean);
        case 'go.mod':
          return [...content.matchAll(/^\s*([A-Za-z0-9_.\/-]+)\s+v?\d/gm)].map((match) => match[1] ?? '').filter(Boolean);
        case 'Gemfile':
          return [...content.matchAll(/gem\s+['"]([^'"]+)['"]/gm)].map((match) => match[1] ?? '').filter(Boolean);
      }
    } catch {
      return [];
    }
  }

  private async getGitHistory(root: string, files: string[]): Promise<GitHistory> {
    const git = simpleGit(root);

    try {
      const raw = await git.raw(['log', '--since=30 days ago', '--name-only', '--pretty=format:__COMMIT__']);
      const changedFiles = new Set<string>();
      let commitCount = 0;

      for (const line of raw.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === '__COMMIT__') {
          commitCount += 1;
          continue;
        }
        changedFiles.add(trimmed);
      }

      return {
        agentsMdLastModified: new Date(0),
        nonAgentsCommitCount30Days: commitCount,
        filesChangedLast30Days: [...changedFiles],
      };
    } catch {
      return {
        agentsMdLastModified: new Date(0),
        nonAgentsCommitCount30Days: 0,
        filesChangedLast30Days: files,
      };
    }
  }
}
