import type { UIMessage } from '@nao/backend/chat';
import type { LlmSelectedModel } from '@nao/shared/types';

/** The model a conversation last ran on, as long as it can still be selected. */
export function findChatModel(
	messages: UIMessage[] | undefined,
	availableModels: LlmSelectedModel[] | undefined,
): LlmSelectedModel | null {
	const lastModel = findLastAssistantModel(messages ?? []);
	if (!lastModel || !availableModels?.some((model) => isSameModel(model, lastModel))) {
		return null;
	}
	return lastModel;
}

export function isSameModel(model: LlmSelectedModel, other: LlmSelectedModel | null): boolean {
	return !!other && model.provider === other.provider && model.modelId === other.modelId;
}

function findLastAssistantModel(messages: UIMessage[]): LlmSelectedModel | null {
	for (let index = messages.length - 1; index >= 0; index--) {
		const { role, llmProvider, llmModelId } = messages[index];
		if (role === 'assistant' && llmProvider && llmModelId) {
			return { provider: llmProvider, modelId: llmModelId };
		}
	}
	return null;
}
