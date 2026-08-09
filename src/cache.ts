import { createHash } from "node:crypto";
import type { ImageContent } from "@earendil-works/pi-ai";

type CacheEntry = {
	analysis: string;
	expiresAt: number;
};

export type VisionCacheKeyInput = {
	images: readonly ImageContent[];
	prompt: string;
	visionModel: {
		provider: string;
		id: string;
	};
	language: "zh" | "en" | "auto";
	promptVersion: string;
};

export class AnalysisCache {
	private readonly entries = new Map<string, CacheEntry>();
	private readonly ttlMilliseconds: number;

	constructor(
		private readonly capacity: number,
		ttlSeconds: number,
	) {
		if (!Number.isInteger(capacity) || capacity <= 0) {
			throw new RangeError("Analysis cache capacity must be a positive integer");
		}
		if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
			throw new RangeError("Analysis cache TTL must be a positive number of seconds");
		}
		this.ttlMilliseconds = ttlSeconds * 1_000;
	}

	get(key: string): string | undefined {
		const entry = this.entries.get(key);
		if (!entry) return undefined;

		if (Date.now() >= entry.expiresAt) {
			this.entries.delete(key);
			return undefined;
		}

		this.entries.delete(key);
		this.entries.set(key, entry);
		return entry.analysis;
	}

	set(key: string, analysis: string): void {
		const now = Date.now();
		for (const [cachedKey, entry] of this.entries) {
			if (now >= entry.expiresAt) {
				this.entries.delete(cachedKey);
			}
		}

		this.entries.delete(key);
		this.entries.set(key, {
			analysis,
			expiresAt: now + this.ttlMilliseconds,
		});

		if (this.entries.size > this.capacity) {
			const leastRecentlyUsedKey = this.entries.keys().next().value;
			if (leastRecentlyUsedKey !== undefined) {
				this.entries.delete(leastRecentlyUsedKey);
			}
		}
	}
}

export function createVisionCacheKey(input: VisionCacheKeyInput): string {
	const imageFingerprints = input.images.map((image) =>
		createHash("sha256").update(JSON.stringify([image.mimeType, image.data])).digest("hex"),
	);

	return createHash("sha256")
		.update(
			JSON.stringify([
				imageFingerprints,
				input.prompt,
				input.visionModel.provider,
				input.visionModel.id,
				input.language,
				input.promptVersion,
			]),
		)
		.digest("hex");
}
