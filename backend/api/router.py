from fastapi import APIRouter
from api.routes import health, reports, legacy_pptx, executive, dashboard

api_router = APIRouter()

api_router.include_router(health.router)
api_router.include_router(reports.router)
api_router.include_router(legacy_pptx.router)
api_router.include_router(executive.router)
api_router.include_router(dashboard.router)

