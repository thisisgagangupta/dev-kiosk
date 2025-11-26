import os
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("clinic-os")

app = FastAPI(title="Clinic OS Backend", version="0.1.0")

# -------------------------
# CORS (demo-friendly)
# -------------------------
# Accept FRONTEND_URL and CORS_EXTRA=comma,separated,list from env.
raw_origins = list(filter(None, [
    os.getenv("FRONTEND_URL", "").strip(),
    *(o.strip() for o in os.getenv("CORS_EXTRA", "").split(",") if o.strip()),
    "http://localhost:5173", "http://127.0.0.1:5173",
    "http://localhost:8080", "http://127.0.0.1:8080",
]))

# If no explicit origins provided (typical demo), allow anything without credentials.
# NOTE: FastAPI does not allow allow_origins=["*"] when allow_credentials=True.
if raw_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=raw_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=86400,
    )
    log.info("CORS strict: %s", raw_origins)
else:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[],
        allow_origin_regex=r".*",
        allow_credentials=False,  # required for wildcard
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=86400,
    )
    log.warning("CORS permissive (demo mode): allow_origin_regex='.*', credentials=FALSE")

# -------------------------
# Health & root
# -------------------------
@app.get("/")
def root():
    return {"name": "Clinic OS Backend", "version": "0.1.0", "status": "ok"}

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/healthz")
def healthz():
    return {"status": "ok"}

# -------------------------
# Routers
# -------------------------
def _mount(router_import_path: str, prefix: str, human: str):
    try:
        module_path, obj_name = router_import_path.rsplit(":", 1)
        module = __import__(module_path, fromlist=[obj_name])
        router = getattr(module, obj_name)
        app.include_router(router, prefix=prefix)
        log.info("Mounted %s at %s/*", human, prefix)
    except Exception as e:
        log.exception("Failed to mount %s: %s", human, e)

# kiosk
_mount("app.kiosk.walkins:router", "/api", "kiosk walkins")
_mount("app.kiosk.identify:router", "/api", "kiosk identify")
_mount("app.kiosk.session:router", "/api", "kiosk session")
_mount("app.queue.router:router", "/api", "queue & tokens")

# appointments
_mount("app.appointments.availability:router", "/api", "appointments availability")
_mount("app.appointments.book:router", "/api", "appointments booking")
_mount("app.appointments.book_batch:router", "/api", "appointments batch booking")  
_mount("app.appointments.kiosk_attach:router", "/api", "appointments kiosk attach")
_mount("app.appointments.router:router", "/api", "appointments core")  
_mount("app.appointments.frontdesk_cash:router", "/api", "frontdesk cash")
# lab
_mount("app.lab.router:router", "/api", "lab bookings")
_mount("app.pharmacy.router:router", "/api", "pharmacy bills")
_mount("app.diagnostics.router:router", "/api", "diagnostics partner")


# voice + billing
_mount("app.voice.router:router", "/api", "voice")
_mount("app.billing.razorpay_router:router", "/api", "razorpay billing")
_mount("app.notifications.router:router", "/api", "whatsapp notifications")

# -------------------------
# On startup: list routes
# -------------------------
@app.on_event("startup")
def _log_routes():
    for r in app.router.routes:
        methods = ",".join(sorted(getattr(r, "methods", [])))
        path = getattr(r, "path", "")
        log.info("ROUTE %-12s %s", methods, path)

# -------------------------
# Entrypoint
# -------------------------
if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", "5000"))  # default 5000 for demo hosts
    uvicorn.run(app, host="0.0.0.0", port=port)
