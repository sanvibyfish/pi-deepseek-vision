import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type AnalysisLanguage = "zh" | "en" | "auto";

export interface VisionModelConfig {
	provider: string;
	id: string;
}

export interface DeepSeekVisionConfig {
	visionModel: VisionModelConfig;
	targetModels: string[];
	/** Optional provider allowlist. Undefined means any provider is allowed (default). */
	targetProviders?: string[];
	language: AnalysisLanguage;
	maxAnalysisChars: number;
	cache: {
		capacity: number;
		ttlSeconds: number;
	};
}

export const DEFAULT_CONFIG_PATH = join(homedir(), ".pi", "agent", "deepseek-vision.json");

export const DEFAULT_CONFIG: Omit<DeepSeekVisionConfig, "visionModel"> = {
	targetModels: ["deepseek-v4-pro", "deepseek-v4-flash"],
	language: "auto",
	maxAnalysisChars: 20_000,
	cache: {
		capacity: 128,
		ttlSeconds: 900,
	},
};

type JsonObject = Record<string, unknown>;

export class ConfigError extends Error {
	constructor(detail: string) {
		super(`DeepSeek vision config: ${detail}`);
		this.name = "ConfigError";
	}
}

function fail(detail: string): never {
	throw new ConfigError(detail);
}

function objectValue(value: unknown, field: string): JsonObject {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		fail(`${field} must be an object`);
	}
	return value as JsonObject;
}

function rejectUnknownKeys(value: JsonObject, allowed: readonly string[], field: string): void {
	const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
	if (unknown.length > 0) {
		fail(`${field} contains unknown field ${JSON.stringify(unknown[0])}`);
	}
}

function nonEmptyString(value: unknown, field: string): string {
	if (typeof value !== "string" || value.trim().length === 0) {
		fail(`${field} must be a non-empty string`);
	}
	return value;
}

function positiveInteger(value: unknown, field: string): number {
	if (!Number.isSafeInteger(value) || (value as number) <= 0) {
		fail(`${field} must be a positive safe integer`);
	}
	return value as number;
}

export function loadTargetModels(path = DEFAULT_CONFIG_PATH): string[] {
	let source: string;
	try {
		source = readFileSync(path, "utf8");
	} catch {
		fail("file could not be read; check that it exists and is readable");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		fail("file must contain valid JSON");
	}

	const root = objectValue(parsed, "root");
	if (root.targetModels === undefined) {
		return [...DEFAULT_CONFIG.targetModels];
	}
	if (!Array.isArray(root.targetModels) || root.targetModels.length === 0) {
		fail("targetModels must be a non-empty array");
	}
	const targetModels = root.targetModels.map((model, index) =>
		nonEmptyString(model, `targetModels[${index}]`),
	);
	if (new Set(targetModels).size !== targetModels.length) {
		fail("targetModels must not contain duplicates");
	}
	return targetModels;
}

export function loadConfig(path = DEFAULT_CONFIG_PATH): DeepSeekVisionConfig {
	let source: string;
	try {
		source = readFileSync(path, "utf8");
	} catch {
		fail("file could not be read; check that it exists and is readable");
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		fail("file must contain valid JSON");
	}

	const root = objectValue(parsed, "root");
	rejectUnknownKeys(
		root,
		["visionModel", "targetModels", "targetProviders", "language", "maxAnalysisChars", "cache"],
		"root",
	);

	const visionModelValue = objectValue(root.visionModel, "visionModel");
	rejectUnknownKeys(visionModelValue, ["provider", "id"], "visionModel");
	const visionModel: VisionModelConfig = {
		provider: nonEmptyString(visionModelValue.provider, "visionModel.provider"),
		id: nonEmptyString(visionModelValue.id, "visionModel.id"),
	};

	let targetModels = [...DEFAULT_CONFIG.targetModels];
	if (root.targetModels !== undefined) {
		if (!Array.isArray(root.targetModels) || root.targetModels.length === 0) {
			fail("targetModels must be a non-empty array");
		}
		targetModels = root.targetModels.map((model, index) =>
			nonEmptyString(model, `targetModels[${index}]`),
		);
		if (new Set(targetModels).size !== targetModels.length) {
			fail("targetModels must not contain duplicates");
		}
	}

	let targetProviders: string[] | undefined;
	if (root.targetProviders !== undefined) {
		if (!Array.isArray(root.targetProviders) || root.targetProviders.length === 0) {
			fail("targetProviders must be a non-empty array");
		}
		targetProviders = root.targetProviders.map((provider, index) =>
			nonEmptyString(provider, `targetProviders[${index}]`),
		);
		if (new Set(targetProviders).size !== targetProviders.length) {
			fail("targetProviders must not contain duplicates");
		}
	}

	let language = DEFAULT_CONFIG.language;
	if (root.language !== undefined) {
		if (root.language !== "zh" && root.language !== "en" && root.language !== "auto") {
			fail('language must be one of "zh", "en", or "auto"');
		}
		language = root.language;
	}

	const maxAnalysisChars =
		root.maxAnalysisChars === undefined
			? DEFAULT_CONFIG.maxAnalysisChars
			: positiveInteger(root.maxAnalysisChars, "maxAnalysisChars");

	let cache = { ...DEFAULT_CONFIG.cache };
	if (root.cache !== undefined) {
		const cacheValue = objectValue(root.cache, "cache");
		rejectUnknownKeys(cacheValue, ["capacity", "ttlSeconds"], "cache");
		cache = {
			capacity:
				cacheValue.capacity === undefined
					? DEFAULT_CONFIG.cache.capacity
					: positiveInteger(cacheValue.capacity, "cache.capacity"),
			ttlSeconds:
				cacheValue.ttlSeconds === undefined
					? DEFAULT_CONFIG.cache.ttlSeconds
					: positiveInteger(cacheValue.ttlSeconds, "cache.ttlSeconds"),
		};
	}

	return { visionModel, targetModels, targetProviders, language, maxAnalysisChars, cache };
}
