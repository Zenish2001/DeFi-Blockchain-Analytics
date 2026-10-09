# Bitcoin Text-to-SQL chat UI. The database is not baked into the image:
# mount bitcoin.db at /data/bitcoin.db (read-only) when running the container.
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY chat_ui.py test_results.txt ./
COPY templates ./templates
COPY static ./static
ENV DB_PATH=/data/bitcoin.db
EXPOSE 8000
# Single worker: the rate limit and the startup statistics live in memory.
CMD ["gunicorn", "-w", "1", "--threads", "4", "--timeout", "120", "-b", "0.0.0.0:8000", "chat_ui:app"]
