import { describe, expect, it, vi } from "vitest";
import { AnalysisCache, createVisionCacheKey } from "../src/cache.js";

describe("AnalysisCache", () => {
	it("returns a cached analysis before its TTL expires", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const cache = new AnalysisCache(2, 10);
		cache.set("group", "analysis");
		vi.setSystemTime(9_999);

		expect(cache.get("group")).toBe("analysis");
		vi.useRealTimers();
	});

	it("expires an analysis at the configured TTL", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const cache = new AnalysisCache(2, 10);
		cache.set("group", "analysis");
		vi.setSystemTime(10_000);

		expect(cache.get("group")).toBeUndefined();
		vi.useRealTimers();
	});

	it("evicts the least recently used analysis at capacity", () => {
		const cache = new AnalysisCache(2, 60);
		cache.set("first", "one");
		cache.set("second", "two");
		expect(cache.get("first")).toBe("one");
		cache.set("third", "three");

		expect(cache.get("second")).toBeUndefined();
		expect(cache.get("first")).toBe("one");
		expect(cache.get("third")).toBe("three");
	});

	it("removes expired entries before evicting an active least recently used analysis", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const cache = new AnalysisCache(2, 10);
		cache.set("expired", "old");
		vi.setSystemTime(5_000);
		cache.set("active", "current");
		vi.setSystemTime(6_000);
		expect(cache.get("expired")).toBe("old");

		vi.setSystemTime(10_000);
		cache.set("new", "latest");

		expect(cache.get("expired")).toBeUndefined();
		expect(cache.get("active")).toBe("current");
		expect(cache.get("new")).toBe("latest");
		vi.useRealTimers();
	});
});

describe("createVisionCacheKey", () => {
	const firstImage = { type: "image" as const, data: "secret-base64-a", mimeType: "image/png" };
	const secondImage = { type: "image" as const, data: "secret-base64-b", mimeType: "image/jpeg" };
	const base = {
		images: [firstImage, secondImage],
		visionModel: { provider: "openai", id: "gpt-5.6-luna" },
		language: "auto" as const,
		promptVersion: "v1",
	};

	it("is stable without retaining image bytes or prompts", () => {
		const key = createVisionCacheKey(base);

		expect(createVisionCacheKey(base)).toBe(key);
		expect(key).not.toContain(firstImage.data);
		expect(key).not.toContain(secondImage.data);
	});

	it("isolates image order, model, language and prompt version", () => {
		const key = createVisionCacheKey(base);

		expect(createVisionCacheKey({ ...base, images: [secondImage, firstImage] })).not.toBe(key);
		expect(
			createVisionCacheKey({ ...base, visionModel: { provider: "anthropic", id: "claude" } }),
		).not.toBe(key);
		expect(createVisionCacheKey({ ...base, language: "en" })).not.toBe(key);
		expect(createVisionCacheKey({ ...base, promptVersion: "v2" })).not.toBe(key);
	});

	it("ignores the prompt by default so the same image is reused across turns", () => {
		const key = createVisionCacheKey(base);

		expect(createVisionCacheKey({ ...base, focus: "first question" })).not.toBe(key);
		expect(createVisionCacheKey({ ...base, focus: "another question" })).not.toBe(key);
	});

	it("includes the focus in the key only for explicit reanalysis", () => {
		const focusKey = createVisionCacheKey({ ...base, focus: "look at the buttons again" });

		expect(focusKey).not.toBe(createVisionCacheKey(base));
		expect(createVisionCacheKey({ ...base, focus: "look at the buttons again" })).toBe(
			focusKey,
		);
		expect(createVisionCacheKey({ ...base, focus: "transcribe the text instead" })).not.toBe(
			focusKey,
		);
	});
});
