import { NextResponse } from "next/server";
import { httpStatusFor, type AppError, type Result } from "./result";

/** Turn a service `Result` into a JSON HTTP response, mapping error → status. */
export function respond<T>(
  result: Result<T>,
  transform?: (value: T) => unknown,
  okStatus = 200,
): NextResponse {
  if (result.ok) {
    const body = transform ? transform(result.value) : result.value;
    return NextResponse.json({ ok: true, data: body }, { status: okStatus });
  }
  return errorResponse(result.error);
}

export function errorResponse(error: AppError): NextResponse {
  return NextResponse.json(
    { ok: false, error: { code: error.code, message: error.message, details: error.details } },
    { status: httpStatusFor(error.code) },
  );
}

/** Safely parse a JSON body, returning null on malformed input. */
export async function readJson(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
