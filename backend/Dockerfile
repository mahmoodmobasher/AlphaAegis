FROM python:3.11-slim

WORKDIR /app

# Install system dependencies including git
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    git \
    && rm -rf /var/lib/apt/lists/*

# Dynamically locate setup.py and install it
RUN git clone https://github.com/InteractiveBrokers/tws-api-public.git /tmp/tws-api && \
    TARGET_DIR=$(dirname $(find /tmp/tws-api -name "setup.py" | head -n 1)) && \
    cd "$TARGET_DIR" && \
    python setup.py install && \
    rm -rf /tmp/tws-api

# Now copy and install the remaining standard pip requirements
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]