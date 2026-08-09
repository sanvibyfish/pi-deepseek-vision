import type { ContextEvent } from "@earendil-works/pi-coding-agent";
import type { ImageContent, TextContent, ToolResultMessage, UserMessage } from "@earendil-works/pi-ai";

type ContextMessage = ContextEvent["messages"][number];
type ImageMessage = (UserMessage | ToolResultMessage) & {
	content: (TextContent | ImageContent)[];
};

export type VisionPromptGroup = {
	images: ImageContent[];
	messageText: string;
	taskIntent?: string;
};

function isImageContent(content: unknown): content is ImageContent {
	return (
		typeof content === "object" &&
		content !== null &&
		"type" in content &&
		content.type === "image"
	);
}

function isImageMessage(message: ContextMessage): message is ImageMessage {
	return (
		(message.role === "user" || message.role === "toolResult") &&
		Array.isArray(message.content) &&
		message.content.some(isImageContent)
	);
}

function messageText(message: UserMessage | ToolResultMessage): string {
	if (typeof message.content === "string") return message.content;
	return message.content
		.filter((part): part is TextContent => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}

export function containsImages(messages: ContextEvent["messages"]): boolean {
	return messages.some(
		(message) =>
			"content" in message &&
			Array.isArray(message.content) &&
			message.content.some(isImageContent),
	);
}

export async function rewriteImageMessages(
	messages: ContextEvent["messages"],
	analyze: (group: VisionPromptGroup) => Promise<string>,
): Promise<ContextEvent["messages"]> {
	if (!containsImages(messages)) return messages;

	const rewritten: ContextEvent["messages"] = [];
	let latestUserText: string | undefined;

	for (const message of messages) {
		if (message.role === "user") {
			latestUserText = messageText(message);
		}

		if (!isImageMessage(message)) {
			rewritten.push(message);
			continue;
		}

		const images = message.content
			.filter(isImageContent)
			.map((image) => ({ ...image }));
		const group: VisionPromptGroup = {
			images,
			messageText: messageText(message),
			...(message.role === "toolResult" && latestUserText !== undefined
				? { taskIntent: latestUserText }
				: {}),
		};
		const analysis = await analyze(group);

		let imageNumber = 0;
		const content = message.content.map((part): TextContent => {
			if (part.type === "text") return part;
			imageNumber += 1;
			return {
				type: "text",
				text: `[Image ${imageNumber} — analyzed by vision model]`,
			};
		});
		const imageNumbers = images.map((_, index) => index + 1).join(", ");
		content.push({
			type: "text",
			text:
				"[Vision preprocessing notice]\n" +
				"The target model cannot inspect image attachments directly. Use the supplied analysis as the visual content.\n\n" +
				`[${images.length === 1 ? "Image" : "Images"} ${imageNumbers} — Joint visual analysis]\n` +
				analysis,
		});

		rewritten.push({ ...message, content });
	}

	if (containsImages(rewritten)) {
		throw new Error("Image rewrite left ImageContent in the target model context");
	}

	return rewritten;
}
