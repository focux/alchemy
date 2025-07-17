import type { Secret } from "../secret.ts";
import { withExponentialBackoff } from "../util/retry.ts";
import { logger } from "../util/logger.ts";

export interface CoolifyClientOptions {
  /**
   * Coolify instance URL (e.g., http://localhost:8000)
   * Defaults to COOLIFY_URL environment variable
   */
  url?: string;

  /**
   * API token for authentication
   * Defaults to COOLIFY_API_TOKEN environment variable
   */
  apiToken?: Secret | string;
}

export interface CoolifyClient {
  /**
   * Base URL of the Coolify instance
   */
  readonly url: string;

  /**
   * Make an authenticated request to the Coolify API
   */
  fetch<T = any>(path: string, options?: RequestInit): Promise<T>;
}

/**
 * Creates a Coolify API client
 */
export function createCoolifyClient(
  options: CoolifyClientOptions = {},
): CoolifyClient {
  const url = options.url || process.env.COOLIFY_URL;
  if (!url) {
    throw new Error(
      "Coolify URL is required. Provide it via the url parameter or set the COOLIFY_URL environment variable.",
    );
  }

  let apiToken: string;
  if (options.apiToken) {
    apiToken =
      typeof options.apiToken === "string"
        ? options.apiToken
        : options.apiToken.unencrypted;
  } else {
    const envToken = process.env.COOLIFY_API_TOKEN;
    if (!envToken) {
      throw new Error(
        "Coolify API token is required. Provide it via the apiToken parameter or set the COOLIFY_API_TOKEN environment variable.",
      );
    }
    apiToken = envToken;
  }

  // Normalize URL (remove trailing slash)
  const baseUrl = url.endsWith("/") ? url.slice(0, -1) : url;

  return {
    url: baseUrl,
    fetch: async <T = any>(
      path: string,
      options: RequestInit = {},
    ): Promise<T> => {
      const fullUrl = `${baseUrl}/api/v1${path}`;

      const headers = new Headers(options.headers);
      headers.set("Authorization", `Bearer ${apiToken}`);
      headers.set("Accept", "application/json");

      if (options.body && typeof options.body === "string") {
        headers.set("Content-Type", "application/json");
      }

      const fetchOptions: RequestInit = {
        ...options,
        headers,
      };

      return withCoolifyRetry(async () => {
        const response = await fetch(fullUrl, fetchOptions);

        if (!response.ok) {
          await handleCoolifyError(response, path);
        }

        // Handle empty responses
        const contentLength = response.headers.get("content-length");
        if (contentLength === "0" || response.status === 204) {
          return {} as T;
        }

        try {
          return await response.json();
        } catch (error) {
          // Some endpoints return text instead of JSON
          const text = await response.text();
          return text as unknown as T;
        }
      });
    },
  };
}

/**
 * Handles Coolify API errors
 */
async function handleCoolifyError(
  response: Response,
  path: string,
): Promise<never> {
  let errorData: any;
  try {
    errorData = await response.json();
  } catch {
    errorData = { message: await response.text() };
  }

  const message =
    errorData.message ||
    errorData.error ||
    `Request failed: ${response.statusText}`;

  logger.error(`Coolify API error on ${path}:`, {
    status: response.status,
    statusText: response.statusText,
    error: errorData,
  });

  // Handle specific error cases
  if (response.status === 404) {
    throw new CoolifyNotFoundError(message, path);
  }

  if (response.status === 409) {
    throw new CoolifyConflictError(message, path);
  }

  if (response.status === 400) {
    throw new CoolifyValidationError(message, errorData);
  }

  if (response.status === 401) {
    throw new CoolifyAuthError("Invalid or missing API token");
  }

  if (response.status === 429) {
    throw new CoolifyRateLimitError(message);
  }

  throw new CoolifyApiError(message, response.status, errorData);
}

/**
 * Base error class for Coolify API errors
 */
export class CoolifyApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly data?: any,
  ) {
    super(message);
    this.name = "CoolifyApiError";
  }
}

/**
 * Resource not found error
 */
export class CoolifyNotFoundError extends CoolifyApiError {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message, 404);
    this.name = "CoolifyNotFoundError";
  }
}

/**
 * Resource conflict error (e.g., already exists)
 */
export class CoolifyConflictError extends CoolifyApiError {
  constructor(
    message: string,
    public readonly path: string,
  ) {
    super(message, 409);
    this.name = "CoolifyConflictError";
  }
}

/**
 * Validation error
 */
export class CoolifyValidationError extends CoolifyApiError {
  constructor(
    message: string,
    public readonly errors: any,
  ) {
    super(message, 400, errors);
    this.name = "CoolifyValidationError";
  }
}

/**
 * Authentication error
 */
export class CoolifyAuthError extends CoolifyApiError {
  constructor(message: string) {
    super(message, 401);
    this.name = "CoolifyAuthError";
  }
}

/**
 * Rate limit error
 */
export class CoolifyRateLimitError extends CoolifyApiError {
  constructor(message: string) {
    super(message, 429);
    this.name = "CoolifyRateLimitError";
  }
}

/**
 * Determines if a Coolify error should trigger a retry
 */
function isCoolifyRetryableError(error: any): boolean {
  return (
    error instanceof CoolifyRateLimitError ||
    (error instanceof CoolifyApiError && error.status >= 500)
  );
}

/**
 * Wraps a Coolify API operation with retry logic
 */
async function withCoolifyRetry<T>(
  operation: () => Promise<T>,
  maxAttempts = 5,
  initialDelayMs = 1000,
): Promise<T> {
  return withExponentialBackoff(
    operation,
    isCoolifyRetryableError,
    maxAttempts,
    initialDelayMs,
  );
}

/**
 * Helper to determine if a Coolify error is a "not found" error
 */
export function isCoolifyNotFoundError(error: any): boolean {
  return error instanceof CoolifyNotFoundError || error?.status === 404;
}

/**
 * Helper to determine if a Coolify error is a conflict error
 */
export function isCoolifyConflictError(error: any): boolean {
  return error instanceof CoolifyConflictError || error?.status === 409;
}
