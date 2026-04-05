import type { OperationSupportTier } from './types';
import { getOperationDefinition } from './registry';

export function getOperationSupportTier(id: string): OperationSupportTier | undefined {
  return getOperationDefinition(id)?.supportTier;
}

export function isOperationSupported(id: string): boolean {
  const tier = getOperationSupportTier(id);
  return Boolean(tier && tier !== 'not_supported');
}

export function getOperationSupportEnvelope(id: string): {
  id: string;
  supportTier: OperationSupportTier;
  runtimeSensitive: boolean;
  summary?: string;
} | undefined {
  const definition = getOperationDefinition(id);
  if (!definition) return undefined;

  return {
    id: definition.id,
    supportTier: definition.supportTier,
    runtimeSensitive: definition.runtimeSensitive ?? false,
    summary: definition.uiHints?.summary,
  };
}
