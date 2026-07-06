FROM python:3.11-slim

# ffmpeg backs PyAV's audio decoding (webm/opus from the browser MediaRecorder).
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

ENV PORT=8000 WHISPER_MODEL=base
# Pre-download the model at build time so the first request is fast (optional; comment out
# to download lazily on first boot instead).
RUN python -c "from faster_whisper import WhisperModel; WhisperModel('base', device='cpu', compute_type='int8')"

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}"]
