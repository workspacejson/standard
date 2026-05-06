export declare const workspaceJsonSchema: {
    readonly $schema: "https://json-schema.org/draft/2020-12/schema";
    readonly $id: "https://workspacejson.dev/schemas/agents.workspace.v1.json";
    readonly title: "agents.workspace.json";
    readonly type: "object";
    readonly required: readonly ["version"];
    readonly properties: {
        readonly version: {
            readonly type: "string";
        };
        readonly generatedAt: {
            readonly type: "string";
            readonly format: "date-time";
        };
        readonly repository: {
            readonly type: "string";
        };
        readonly packages: {
            readonly type: "array";
            readonly items: {
                readonly type: "object";
                readonly required: readonly ["path"];
                readonly properties: {
                    readonly name: {
                        readonly type: "string";
                    };
                    readonly path: {
                        readonly type: "string";
                    };
                };
                readonly additionalProperties: true;
            };
        };
        readonly metadata: {
            readonly type: "object";
            readonly additionalProperties: true;
        };
    };
    readonly additionalProperties: true;
};
