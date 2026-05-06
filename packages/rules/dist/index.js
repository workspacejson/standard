// src/engine/rule-engine.ts
var RuleEngine = class {
  rules = [];
  register(rule) {
    this.rules.push(rule);
  }
  async run(ctx) {
    const start = Date.now();
    const findings = [];
    const results = await Promise.allSettled(this.rules.map((rule) => rule.evaluate(ctx)));
    for (const result of results) {
      if (result.status === "fulfilled") {
        findings.push(...result.value);
      }
    }
    return {
      findings,
      durationMs: Date.now() - start
    };
  }
};
function computeHygieneScore(findings) {
  const errorCount = findings.filter((finding) => finding.severity === "error").length;
  const warningCount = findings.filter((finding) => finding.severity === "warning").length;
  const infoCount = findings.filter((finding) => finding.severity === "info").length;
  let score = 100 * Math.max(0, 1 - errorCount / 10) * Math.max(0, 1 - warningCount / 50) * Math.max(0, 1 - infoCount / 200);
  if (errorCount > 0) {
    score = Math.min(score, 70);
  }
  score = Math.round(score);
  const grade = score >= 95 ? "A" : score >= 80 ? "B" : score >= 65 ? "C" : score >= 50 ? "D" : "F";
  return {
    value: score,
    grade,
    errorCount,
    warningCount,
    infoCount
  };
}

// src/parser/agents-md-parser.ts
import { stat } from "fs/promises";
import { remark } from "remark";
import remarkParse from "remark-parse";
var CONVENTION_SYNONYMS = {
  "tests next to source": "colocated-tests",
  "colocated tests": "colocated-tests",
  "tests adjacent to implementation": "colocated-tests",
  "test files beside source": "colocated-tests",
  "kebab-case for filenames": "kebab-case-filenames",
  "kebab case filenames": "kebab-case-filenames",
  "kebab-case file names": "kebab-case-filenames",
  "camelcase for files": "camelcase-filenames",
  "camel case filenames": "camelcase-filenames",
  "tests in __tests__": "tests-in-dunder-tests",
  "tests in a __tests__ directory": "tests-in-dunder-tests",
  "tests under tests/": "tests-in-tests-dir",
  "tests in tests directory": "tests-in-tests-dir",
  "source in src/": "source-in-src",
  "source code in src": "source-in-src",
  "components in components/": "components-in-components-dir",
  "components in ui/": "components-in-ui-dir"
};
var KNOWN_FRAMEWORKS = [
  "react",
  "next.js",
  "nextjs",
  "vue",
  "nuxt",
  "angular",
  "svelte",
  "express",
  "fastify",
  "hono",
  "koa",
  "nest",
  "nestjs",
  "postgres",
  "postgresql",
  "mysql",
  "sqlite",
  "mongodb",
  "redis",
  "prisma",
  "drizzle",
  "typeorm",
  "sequelize",
  "vitest",
  "jest",
  "mocha",
  "playwright",
  "cypress",
  "vite",
  "webpack",
  "esbuild",
  "turbopack",
  "rollup",
  "tailwind",
  "tailwindcss",
  "styled-components",
  "css-modules",
  "zod",
  "yup",
  "joi",
  "ajv",
  "trpc",
  "graphql",
  "openapi",
  "rest",
  "django",
  "flask",
  "fastapi",
  "starlette",
  "pytest",
  "unittest",
  "cargo",
  "actix",
  "axum",
  "tokio",
  "rails",
  "sinatra",
  "rspec"
];
function toText(node) {
  if (typeof node.value === "string") {
    return node.value;
  }
  if (Array.isArray(node.children)) {
    return node.children.map((child) => toText(child)).join("");
  }
  return "";
}
function walk(node, visit) {
  visit(node);
  for (const child of node.children ?? []) {
    walk(child, visit);
  }
}
var AgentsMdParser = class {
  async parse(filePath, content) {
    const lastModified = await this.getFileModifiedDate(filePath);
    const tree = remark().use(remarkParse).parse(content);
    const sections = this.extractSections(tree, content);
    const filePaths = this.extractFilePaths(content);
    const frameworkTokens = this.extractFrameworkTokens(content);
    const conventions = this.extractConventions(tree);
    const patterns = this.extractPatterns(content);
    return {
      raw: content,
      filePath,
      lastModified,
      sections,
      filePaths,
      frameworkTokens,
      conventions,
      patterns
    };
  }
  extractSections(tree, raw) {
    const lines = raw.split("\n");
    const headings = [];
    walk(tree, (node) => {
      if (node.type === "heading") {
        headings.push({
          text: toText(node),
          depth: node.depth ?? 1,
          lineStart: node.position?.start?.line ?? 1
        });
      }
    });
    return headings.map((heading, index) => {
      const next = headings[index + 1];
      const lineEnd = next ? Math.max(heading.lineStart, next.lineStart - 1) : lines.length;
      return {
        heading: heading.text,
        depth: heading.depth,
        content: lines.slice(heading.lineStart - 1, lineEnd).join("\n"),
        lineStart: heading.lineStart,
        lineEnd
      };
    });
  }
  extractFilePaths(raw) {
    const paths = /* @__PURE__ */ new Set();
    const pathPattern = /(?:^|[\s`"'])([./][^\s`"']+\.[a-z]{1,6}|[./][^\s`"']+\/)/gm;
    for (const match of raw.matchAll(pathPattern)) {
      const candidate = match[1]?.trim();
      if (candidate && this.looksLikeFilePath(candidate)) {
        paths.add(candidate);
      }
    }
    return [...paths];
  }
  extractFrameworkTokens(content) {
    const lower = content.toLowerCase();
    return KNOWN_FRAMEWORKS.filter((token) => lower.includes(token));
  }
  extractConventions(tree) {
    const conventions = [];
    walk(tree, (node) => {
      if (node.type !== "paragraph" && node.type !== "listItem") {
        return;
      }
      const text = toText(node);
      const lower = text.toLowerCase();
      const lineNumber = node.position?.start?.line ?? 1;
      for (const [phrase, canonical] of Object.entries(CONVENTION_SYNONYMS)) {
        if (lower.includes(phrase)) {
          conventions.push({
            raw: text,
            type: this.classifyConventionType(canonical),
            canonical,
            lineNumber
          });
        }
      }
      if (/(kebab-case|camelCase|PascalCase|snake_case)/i.test(text)) {
        conventions.push({
          raw: text,
          type: "filename-case",
          canonical: this.extractCaseConvention(text),
          lineNumber
        });
      }
    });
    return this.dedupeConventions(conventions);
  }
  dedupeConventions(entries) {
    const seen = /* @__PURE__ */ new Set();
    const result = [];
    for (const entry of entries) {
      const key = `${entry.canonical}:${entry.lineNumber}:${entry.raw}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(entry);
      }
    }
    return result;
  }
  extractPatterns(raw) {
    const patterns = [];
    for (const match of raw.matchAll(/`([^`]+)`/g)) {
      const candidate = match[1];
      if (candidate && this.looksLikeGlob(candidate)) {
        patterns.push({
          raw: candidate,
          glob: candidate,
          lineNumber: this.findLineNumber(raw, match.index ?? 0)
        });
      }
    }
    return patterns;
  }
  looksLikeFilePath(value) {
    return /^[./]/.test(value) && !/^\/\//.test(value) && value.length > 2 && value.length < 200;
  }
  looksLikeGlob(value) {
    return /[*?{}[\]]/.test(value) || /\.(ts|js|md|json|py|rs|go|rb)$/.test(value);
  }
  classifyConventionType(canonical) {
    if (canonical.includes("test")) return "directory-layout";
    if (canonical.includes("case")) return "filename-case";
    if (canonical.includes("source")) return "directory-layout";
    if (canonical.includes("component")) return "directory-layout";
    return "structural";
  }
  extractCaseConvention(text) {
    if (/kebab-case/i.test(text)) return "kebab-case-filenames";
    if (/camelCase/i.test(text)) return "camelcase-filenames";
    if (/PascalCase/i.test(text)) return "pascalcase-filenames";
    if (/snake_case/i.test(text)) return "snake-case-filenames";
    return "other-case-convention";
  }
  findLineNumber(raw, index) {
    return raw.slice(0, index).split("\n").length;
  }
  async getFileModifiedDate(filePath) {
    try {
      const stats = await stat(filePath);
      return stats.mtime;
    } catch {
      return /* @__PURE__ */ new Date(0);
    }
  }
};

// src/scanner/repo-scanner.ts
import { readFile } from "fs/promises";
import { basename, dirname, resolve } from "path";
import fg from "fast-glob";
import simpleGit from "simple-git";
var MANIFEST_TYPES = [
  "package.json",
  "pyproject.toml",
  "requirements.txt",
  "Cargo.toml",
  "go.mod",
  "Gemfile"
];
var RepoScanner = class {
  async scan(root) {
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
      gitHistory: history
    };
  }
  async getTrackedFiles(root) {
    const git = simpleGit(root);
    try {
      const raw = await git.raw(["ls-files", "-z"]);
      return raw.split("\0").map((entry) => entry.trim()).filter(Boolean);
    } catch {
      return fg.sync(["**/*"], {
        cwd: root,
        dot: true,
        ignore: ["node_modules/**", "dist/**", ".git/**"]
      });
    }
  }
  async getPackages(root, files) {
    const candidates = files.filter((file) => basename(file) === "package.json" && dirname(file) !== ".");
    const packages = [];
    for (const file of candidates) {
      try {
        const manifest = JSON.parse(await readFile(resolve(root, file), "utf8"));
        const packageInfo = {
          name: manifest.name ?? basename(dirname(file)),
          path: dirname(file)
        };
        const agentsMdPath = `${dirname(file)}/AGENTS.md`;
        if (files.includes(agentsMdPath)) {
          packageInfo.agentsMd = agentsMdPath;
        }
        packages.push(packageInfo);
      } catch {
        const packageInfo = {
          name: basename(dirname(file)),
          path: dirname(file)
        };
        packages.push(packageInfo);
      }
    }
    return packages;
  }
  async getManifests(root, files) {
    const manifests = [];
    for (const file of files) {
      const type = MANIFEST_TYPES.find((manifestType) => basename(file) === manifestType);
      if (!type) continue;
      const abs = resolve(root, file);
      const dependencies = await this.readDependencies(type, abs);
      manifests.push({ type, path: file, dependencies });
    }
    return manifests;
  }
  async readDependencies(type, filePath) {
    try {
      const content = await readFile(filePath, "utf8");
      switch (type) {
        case "package.json": {
          const pkg = JSON.parse(content);
          return [
            ...Object.keys(pkg.dependencies ?? {}),
            ...Object.keys(pkg.devDependencies ?? {}),
            ...Object.keys(pkg.peerDependencies ?? {}),
            ...Object.keys(pkg.optionalDependencies ?? {})
          ];
        }
        case "requirements.txt":
          return content.split("\n").map((line) => line.trim()).filter((line) => line && !line.startsWith("#")).map((line) => line.split(/[<=>\[]/, 1)[0] ?? line);
        case "pyproject.toml":
          return [...content.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)].map((match) => match[1] ?? "").filter(Boolean);
        case "Cargo.toml":
          return [...content.matchAll(/^\s*([A-Za-z0-9_.-]+)\s*=/gm)].map((match) => match[1] ?? "").filter(Boolean);
        case "go.mod":
          return [...content.matchAll(/^\s*([A-Za-z0-9_.\/-]+)\s+v?\d/gm)].map((match) => match[1] ?? "").filter(Boolean);
        case "Gemfile":
          return [...content.matchAll(/gem\s+['"]([^'"]+)['"]/gm)].map((match) => match[1] ?? "").filter(Boolean);
      }
    } catch {
      return [];
    }
  }
  async getGitHistory(root, files) {
    const git = simpleGit(root);
    try {
      const raw = await git.raw(["log", "--since=30 days ago", "--name-only", "--pretty=format:__COMMIT__"]);
      const changedFiles = /* @__PURE__ */ new Set();
      let commitCount = 0;
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed === "__COMMIT__") {
          commitCount += 1;
          continue;
        }
        changedFiles.add(trimmed);
      }
      return {
        agentsMdLastModified: /* @__PURE__ */ new Date(0),
        nonAgentsCommitCount30Days: commitCount,
        filesChangedLast30Days: [...changedFiles]
      };
    } catch {
      return {
        agentsMdLastModified: /* @__PURE__ */ new Date(0),
        nonAgentsCommitCount30Days: 0,
        filesChangedLast30Days: files
      };
    }
  }
};

// src/validator/workspace-json-validator.ts
import Ajv2020 from "ajv/dist/2020.js";
import { workspaceJsonSchema } from "@workspacejson/spec";
var WorkspaceJsonValidator = class {
  ajv;
  validateFn;
  constructor() {
    this.ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
    this.validateFn = this.ajv.compile(workspaceJsonSchema);
  }
  validate(value) {
    const valid = this.validateFn(value);
    return {
      valid: Boolean(valid),
      errors: this.validateFn.errors?.map((error) => `${error.instancePath || "/"} ${error.message || "is invalid"}`) ?? []
    };
  }
};

// src/rules/integrity/missing-file-reference.ts
import { existsSync } from "fs";
import { resolve as resolve2 } from "path";
var missingFileReference = {
  id: "missing-file-reference",
  category: "integrity",
  severity: "error",
  description: "AGENTS.md references a file path that does not exist on disk.",
  async evaluate(ctx) {
    const findings = [];
    for (const filePath of ctx.agentsMd.filePaths) {
      if (filePath.startsWith("http") || filePath.startsWith("#")) continue;
      if (filePath.includes("*") || filePath.includes("{")) continue;
      const normalized = filePath.replace(/^\.\//, "");
      const absolute = resolve2(ctx.repo.root, normalized);
      if (!existsSync(absolute)) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          message: `File path "${filePath}" referenced in AGENTS.md does not exist.`,
          evidence: {
            file: ctx.agentsMd.filePath,
            path: filePath
          },
          remediation: `Either create the file at "${filePath}" or remove the reference from AGENTS.md.`
        });
      }
    }
    return findings;
  }
};

// src/rules/integrity/pattern-zero-match.ts
import fg2 from "fast-glob";
var patternZeroMatch = {
  id: "pattern-zero-match",
  category: "integrity",
  severity: "warning",
  description: "A pattern referenced in AGENTS.md matches zero files in the repository.",
  async evaluate(ctx) {
    const findings = [];
    for (const pattern of ctx.agentsMd.patterns) {
      if (!pattern.glob) continue;
      if (pattern.raw.includes("example") || pattern.raw.includes("e.g.")) continue;
      const matches = await fg2(pattern.glob, {
        cwd: ctx.repo.root,
        ignore: ["node_modules/**", "dist/**", ".git/**", ...ctx.config.ignore],
        dot: true
      });
      if (matches.length === 0) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Pattern "${pattern.raw}" in AGENTS.md matches no files in this repository.`,
          evidence: {
            file: ctx.agentsMd.filePath,
            line: pattern.lineNumber,
            snippet: pattern.raw
          },
          remediation: `Verify the pattern is correct, or update AGENTS.md to reflect the current project structure.`
        });
      }
    }
    return findings;
  }
};

// src/rules/drift/framework-drift.ts
var FRAMEWORK_MANIFEST_MAP = {
  react: ["react", "@types/react"],
  "next.js": ["next"],
  nextjs: ["next"],
  vue: ["vue", "@vue/core"],
  nuxt: ["nuxt"],
  angular: ["@angular/core"],
  svelte: ["svelte"],
  express: ["express"],
  fastify: ["fastify"],
  hono: ["hono"],
  nestjs: ["@nestjs/core"],
  nest: ["@nestjs/core"],
  vitest: ["vitest"],
  jest: ["jest", "@jest/core"],
  playwright: ["@playwright/test", "playwright"],
  prisma: ["prisma", "@prisma/client"],
  drizzle: ["drizzle-orm"],
  zod: ["zod"],
  trpc: ["@trpc/server", "@trpc/client"],
  tailwind: ["tailwindcss"],
  tailwindcss: ["tailwindcss"],
  vite: ["vite"],
  django: ["django", "Django"],
  flask: ["flask", "Flask"],
  fastapi: ["fastapi"],
  pytest: ["pytest"],
  actix: ["actix-web"],
  axum: ["axum"],
  rails: ["rails"]
};
var frameworkDrift = {
  id: "framework-drift",
  category: "drift",
  severity: "warning",
  description: "AGENTS.md mentions a framework not found in any detected manifest.",
  async evaluate(ctx) {
    const findings = [];
    if (ctx.repo.manifests.length === 0) {
      return findings;
    }
    const allDependencies = new Set(ctx.repo.manifests.flatMap((manifest) => manifest.dependencies));
    for (const token of ctx.agentsMd.frameworkTokens) {
      const variants = FRAMEWORK_MANIFEST_MAP[token];
      if (!variants) continue;
      const found = variants.some(
        (variant) => allDependencies.has(variant) || [...allDependencies].some((dependency) => dependency.toLowerCase().includes(variant.toLowerCase()))
      );
      if (!found) {
        findings.push({
          ruleId: this.id,
          severity: this.severity,
          message: `Framework "${token}" is mentioned in AGENTS.md but not found in any manifest.`,
          evidence: {
            file: ctx.agentsMd.filePath,
            snippet: token
          },
          remediation: `If "${token}" is no longer used, remove it from AGENTS.md. If it is used, verify the manifest includes it.`
        });
      }
    }
    return findings;
  }
};

// src/rules/staleness/section-staleness.ts
var MS_PER_DAY = 864e5;
var sectionStaleness = {
  id: "section-staleness",
  category: "staleness",
  severity: "warning",
  description: "AGENTS.md has not been updated despite significant repository activity.",
  async evaluate(ctx) {
    const findings = [];
    const now = Date.now();
    const ageDays = (now - ctx.agentsMd.lastModified.getTime()) / MS_PER_DAY;
    const thresholdDays = ctx.config.stalenessThresholdDays ?? 60;
    const highActivityCommitCount = ctx.config.highActivityCommitCount ?? 20;
    const gate1 = ageDays >= thresholdDays;
    const gate2 = ctx.repo.gitHistory.nonAgentsCommitCount30Days >= highActivityCommitCount;
    const referencedFiles = new Set(ctx.agentsMd.filePaths);
    const gate3 = ctx.repo.gitHistory.filesChangedLast30Days.some((file) => referencedFiles.has(file) || referencedFiles.has(`./${file}`));
    if (!gate1 || !gate2 || !gate3) {
      return findings;
    }
    const stalenessRatio = ageDays / thresholdDays;
    const severity = stalenessRatio >= 2 ? "warning" : "info";
    findings.push({
      ruleId: this.id,
      severity,
      message: `AGENTS.md has not been updated in ${Math.round(ageDays)} days while the repository has had ${ctx.repo.gitHistory.nonAgentsCommitCount30Days} commits in the last 30 days.`,
      evidence: {
        file: ctx.agentsMd.filePath,
        snippet: `Last modified: ${ctx.agentsMd.lastModified.toISOString().split("T")[0]}`
      },
      remediation: "Review AGENTS.md to ensure it reflects current project structure, frameworks, and conventions."
    });
    return findings;
  }
};

// src/rules/consistency/convention-mismatch.ts
import { existsSync as existsSync2 } from "fs";
import { basename as basename2, resolve as resolve3 } from "path";
import fg3 from "fast-glob";
var conventionMismatch = {
  id: "convention-mismatch",
  category: "consistency",
  severity: "warning",
  description: "Repository structure contradicts an explicit convention stated in AGENTS.md.",
  async evaluate(ctx) {
    const findings = [];
    for (const convention of ctx.agentsMd.conventions) {
      const finding = await this.checkConvention(convention, ctx);
      if (finding) findings.push(finding);
    }
    return findings;
  },
  async checkConvention(convention, ctx) {
    switch (convention.canonical) {
      case "colocated-tests":
        return this.checkColocation(convention, ctx);
      case "tests-in-dunder-tests":
        return this.checkTestDirectory(convention, ctx, "__tests__");
      case "tests-in-tests-dir":
        return this.checkTestDirectory(convention, ctx, "tests");
      case "source-in-src":
        return this.checkSourceDirectory(convention, ctx, "src");
      case "kebab-case-filenames":
        return this.checkFilenameCase(convention, ctx, "kebab");
      case "camelcase-filenames":
        return this.checkFilenameCase(convention, ctx, "camel");
      case "pascalcase-filenames":
        return this.checkFilenameCase(convention, ctx, "pascal");
      case "snake-case-filenames":
        return this.checkFilenameCase(convention, ctx, "snake");
      default:
        return null;
    }
  },
  async checkColocation(convention, ctx) {
    const separateTestDir = (await fg3(["test/**/*", "__tests__/**/*", "tests/**/*", "spec/**/*"], {
      cwd: ctx.repo.root,
      ignore: ["node_modules/**", "dist/**", ".git/**"],
      dot: true
    })).length > 0;
    if (!separateTestDir) return null;
    return {
      ruleId: this.id,
      severity: "warning",
      message: "AGENTS.md states colocated tests, but a separate test directory was found at the repo root.",
      evidence: {
        file: ctx.agentsMd.filePath,
        line: convention.lineNumber,
        snippet: convention.raw
      },
      remediation: "Move tests to be colocated with source files, or update the convention in AGENTS.md."
    };
  },
  async checkTestDirectory(convention, ctx, expectedDir) {
    const searchRoots = ctx.repo.isMonorepo ? ctx.repo.packages.map((pkg) => resolve3(ctx.repo.root, pkg.path)) : [ctx.repo.root];
    const violations = [];
    for (const root of searchRoots) {
      const testFiles = await fg3("**/*.{test,spec}.{ts,js,tsx,jsx}", {
        cwd: root,
        ignore: [`**/${expectedDir}/**`, "node_modules/**", "dist/**"]
      });
      if (testFiles.length > 0) {
        violations.push(root);
      }
    }
    if (violations.length > 0) {
      return {
        ruleId: this.id,
        severity: "warning",
        message: `AGENTS.md states tests should be in "${expectedDir}/" directories, but test files were found outside this location.`,
        evidence: {
          file: ctx.agentsMd.filePath,
          line: convention.lineNumber,
          snippet: convention.raw
        },
        remediation: `Move test files into "${expectedDir}/" directories, or update the convention in AGENTS.md.`
      };
    }
    return null;
  },
  async checkSourceDirectory(convention, ctx, expectedDir) {
    if (!existsSync2(resolve3(ctx.repo.root, expectedDir))) {
      return {
        ruleId: this.id,
        severity: "warning",
        message: `AGENTS.md states source code lives in "${expectedDir}/", but that directory does not exist.`,
        evidence: {
          file: ctx.agentsMd.filePath,
          line: convention.lineNumber,
          snippet: convention.raw
        },
        remediation: `Create the "${expectedDir}/" directory, or update the convention in AGENTS.md.`
      };
    }
    return null;
  },
  async checkFilenameCase(convention, ctx, caseType) {
    const sourceFiles = await fg3("src/**/*.{ts,js,tsx,jsx}", {
      cwd: ctx.repo.root,
      ignore: ["node_modules/**", "dist/**", "**/*.d.ts"]
    });
    const violations = sourceFiles.filter((file) => {
      const name = basename2(file).replace(/\.(ts|js|tsx|jsx)$/, "");
      return !this.matchesCase(name, caseType);
    });
    const violationRate = violations.length / Math.max(sourceFiles.length, 1);
    if (violationRate < 0.2) return null;
    return {
      ruleId: this.id,
      severity: "warning",
      message: `AGENTS.md states ${caseType}-case filenames, but ${violations.length} of ${sourceFiles.length} source files do not conform.`,
      evidence: {
        file: ctx.agentsMd.filePath,
        line: convention.lineNumber,
        snippet: `Examples: ${violations.slice(0, 3).join(", ")}`
      },
      remediation: `Rename non-conforming files to use ${caseType}-case, or update the convention in AGENTS.md.`
    };
  },
  matchesCase(name, caseType) {
    switch (caseType) {
      case "kebab":
        return /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/.test(name);
      case "camel":
        return /^[a-z][a-zA-Z0-9]*$/.test(name);
      case "pascal":
        return /^[A-Z][a-zA-Z0-9]*$/.test(name);
      case "snake":
        return /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(name);
    }
  }
};
export {
  AgentsMdParser,
  RepoScanner,
  RuleEngine,
  WorkspaceJsonValidator,
  computeHygieneScore,
  conventionMismatch,
  frameworkDrift,
  missingFileReference,
  patternZeroMatch,
  sectionStaleness
};
