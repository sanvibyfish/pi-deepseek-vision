import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ConfigError, DEFAULT_CONFIG, loadConfig, loadTargetModels } from "../src/config.js";

function writeConfig(value: unknown): string {
	const directory = mkdtempSync(join(tmpdir(), "pi-deepseek-vision-config-"));
	const path = join(directory, "deepseek-vision.json");
	writeFileSync(path, JSON.stringify(value));
	return path;
}

describe("loadConfig", () => {
	it("applies the confirmed defaults while requiring a vision model", () => {
		const config = loadConfig(
			writeConfig({ visionModel: { provider: "anthropic", id: "claude-sonnet-4-5" } }),
		);

		expect(config).toEqual({
			visionModel: { provider: "anthropic", id: "claude-sonnet-4-5" },
			...DEFAULT_CONFIG,
		});
	});

	it("accepts explicit target models, language, output and cache limits", () => {
		const config = loadConfig(
			writeConfig({
				visionModel: { provider: "openai", id: "gpt-5.6-luna" },
				targetModels: ["deepseek-custom"],
				language: "zh",
				maxAnalysisChars: 1000,
				cache: { capacity: 4, ttlSeconds: 30 },
			}),
		);

		expect(config.targetModels).toEqual(["deepseek-custom"]);
		expect(config.language).toBe("zh");
		expect(config.maxAnalysisChars).toBe(1000);
		expect(config.cache).toEqual({ capacity: 4, ttlSeconds: 30 });
	});

	it("leaves targetProviders unrestricted by default", () => {
		const config = loadConfig(
			writeConfig({ visionModel: { provider: "openai", id: "gpt-5.6-luna" } }),
		);

		expect(config.targetProviders).toBeUndefined();
	});

	it("accepts an explicit targetProviders allowlist", () => {
		const config = loadConfig(
			writeConfig({
				visionModel: { provider: "openai", id: "gpt-5.6-luna" },
				targetProviders: ["deepseek", "opencode-go"],
			}),
		);

		expect(config.targetProviders).toEqual(["deepseek", "opencode-go"]);
	});

	it.each([
		{ targetProviders: [] },
		{ targetProviders: [""] },
		{ targetProviders: ["deepseek", "deepseek"] },
	])("rejects invalid target providers: %j", (override) => {
		expect(() =>
			loadConfig(
				writeConfig({
					visionModel: { provider: "openai", id: "gpt-5.6-luna" },
					...override,
				}),
			),
		).toThrow(/deepseek vision config/i);
	});

	it.each([
		{},
		{ visionModel: { provider: "", id: "model" } },
		{ visionModel: { provider: "openai", id: "model" }, targetModels: [] },
		{ visionModel: { provider: "openai", id: "model" }, language: "fr" },
		{ visionModel: { provider: "openai", id: "model" }, maxAnalysisChars: 0 },
		{ visionModel: { provider: "openai", id: "model" }, cache: { capacity: 0, ttlSeconds: 1 } },
	])("rejects invalid configuration: %j", (value) => {
		expect(() => loadConfig(writeConfig(value))).toThrow(/deepseek vision config/i);
	});

	it.each([
		{ maxAnalysisChars: Number.MAX_SAFE_INTEGER + 1 },
		{ cache: { capacity: Number.MAX_SAFE_INTEGER + 1 } },
		{ cache: { ttlSeconds: Number.MAX_SAFE_INTEGER + 1 } },
	])("rejects unsafe integer limits: %j", (override) => {
		expect(() =>
			loadConfig(
				writeConfig({
					visionModel: { provider: "openai", id: "gpt-5.6-luna" },
					...override,
				}),
			),
		).toThrow(/positive safe integer/i);
	});

	it("keeps the configured TTL conversion finite", () => {
		const config = loadConfig(
			writeConfig({
				visionModel: { provider: "openai", id: "gpt-5.6-luna" },
				cache: { ttlSeconds: Number.MAX_SAFE_INTEGER },
			}),
		);

		expect(Number.isFinite(config.cache.ttlSeconds * 1000)).toBe(true);
	});

	it("reports safe actionable errors without exposing the resolved path or cause", () => {
		const missingPath = join(tmpdir(), "private-user-directory", "missing.json");

		try {
			loadConfig(missingPath);
			throw new Error("expected loadConfig to fail");
		} catch (error) {
			expect(error).toBeInstanceOf(ConfigError);
			expect((error as Error).message).toContain("check that it exists and is readable");
			expect((error as Error).message).not.toContain(missingPath);
			expect((error as Error & { cause?: unknown }).cause).toBeUndefined();
		}
	});
});

describe("loadTargetModels", () => {
	it("uses defaults without validating unrelated configuration fields", () => {
		const path = writeConfig({
			visionModel: { provider: "", id: "" },
			language: "invalid",
			unknownField: true,
		});

		expect(loadTargetModels(path)).toEqual(DEFAULT_CONFIG.targetModels);
	});

	it("reads explicit target models without validating unrelated fields", () => {
		const path = writeConfig({
			targetModels: ["deepseek-custom"],
			cache: { capacity: 0 },
		});

		expect(loadTargetModels(path)).toEqual(["deepseek-custom"]);
	});

	it.each([
		{ targetModels: [] },
		{ targetModels: [""] },
		{ targetModels: ["deepseek-custom", "deepseek-custom"] },
	])("rejects invalid target models: %j", (value) => {
		expect(() => loadTargetModels(writeConfig(value))).toThrow(ConfigError);
	});
});
