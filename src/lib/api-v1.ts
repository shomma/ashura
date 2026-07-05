import { NextResponse } from 'next/server';

type ApiMeta = {
  requestId: string;
  timestamp: string;
};

type ErrorPayload = {
  code: string;
  message: string;
  details?: Record<string, unknown>;
};

function buildMeta(req: Request): ApiMeta {
  const headerId = req.headers.get('x-request-id');
  return {
    requestId: headerId && headerId.trim().length > 0 ? headerId : crypto.randomUUID(),
    timestamp: new Date().toISOString()
  };
}

export function ok<T>(req: Request, data: T, status = 200) {
  return NextResponse.json(
    {
      ok: true as const,
      data,
      meta: buildMeta(req),
      error: null
    },
    { status }
  );
}

export function fail(
  req: Request,
  status: number,
  code: string,
  message: string,
  details?: Record<string, unknown>
) {
  const error: ErrorPayload = { code, message };
  if (details) error.details = details;

  return NextResponse.json(
    {
      ok: false as const,
      data: null,
      meta: buildMeta(req),
      error
    },
    { status }
  );
}

