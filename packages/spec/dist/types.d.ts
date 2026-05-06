export interface WorkspacePackage {
    name?: string;
    path: string;
    [key: string]: unknown;
}
export interface WorkspaceJson {
    version: string;
    generatedAt?: string;
    repository?: string;
    packages?: WorkspacePackage[];
    metadata?: Record<string, unknown>;
    [key: string]: unknown;
}
