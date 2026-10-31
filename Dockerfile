FROM node:24-slim AS frontend

WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.13-slim

COPY --from=ghcr.io/astral-sh/uv:0.13.6 /uv /uvx /bin/
RUN useradd --create-home app

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock backend/.python-version ./
RUN uv sync --locked --no-dev

COPY backend/app ./app
COPY --from=frontend /frontend/out ./app/static
# The data volume is mounted here; owning the directory lets the app user write the DB.
RUN mkdir data && chown app:app data

USER app
ENV PATH="/app/.venv/bin:$PATH"

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8000/api/health')"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
