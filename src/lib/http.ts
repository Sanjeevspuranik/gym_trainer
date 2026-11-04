import { NextRequest, NextResponse } from "next/server";

const MAX_JSON_BYTES = 16_384;

export type ParsedJson =
  | { ok: true; value: Record<string, unknown> }
  | { ok: false; response: NextResponse };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function apiJson<T>(
  body: T,
  status = 200,
  additionalHeaders?: HeadersInit,
): NextResponse<T> {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...Object.fromEntries(new Headers(additionalHeaders).entries()),
    },
  });
}

export function apiError(
  message: string,
  status: number,
  headers?: HeadersInit,
): NextResponse {
  return apiJson({ error: message }, status, headers);
}

export async function safelyRunApi(
  event: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (error) {
    const errorCode =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof error.code === "string"
        ? error.code
        : undefined;
    console.error(
      JSON.stringify({
        event: "api_request_failed",
        route: event,
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorCode,
      }),
    );
    return apiError(
      "The service is temporarily unavailable. Please try again.",
      503,
    );
  }
}

export function sameOriginError(request: NextRequest): NextResponse | null {
  const origin = request.headers.get("origin");
  if (!origin) {
    return null;
  }

  const expectedHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    request.nextUrl.host;
  const expectedProtocol =
    request.headers.get("x-forwarded-proto")?.split(",")[0].trim() ??
    request.nextUrl.protocol.replace(/:$/, "");

  try {
    const originUrl = new URL(origin);
    if (
      originUrl.host.toLowerCase() === expectedHost.toLowerCase() &&
      originUrl.protocol === `${expectedProtocol}:` &&
      originUrl.username === "" &&
      originUrl.password === ""
    ) {
      return null;
    }
  } catch {
    return apiError("This request must come from the Gym Trainer app.", 403);
  }
  return apiError("This request must come from the Gym Trainer app.", 403);
}

export async function readJsonObject(request: NextRequest): Promise<ParsedJson> {
  const contentType = request.headers
    .get("content-type")
    ?.split(";", 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== "application/json") {
    return {
      ok: false,
      response: apiError("Send the request as application/json.", 415),
    };
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return {
        ok: false,
        response: apiError("Content-Length must be a valid number.", 400),
      };
    }
    if (Number(declaredLength) > MAX_JSON_BYTES) {
      return {
        ok: false,
        response: apiError("The request body is too large.", 413),
      };
    }
  }

  const bodyText = await request.text();
  if (new TextEncoder().encode(bodyText).byteLength > MAX_JSON_BYTES) {
    return {
      ok: false,
      response: apiError("The request body is too large.", 413),
    };
  }

  let body: unknown;
  try {
    body = JSON.parse(bodyText);
  } catch (error) {
    if (error instanceof SyntaxError) {
      return {
        ok: false,
        response: apiError("The request body is not valid JSON.", 400),
      };
    }
    throw error;
  }

  if (!isRecord(body)) {
    return {
      ok: false,
      response: apiError("The JSON body must be an object.", 400),
    };
  }
  return { ok: true, value: body };
}
