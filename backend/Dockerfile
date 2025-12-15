FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app/ ./app/

# Expose port 8000
EXPOSE 8000

# Run uvicorn on all interfaces (0.0.0.0) to allow access from host
# Use reload for development, remove --reload for production
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]




