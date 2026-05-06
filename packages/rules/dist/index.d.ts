import { WorkspaceJson } from '@workspacejson/spec';

type Severity = 'error' | 'warning' | 'info';
type RuleCategory = 'staleness' | 'integrity' | 'consistency' | 'coverage' | 'drift';
interface Finding {
    ruleId: string;
    severity: Severity;
    message: string;
    evidence: {
        file?: string;
        line?: number;
        snippet?: string;
        path?: string;
    };
    remediation?: string;
}
interface Rule {
    id: string;
    category: RuleCategory;
    severity: Severity;
    description: string;
    evaluate(ctx: RuleContext): Promise<Finding[]>;
}
interface RuleContext {
    agentsMd: ParsedAgentsMd;
    workspace?: WorkspaceJson;
    repo: RepoState;
    config: AuditConfig;
}
interface ParsedAgentsMd {
    raw: string;
    filePath: string;
    lastModified: Date;
    sections: AgentsMdSection[];
    filePaths: string[];
    frameworkTokens: string[];
    conventions: ConventionEntry[];
    patterns: PatternEntry[];
}
interface AgentsMdSection {
    heading: string;
    depth: number;
    content: string;
    lineStart: number;
    lineEnd: number;
}
interface ConventionEntry {
    raw: string;
    type: 'filename-case' | 'directory-layout' | 'naming' | 'structural' | 'other';
    canonical: string;
    lineNumber: number;
}
interface PatternEntry {
    raw: string;
    glob?: string;
    lineNumber: number;
}
interface RepoState {
    root: string;
    files: string[];
    isMonorepo: boolean;
    packages: PackageInfo[];
    manifests: ManifestInfo[];
    gitHistory: GitHistory;
}
interface PackageInfo {
    name: string;
    path: string;
    agentsMd?: string;
}
interface ManifestInfo {
    type: 'package.json' | 'pyproject.toml' | 'requirements.txt' | 'Cargo.toml' | 'go.mod' | 'Gemfile';
    path: string;
    dependencies: string[];
}
interface GitHistory {
    agentsMdLastModified: Date;
    nonAgentsCommitCount30Days: number;
    filesChangedLast30Days: string[];
}
interface AuditConfig {
    stalenessThresholdDays: number;
    highActivityCommitCount: number;
    conventionMismatchPrecisionMode: boolean;
    failOn: Severity | null;
    save: boolean;
    reportDir: string;
    ignore: string[];
}
interface AuditResult {
    findings: Finding[];
    score: HygieneScore;
    agentsMdPath: string;
    workspaceJsonFound: boolean;
    workspaceJsonStale: boolean;
    workspaceJsonStatus: 'missing' | 'invalid' | 'stale' | 'fresh';
    workspaceJsonErrors: string[];
    runAt: Date;
    durationMs: number;
}
interface HygieneScore {
    value: number;
    grade: 'A' | 'B' | 'C' | 'D' | 'F';
    errorCount: number;
    warningCount: number;
    infoCount: number;
}

declare class RuleEngine {
    private rules;
    register(rule: Rule): void;
    run(ctx: RuleContext): Promise<{
        findings: Finding[];
        durationMs: number;
    }>;
}
declare function computeHygieneScore(findings: Finding[]): HygieneScore;

declare class AgentsMdParser {
    parse(filePath: string, content: string): Promise<ParsedAgentsMd>;
    private extractSections;
    private extractFilePaths;
    private extractFrameworkTokens;
    private extractConventions;
    private dedupeConventions;
    private extractPatterns;
    private looksLikeFilePath;
    private looksLikeGlob;
    private classifyConventionType;
    private extractCaseConvention;
    private findLineNumber;
    private getFileModifiedDate;
}

declare class RepoScanner {
    scan(root: string): Promise<RepoState>;
    private getTrackedFiles;
    private getPackages;
    private getManifests;
    private readDependencies;
    private getGitHistory;
}

declare class WorkspaceJsonValidator {
    private readonly ajv;
    private readonly validateFn;
    constructor();
    validate(value: unknown): {
        valid: boolean;
        errors: string[];
    };
}

declare const missingFileReference: Rule;

declare const patternZeroMatch: Rule;

declare const frameworkDrift: Rule;

declare const sectionStaleness: Rule;

interface ConventionMismatchRule extends Rule {
    checkConvention(convention: ConventionEntry, ctx: RuleContext): Promise<Finding | null>;
    checkColocation(convention: ConventionEntry, ctx: RuleContext): Promise<Finding | null>;
    checkTestDirectory(convention: ConventionEntry, ctx: RuleContext, expectedDir: string): Promise<Finding | null>;
    checkSourceDirectory(convention: ConventionEntry, ctx: RuleContext, expectedDir: string): Promise<Finding | null>;
    checkFilenameCase(convention: ConventionEntry, ctx: RuleContext, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): Promise<Finding | null>;
    matchesCase(name: string, caseType: 'kebab' | 'camel' | 'pascal' | 'snake'): boolean;
}
declare const conventionMismatch: ConventionMismatchRule;

export { AgentsMdParser, type AuditConfig, type AuditResult, type ConventionEntry, type Finding, type GitHistory, type HygieneScore, type ManifestInfo, type PackageInfo, type ParsedAgentsMd, type PatternEntry, RepoScanner, type RepoState, type Rule, type RuleCategory, type RuleContext, RuleEngine, type Severity, WorkspaceJsonValidator, computeHygieneScore, conventionMismatch, frameworkDrift, missingFileReference, patternZeroMatch, sectionStaleness };
