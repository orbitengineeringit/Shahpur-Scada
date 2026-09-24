/**
 * Secure error logging utility
 * Prevents leaking sensitive information to browser console in production
 */

const isDevelopment = import.meta.env.DEV;

interface LogOptions {
  showToast?: boolean;
  toastMessage?: string;
}

/**
 * Logs errors safely without exposing sensitive details in production
 * In development mode, full error details are logged
 * In production, only generic messages are shown
 */
export const logError = (context: string, error: unknown, options: LogOptions = {}) => {
  // In development, log full error for debugging
  if (isDevelopment) {
    console.error(`[${context}]`, error);
  } else {
    // In production, log only the context without sensitive details
    console.error(`[${context}] An error occurred`);
  }

  // Optional toast notification with generic message
  if (options.showToast) {
    // Toast import would be circular, so we just log here
    // Callers can handle toast separately if needed
    console.warn(`[${context}] ${options.toastMessage || 'Operation failed'}`);
  }
};

/**
 * Logs debug information only in development mode
 */
export const logDebug = (context: string, ...args: unknown[]) => {
  if (isDevelopment) {
    console.log(`[${context}]`, ...args);
  }
};

/**
 * Logs warnings - sanitized in production
 */
export const logWarn = (context: string, message: string, details?: unknown) => {
  if (isDevelopment) {
    console.warn(`[${context}] ${message}`, details);
  } else {
    console.warn(`[${context}] ${message}`);
  }
};

/**
 * Safe info logging - only logged in development mode to prevent leaking internal details in production
 */
export const logInfo = (context: string, message: string) => {
  if (isDevelopment) {
    console.info(`[${context}] ${message}`);
  }
};

