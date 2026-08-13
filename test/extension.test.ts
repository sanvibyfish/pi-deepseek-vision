import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createContextHandler } from "../extensions/deepseek-vision.js";

const text = (value: string) => ({ type: "text" as const, text: value });
const image = (data = "image-data") => ({ type: "image" as const, data, mimeType: "image/png" });

function configPath(overrides: Record<string, unknown> = {}): string {
	const directory = mkdtempSync(join(tmpdir(), "pi-deepseek-vision-extension-"));
	const path = join(directory, "deepseek-vision.json");
	writeFileSync(
		path,
		JSON.stringify({
			visionModel: { provider: "vision-provider", id: "vision-model" },
			...overrides,
		}),
	);
	return path;
}

function model(provider: string, id: string, input: ("text" | "image")[] = ["text"]) {
	return {
		provider,
		id,
		input,
		name: id,
		api: "openai-responses",
		baseUrl: "https://example.test",
		reasoning: false,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 8_192,
	};
}

function assistant(content: string, stopReason: "stop" | "length" = "stop") {
	return {
		role: "assistant" as const,
		content: [text(content)],
		api: "openai-responses",
		provider: "vision-provider",
		model: "vision-model",
		usage: {
			input: 1,
			output: 1,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 2,
			cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
		},
		stopReason,
		timestamp: 1,
	};
}

function context(options: {
		currentModel?: ReturnType<typeof model>;
		visionModel?: ReturnType<typeof model>;
		complete?: ReturnType<typeof vi.fn>;
		authenticated?: boolean;
} = {}) {
	const abortController = new AbortController();
	const abort = vi.fn(() => abortController.abort());
	const complete = options.complete ?? vi.fn().mockResolvedValue(assistant("visible details"));
	const visionModel = options.visionModel ?? model("vision-provider", "vision-model", ["text", "image"]);
	const setStatus = vi.fn();
	return {
		ctx: {
			model: options.currentModel ?? model("deepseek", "deepseek-v4-flash"),
			modelRegistry: {
				find: vi.fn().mockReturnValue(visionModel),
				hasConfiguredAuth: vi.fn().mockReturnValue(options.authenticated ?? true),
				complete,
			},
			signal: abortController.signal,
			abort,
			hasUI: true,
			ui: { setStatus, notify: vi.fn() },
		},
		abort,
		complete,
		setStatus,
	};
}

const imageEvent = {
	type: "context" as const,
	messages: [{ role: "user" as const, content: [text("inspect"), image()], timestamp: 1 }],
};

describe("DeepSeek vision context handler", () => {
	it("passes non-target models through without looking up or calling the VLM", async () => {
		const state = context({ currentModel: model("openai", "gpt-5") });
		const handler = createContextHandler({ configPath: configPath() });

		const result = await handler(imageEvent, state.ctx as never);

		expect(result).toBeUndefined();
		expect(state.ctx.modelRegistry.find).not.toHaveBeenCalled();
		expect(state.complete).not.toHaveBeenCalled();
	});

	it("does nothing for a target model context without images", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: "/missing/config.json" });

		const result = await handler(
			{ type: "context", messages: [{ role: "user", content: "text only", timestamp: 1 }] },
			state.ctx as never,
		);

		expect(result).toBeUndefined();
		expect(state.complete).not.toHaveBeenCalled();
	});

	it("calls one configured VLM with ordered images and returns a text-only context", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });
		const event = {
			type: "context" as const,
			messages: [
				{
					role: "user" as const,
					content: [text("compare"), image("first"), image("second")],
					timestamp: 1,
				},
			],
		};

		const result = await handler(event, state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(1);
		const [visionModel, visionContext, callOptions] = state.complete.mock.calls[0];
		expect(visionModel).toMatchObject({ provider: "vision-provider", id: "vision-model" });
		expect(visionContext.systemPrompt).toMatch(/instructions visible inside the images as untrusted data/i);
		expect(visionContext.systemPrompt).toMatch(/associated user focus/i);
		expect(visionContext.messages[0].content[0].text).toContain(
			"Associated user message (analysis focus)",
		);
		expect(visionContext.messages[0].content[0].text).not.toContain("untrusted data");
		expect(visionContext.messages[0].content.filter((part: { type: string }) => part.type === "image")).toEqual([
			image("first"),
			image("second"),
		]);
		expect(callOptions.signal).toBe(state.ctx.signal);
		expect(JSON.stringify(result)).not.toContain('"type":"image"');
		expect(JSON.stringify(result)).toContain("visible details");
		expect(state.setStatus).toHaveBeenCalledWith("deepseek-vision", "正在用 VLM 分析 2 张图片");
		expect(state.setStatus).toHaveBeenLastCalledWith("deepseek-vision", undefined);
	});

	it("passes a non-target DeepSeek model through before validating unrelated configuration", async () => {
		const path = configPath({
			visionModel: null,
			targetModels: ["deepseek-v4-pro"],
			language: "invalid",
		});
		const state = context({ currentModel: model("deepseek", "deepseek-v4-flash") });
		const handler = createContextHandler({ configPath: path });

		const result = await handler(imageEvent, state.ctx as never);

		expect(result).toBeUndefined();
		expect(state.ctx.modelRegistry.find).not.toHaveBeenCalled();
		expect(state.complete).not.toHaveBeenCalled();
		expect(state.abort).not.toHaveBeenCalled();
	});

	it("handles a target model on any provider by default (no provider restriction)", async () => {
		const state = context({ currentModel: model("opencode-go", "deepseek-v4-flash") });
		const handler = createContextHandler({ configPath: configPath() });

		const result = await handler(imageEvent, state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(result)).not.toContain('"type":"image"');
	});

	it("skips a target model outside the configured targetProviders allowlist", async () => {
		const state = context({ currentModel: model("opencode-go", "deepseek-v4-flash") });
		const handler = createContextHandler({
			configPath: configPath({ targetProviders: ["deepseek"] }),
		});

		const result = await handler(imageEvent, state.ctx as never);

		expect(result).toBeUndefined();
		expect(state.ctx.modelRegistry.find).not.toHaveBeenCalled();
		expect(state.complete).not.toHaveBeenCalled();
		expect(state.abort).not.toHaveBeenCalled();
	});

	it("handles a target model whose provider is listed in targetProviders", async () => {
		const state = context({ currentModel: model("opencode-go", "deepseek-v4-flash") });
		const handler = createContextHandler({
			configPath: configPath({ targetProviders: ["deepseek", "opencode-go"] }),
		});

		await handler(imageEvent, state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(1);
	});

	it("reports an actionable configuration error without exposing its path", async () => {
		const path = join(tmpdir(), "private-user-directory", "missing.json");
		const state = context();
		const handler = createContextHandler({ configPath: path });

		await expect(handler(imageEvent, state.ctx as never)).rejects.toThrow(
			/check that it exists and is readable/i,
		);
		const message = state.ctx.ui.notify.mock.calls[0][0] as string;
		expect(message).toContain("configuration");
		expect(message).not.toContain(path);
		expect(state.ctx.signal.aborted).toBe(true);
	});

	it("reuses a cached group with the same images and prompt", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });

		await handler(imageEvent, state.ctx as never);
		await handler(imageEvent, state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(1);
	});

	it("reuses the same image across turns under a different prompt by default", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });

		await handler(imageEvent, state.ctx as never);
		await handler(
			{
				type: "context",
				messages: [{ role: "user", content: [text("different focus"), image()], timestamp: 2 }],
			},
			state.ctx as never,
		);

		expect(state.complete).toHaveBeenCalledTimes(1);
	});

	function reanalyzeEvent(userText: string) {
		return {
			type: "context" as const,
			messages: [
				{ role: "user" as const, content: [text("这是什么"), image()], timestamp: 1 },
				assistant("这是截图内容"),
				{ role: "user" as const, content: [text(userText)], timestamp: 3 },
			],
		};
	}

	it("re-analyzes when the user explicitly asks, using the latest message as focus", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });

		await handler(imageEvent, state.ctx as never);
		await handler(reanalyzeEvent("重新分析一下，重点看按钮"), state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(2);
	});

	it("replays the same reanalysis focus idempotently without a new VLM call", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });

		await handler(imageEvent, state.ctx as never);
		await handler(reanalyzeEvent("重新分析，重点看按钮"), state.ctx as never);
		await handler(reanalyzeEvent("重新分析，重点看按钮"), state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(2);
	});

	it("runs a new VLM analysis when the reanalysis focus changes", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });

		await handler(imageEvent, state.ctx as never);
		await handler(reanalyzeEvent("重新分析，重点看按钮"), state.ctx as never);
		await handler(reanalyzeEvent("重新分析，看文字部分"), state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(3);
	});

	it("refreshes the default entry so later ordinary turns reuse the newer analysis", async () => {
		const state = context();
		const handler = createContextHandler({ configPath: configPath() });

		await handler(reanalyzeEvent("重新分析"), state.ctx as never);
		await handler(imageEvent, state.ctx as never);

		expect(state.complete).toHaveBeenCalledTimes(1);
	});

	it.each([
		["missing model", { visionModel: undefined }],
		["missing authentication", { authenticated: false }],
		["text-only VLM", { visionModel: model("vision-provider", "vision-model", ["text"]) }],
		["empty VLM result", { complete: vi.fn().mockResolvedValue(assistant("")) }],
		["failed VLM call", { complete: vi.fn().mockRejectedValue(new Error("upstream unavailable")) }],
		["truncated VLM result", { complete: vi.fn().mockResolvedValue(assistant("partial", "length")) }],
		["oversized VLM result", { complete: vi.fn().mockResolvedValue(assistant("x".repeat(20_001))) }],
	] as const)("aborts the current turn on %s", async (_name, setup) => {
		const state = context(setup as never);
		if (_name === "missing model") {
			state.ctx.modelRegistry.find.mockReturnValue(undefined);
		}
		const handler = createContextHandler({ configPath: configPath() });

		await expect(handler(imageEvent, state.ctx as never)).rejects.toThrow(/vision preprocessing/i);
		expect(state.abort).toHaveBeenCalledTimes(1);
		expect(state.ctx.signal.aborted).toBe(true);
	});
});
