import "server-only";
import Anthropic from "@anthropic-ai/sdk";

/** Default Claude model, used when no Azure Foundry deployment name is configured. */
export const DEFAULT_MODEL = "claude-opus-5";

export interface ResolvedClient {
  client: Anthropic;
  model: string;
}

/**
 * Azure AI Foundry (AZURE_FOUNDRY_*) and a direct Anthropic key are both
 * supported. Foundry's Claude deployments speak the Anthropic Messages API
 * over a resource-specific baseURL, but route by deployment name (not
 * DEFAULT_MODEL) and require an api-version query param — a direct
 * Anthropic key needs neither. Shared by every AI-backed API route so the
 * key/endpoint/model resolution lives in exactly one place.
 *
 * Precedence puts the pre-existing variables first, so adding AZURE_FOUNDRY_*
 * alongside a working AZURE_ANTHROPIC_API_KEY / AZURE_ENDPOINT deployment does
 * not silently redirect its traffic. A Foundry-only environment is unaffected —
 * only the case where *both* are set differs, and there the established
 * deployment wins.
 *
 * AZURE_FOUNDRY_API_VERSION is assumed to be a REST query parameter, the same
 * contract Azure OpenAI uses. If a deployment expects it as a header or in the
 * path, adjust `defaultQuery` below.
 */
export function resolveAnthropicClient(): ResolvedClient | null {
  const apiKey =
    process.env.AZURE_ANTHROPIC_API_KEY ??
    process.env.ANTHROPIC_API_KEY ??
    process.env.AZURE_FOUNDRY_API_KEY;
  if (!apiKey) return null;

  const baseURL = process.env.AZURE_ENDPOINT || process.env.AZURE_FOUNDRY_ENDPOINT || undefined;
  const apiVersion = process.env.AZURE_FOUNDRY_API_VERSION;
  const model = process.env.AZURE_FOUNDRY_MODEL || DEFAULT_MODEL;

  const client = new Anthropic({
    apiKey,
    baseURL,
    defaultQuery: apiVersion ? { "api-version": apiVersion } : undefined,
  });
  return { client, model };
}

export const NO_KEY_ERROR =
  "The AI Assistant needs an API key. Set AZURE_FOUNDRY_API_KEY (with AZURE_FOUNDRY_ENDPOINT) or ANTHROPIC_API_KEY in the server environment, then restart the dev server.";
