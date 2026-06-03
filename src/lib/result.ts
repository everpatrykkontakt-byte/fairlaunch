/**
 * A tiny typed Result. The whole service layer returns `Result` instead of
 * throwing, so every failure mode is part of the function signature and the
 * UI/API layers are forced to handle them. This is the backbone of the
 * "no surprises" reliability story.
 */

export type Ok<T> = { ok: true; value: T };
export type Err<E> = { ok: false; error: E };
export type Result<T, E = AppError> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}

/** Stable, machine-readable error codes shared by services and the API. */
export type AppErrorCode =
  | "not_found"
  | "validation"
  | "conflict" // optimistic-concurrency / state-machine violation
  | "slot_taken"
  | "no_slots"
  | "deadline_passed"
  | "insufficient_funds"
  | "already_done" // idempotency: the effect already happened
  | "forbidden"
  | "rate_limited"
  | "chain_error"
  | "internal";

export interface AppError {
  code: AppErrorCode;
  message: string;
  /** Optional structured detail, e.g. zod field issues. */
  details?: unknown;
}

export function appError(
  code: AppErrorCode,
  message: string,
  details?: unknown,
): AppError {
  return { code, message, details };
}

/** Map an error code to an HTTP status for the API layer. */
export function httpStatusFor(code: AppErrorCode): number {
  switch (code) {
    case "not_found":
      return 404;
    case "validation":
      return 400;
    case "conflict":
    case "slot_taken":
    case "no_slots":
    case "deadline_passed":
    case "already_done":
      return 409;
    case "insufficient_funds":
      return 402;
    case "forbidden":
      return 403;
    case "rate_limited":
      return 429;
    case "chain_error":
      return 502;
    case "internal":
    default:
      return 500;
  }
}
