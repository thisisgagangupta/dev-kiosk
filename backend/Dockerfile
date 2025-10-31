# backend/Dockerfile  ✅ change CMD to use $PORT at runtime
FROM python:3.11-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app ./app
EXPOSE 5000
# Use a shell form so ${PORT} expands on Render; default to 5000 locally.
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-5000}'