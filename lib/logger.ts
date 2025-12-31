/**
 * Centralized logging utility for production-grade error tracking.
 *
 * In production, this integrates with monitoring services (Sentry, LogRocket, etc.)
 * In development, logs to console with full context for debugging.
 *
 * To enable Sentry:
 * 1. Install: npm install @sentry/nextjs
 * 2. Initialize Sentry in next.config.js or sentry.client.config.ts
 * 3. Uncomment the Sentry import and captureException calls below
 */

// import * as Sentry from '@sentry/nextjs';

const isProduction = process.env.NODE_ENV === 'production';

export interface LogContext {
  endpoint?: string;
  params?: Record<string, unknown>;
  userId?: string;
  component?: string;
  action?: string;
  [key: string]: unknown;
}

/**
 * Log an error with contextual metadata.
 * In production, sends to monitoring service. In development, logs to console.
 */
export function logError(
  error: unknown,
  message: string,
  context: LogContext = {}
): void {
  const errorObject = error instanceof Error ? error : new Error(String(error));
  const timestamp = new Date().toISOString();

  const logPayload = {
    message,
    error: {
      name: errorObject.name,
      message: errorObject.message,
      stack: errorObject.stack,
    },
    context,
    timestamp,
  };

  if (isProduction) {
    // Production: Send to monitoring service
    // Uncomment when Sentry is configured:
    // Sentry.captureException(errorObject, {
    //   extra: {
    //     message,
    //     ...context,
    //   },
    //   tags: {
    //     component: context.component,
    //     action: context.action,
    //   },
    // });

    // Structured console output for log aggregation services (CloudWatch, Datadog, etc.)
    console.error(JSON.stringify(logPayload));
  } else {
    // Development: Human-readable console output
    console.error(`[${timestamp}] ${message}`, {
      error: errorObject,
      context,
    });
  }
}

/**
 * Log a warning with contextual metadata.
 */
export function logWarning(
  message: string,
  context: LogContext = {}
): void {
  const timestamp = new Date().toISOString();

  if (isProduction) {
    console.warn(JSON.stringify({ level: 'warn', message, context, timestamp }));
  } else {
    console.warn(`[${timestamp}] ${message}`, context);
  }
}

/**
 * Log an info message (only in development or if explicitly enabled).
 */
export function logInfo(
  message: string,
  context: LogContext = {}
): void {
  if (!isProduction) {
    const timestamp = new Date().toISOString();
    console.info(`[${timestamp}] ${message}`, context);
  }
}
