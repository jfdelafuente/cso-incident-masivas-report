# Contracts: Despliegue y mantenimiento para operador junior

No se definen contratos nuevos en esta carpeta.

Esta feature no añade, modifica ni elimina ningún endpoint de `backend/main.py`, ni cambia `IncidentBase`/`ReportResponse`. El "contrato" más cercano que toca son los subcomandos de línea de comandos ya existentes (`deploy.sh`, `service.sh {start|stop|restart|status}`, `maintenance.sh {backup|restore|rotate-logs|healthcheck}`), cuya interfaz (nombre de subcomando, argumentos) no cambia — solo se ajustan mensajes de consola y se añaden dos pasos internos a `deploy.sh` (backup automático, aviso de recurso compartido), sin alterar cómo se invoca ni qué código de salida devuelve.

Si una fase posterior necesitara un contrato real (por ejemplo, un endpoint HTTP de healthcheck agregado), este README debería sustituirse por esa definición.
