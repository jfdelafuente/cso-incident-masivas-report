import time
import uuid
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from core.config import settings


def get_request_id(request: Request) -> str:
    """Extrae o genera un identificador único de petición para trazabilidad."""
    return (
        getattr(request.state, "request_id", None)
        or request.headers.get("X-Request-ID")
        or f"req-{uuid.uuid4().hex[:10]}"
    )


def setup_middlewares(app: FastAPI) -> None:
    """Configura los middlewares de CORS y trazabilidad de peticiones."""

    # 1. CORS Middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.ALLOWED_ORIGINS,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["X-Request-ID", "X-Process-Time"],
    )

    # 2. Trazabilidad End-to-End (X-Request-ID y X-Process-Time)
    @app.middleware("http")
    async def trace_request_middleware(request: Request, call_next):
        req_id = request.headers.get("X-Request-ID") or f"req-{uuid.uuid4().hex[:10]}"
        request.state.request_id = req_id
        start_ts = time.perf_counter()
        try:
            response = await call_next(request)
            elapsed_ms = (time.perf_counter() - start_ts) * 1000.0
            response.headers["X-Request-ID"] = req_id
            response.headers["X-Process-Time"] = f"{elapsed_ms:.1f}ms"
            if request.url.path.startswith("/api/"):
                print(f"  [{req_id}] {request.method} {request.url.path} -> {response.status_code} ({elapsed_ms:.1f}ms)")
            return response
        except Exception as exc:
            elapsed_ms = (time.perf_counter() - start_ts) * 1000.0
            print(f"  [{req_id}] ERROR {request.method} {request.url.path} ({elapsed_ms:.1f}ms): {exc}")
            raise

