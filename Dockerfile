FROM node:18-alpine AS frontend-build

WORKDIR /frontend
COPY ./frontend/package*.json ./

RUN npm install
COPY ./frontend .
RUN npm run build

FROM python:3.12-slim
WORKDIR /

# Install uv.
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

# Copy the application into the container.
COPY ./backend /app

# Install the application dependencies.
WORKDIR /app
RUN uv sync --frozen --no-cache
COPY --from=frontend-build /frontend/dist /app/static

# Run the application.
CMD ["/app/.venv/bin/fastapi", "run", "/app/main.py", "--port", "80", "--host", "0.0.0.0"]
