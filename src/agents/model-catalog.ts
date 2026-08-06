import type { GatewayInstance, ModelInfo } from '../gateways/index.js';
import { withGatewayEnvAsync } from '../gateways/index.js';
import type { AgentLauncher } from './index.js';

/** Loads a gateway's complete model list only for launchers whose own UI needs it. */
export async function loadGatewayModelCatalog(
  agent: AgentLauncher,
  gateway: GatewayInstance,
): Promise<ModelInfo[] | undefined> {
  if (agent.modelCatalogMode !== 'gateway') {
    return undefined;
  }

  try {
    return await withGatewayEnvAsync({ fields: gateway.fields }, async () => {
      return await gateway.gateway.listModels(gateway.apiKey, gateway.fields);
    });
  } catch (_e) {
    // Launch can still proceed with its selected model when discovery is offline.
    return undefined;
  }
}
