from pydantic import BaseModel, ConfigDict, Field
from typing import List, Optional
from datetime import datetime

class IncidentBase(BaseModel):
    group: str = ""
    severity: str = "SL2"
    category: str = ""
    system: str = ""
    title: str = ""
    ticket: str = ""
    date: str = ""
    duration: str = ""
    impact: str = ""
    metrics: str = ""
    cause: str = ""
    solution: str = ""
    actionPoints: str = ""
    cFTTH: str = ""
    cMobile: str = ""
    brands: str = ""
    ministry: bool = False
    platform: bool = False
    externalOrigin: bool = False
    featured: bool = False

class ReportCreate(BaseModel):
    # Accepts either `created_by` or `createdBy` -- the latter is what a
    # previously-exported report (GET .../export, or the editor's "Guardar
    # JSON") has, since ReportResponse below outputs camelCase. This model
    # doubles as the import payload (see create_report()), so it needs to
    # round-trip its own export format.
    model_config = ConfigDict(populate_by_name=True)

    year: int
    week: int
    range: str
    dept: str
    incidents: List[IncidentBase] = []
    status: str = "draft"
    created_by: Optional[str] = Field(default=None, alias="createdBy")
    notes: Optional[str] = None

class ReportUpdate(BaseModel):
    range: Optional[str] = None
    dept: Optional[str] = None
    incidents: Optional[List[IncidentBase]] = None
    status: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(extra='allow')

class ReportResponse(BaseModel):
    id: str
    year: int
    week: int
    range: str
    dept: str
    incidents: List[IncidentBase]
    status: str
    createdBy: Optional[str] = None
    createdAt: Optional[str] = None
    updatedAt: Optional[str] = None
    notes: Optional[str] = None

    class Config:
        from_attributes = True


# ==============================================================================
# Modelos para Informes Ejecutivos PowerPoint (.pptx) - Feature 010 / OpenAPI v1
# Alineados con types/executiveReport.ts y ExecutiveIncidentData
# ==============================================================================

class ExecutiveActionPointSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='ignore')

    painPoint: str = Field(default="", alias="pain_point", description="Área o tipología del punto de dolor")
    description: str = Field(default="", description="Descripción de la acción preventiva o correctiva")
    owner: str = Field(default="—", description="Responsable de la acción")
    forecast: str = Field(default="—", description="Fecha comprometida o estado")


class ExecutiveTimelineEventSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='ignore')

    time: str = Field(default="", description="Hora o marca temporal del hito")
    event: str = Field(default="", description="Descripción de la actuación o evento")


class ExecutiveIncidentDataSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='allow')

    incidentRef: str = Field(default="INCIDENCIA", alias="incident_ref", description="Referencia de la incidencia (ej: INC0000123456)")
    title: str = Field(default="Incidencia", description="Título descriptivo de la incidencia")
    startTime: Optional[str] = Field(default="", alias="start_time", description="Fecha y hora de inicio")
    duration: Optional[str] = Field(default="", description="Duración total calculada")
    impactText: Optional[str] = Field(default="", alias="impact_text", description="Texto del impacto en el servicio")
    businessImpact: Optional[str] = Field(default="", alias="business_impact", description="Impacto económico o cualitativo de negocio")
    causeText: Optional[str] = Field(default="", alias="cause_text", description="Causa raíz identificada")
    solutionText: Optional[str] = Field(default="", alias="solution_text", description="Solución aplicada para la restauración y definitiva")
    actionPoints: List[ExecutiveActionPointSchema] = Field(default_factory=list, alias="action_points", description="Lista de puntos de acción relevantes")
    timelineEvents: List[ExecutiveTimelineEventSchema] = Field(default_factory=list, alias="timeline_events", description="Hitos cronológicos de la incidencia")
    sourceUrl: Optional[str] = Field(default="", alias="source_url", description="Enlace a la fuente original (Confluence / Remedy)")
    description: Optional[str] = Field(default=None, description="Descripción original de Jira o texto sin estructurar")
    rawContent: Optional[str] = Field(default=None, alias="raw_content", description="Contenido en bruto exportado de Confluence")


class ExecutiveReportRequestSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra='allow')

    incidentRef: str = Field(..., alias="incident_ref", description="Código identificador de la incidencia (ej: INC123456)")
    title: Optional[str] = Field(default=None, description="Título descriptivo opcional de la incidencia")
    confluenceUrl: Optional[str] = Field(default=None, alias="confluence_url", description="URL directa a la página Confluence del postmortem")
    rawContent: Optional[str] = Field(default=None, alias="raw_content", description="Contenido HTML o markdown exportado de Confluence")
    force: bool = Field(default=False, description="Forzar regeneración del informe aunque ya exista en caché")
    data: Optional[ExecutiveIncidentDataSchema] = Field(default=None, description="Datos detallados ya parseados si se envían directamente")


class ExecutiveReportResponseSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    success: bool = Field(..., description="Indica si la generación o consulta fue exitosa")
    incidentRef: str = Field(..., alias="incident_ref", description="Referencia de la incidencia procesada")
    filename: Optional[str] = Field(default=None, description="Nombre del fichero .pptx generado")
    downloadUrl: Optional[str] = Field(default=None, alias="download_url", description="URL relativa para descargar el PowerPoint")
    generatedAt: Optional[str] = Field(default=None, alias="generated_at", description="Fecha y hora ISO de generación")
    sizeBytes: Optional[int] = Field(default=None, alias="size_bytes", description="Tamaño del archivo en bytes")
    slideCount: Optional[int] = Field(default=3, alias="slide_count", description="Número de diapositivas generadas")
    cached: Optional[bool] = Field(default=False, description="True si se reutilizó un informe existente en disco")
    error: Optional[str] = Field(default=None, description="Mensaje de error si la operación falló")
    details: Optional[str] = Field(default=None, description="Detalles técnicos adicionales en caso de error")


class ExecutiveReportStatusResponseSchema(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    exists: bool = Field(..., description="Indica si el informe .pptx ya está generado y disponible en disco")
    incidentRef: str = Field(..., alias="incident_ref", description="Referencia de la incidencia consultada")
    filename: Optional[str] = Field(default=None, description="Nombre del archivo si existe")
    downloadUrl: Optional[str] = Field(default=None, alias="download_url", description="URL relativa para descarga")
    sizeBytes: Optional[int] = Field(default=None, alias="size_bytes", description="Tamaño del archivo en bytes")
    error: Optional[str] = Field(default=None, description="Detalle del error si ocurrió alguno")

