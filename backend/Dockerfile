FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    TZ=Europe/Zurich

WORKDIR /code

# Quellcode vor der Installation kopieren: Bei einer Editable-Installation wird
# der Paket-Finder zur Build-Zeit erzeugt. Ohne vorhandenes app/-Verzeichnis
# würde das Paket nicht gemappt und der Container ohne Volume-Mount
# (z. B. CI/Produktion) mit "ModuleNotFoundError: app" starten.
COPY . .
RUN pip install --no-cache-dir -e ".[dev]"

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
