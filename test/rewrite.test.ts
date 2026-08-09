import { describe, expect, it, vi } from "vitest";
import { containsImages, rewriteImageMessages } from "../src/rewrite.js";

const image = (data: string, mimeType = "image/png") => ({ type: "image" as const, data, mimeType });
const text = (value: string) => ({ type: "text" as const, text: value });

describe("rewriteImageMessages", () => {
	it("does not modify a context without images", async () => {
		const messages = [{ role: "user" as const, content: "hello", timestamp: 1 }];
		const analyze = vi.fn();

		const result = await rewriteImageMessages(messages, analyze);

		expect(result).toBe(messages);
		expect(analyze).not.toHaveBeenCalled();
	});

	it("jointly analyzes ordered images in one user message and preserves other fields", async () => {
		const messages = [
			{
				role: "user" as const,
				content: [text("compare"), image("first"), text("with"), image("second", "image/jpeg")],
				timestamp: 123,
			},
		];
		const analyze = vi.fn().mockResolvedValue("joint result");

		const result = await rewriteImageMessages(messages, analyze);

		expect(analyze).toHaveBeenCalledTimes(1);
		expect(analyze.mock.calls[0][0]).toMatchObject({
			images: [image("first"), image("second", "image/jpeg")],
			messageText: "compare\nwith",
		});
		expect(result[0]).toMatchObject({ role: "user", timestamp: 123 });
		expect(JSON.stringify(result)).toContain("[Image 1 — analyzed by vision model]");
		expect(JSON.stringify(result)).toContain("[Image 2 — analyzed by vision model]");
		expect(JSON.stringify(result)).toContain("joint result");
		expect(containsImages(result)).toBe(false);
	});

	it("includes the latest user intent when analyzing a tool result", async () => {
		const messages = [
			{ role: "user" as const, content: "find the broken control", timestamp: 1 },
			{
				role: "toolResult" as const,
				toolCallId: "call-1",
				toolName: "read",
				content: [text("image.png"), image("tool-image")],
				isError: false,
				timestamp: 2,
			},
		];
		const analyze = vi.fn().mockResolvedValue("tool result analysis");

		const result = await rewriteImageMessages(messages, analyze);

		expect(analyze.mock.calls[0][0]).toMatchObject({
			messageText: "image.png",
			taskIntent: "find the broken control",
		});
		expect(result[1]).toMatchObject({
			role: "toolResult",
			toolCallId: "call-1",
			toolName: "read",
			isError: false,
		});
		expect(containsImages(result)).toBe(false);
	});

	it("analyzes different messages as separate prompt groups", async () => {
		const messages = [
			{ role: "user" as const, content: [text("first prompt"), image("same")], timestamp: 1 },
			{ role: "user" as const, content: [text("second prompt"), image("same")], timestamp: 2 },
		];
		const analyze = vi.fn().mockResolvedValue("analysis");

		await rewriteImageMessages(messages, analyze);

		expect(analyze).toHaveBeenCalledTimes(2);
	});

	it("propagates analysis failures instead of deleting or passing images", async () => {
		const messages = [
			{ role: "user" as const, content: [text("inspect"), image("data")], timestamp: 1 },
		];

		await expect(
			rewriteImageMessages(messages, async () => {
				throw new Error("vision failed");
			}),
		).rejects.toThrow("vision failed");
		expect(containsImages(messages)).toBe(true);
	});
});
