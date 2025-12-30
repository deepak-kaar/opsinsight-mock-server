# Use a lightweight Node.js image
FROM node:20-slim

# Set environment variables for Puppeteer
ENV PUPPETEER_EXECUTABLE_PATH="/app/google-chrome" \
    HOME="/app" \
    NODE_ENV="development" \
    PUPPETEER_SKIP_DOWNLOAD="true" \
    PUPPETEER_CACHE_DIR="/tmp"

# Set working directory
WORKDIR /app

# Install required dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget \
    curl \
    gnupg \
    libgbm1 \
    libatk1.0-0 \
    libasound2 \
    libpangocairo-1.0-0 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgtk-3-0 \
    libnss3 \
    libxss1 \
    libxshmfence1 \
    ca-certificates \
    fonts-liberation \
    xdg-utils \
    unzip

# Copy Google Chrome .deb file
COPY google-chrome-stable_current_amd64.deb /tmp/google-chrome.deb

# Manually extract Chrome without running its post-install scripts
RUN dpkg-deb -x /tmp/google-chrome.deb /app/chrome-files && \
    mv /app/chrome-files/opt/google/chrome /app/chrome && \
    ln -s /app/chrome/google-chrome /app/google-chrome

# Verify Chrome installation
RUN ls -l /app/chrome/ && /app/google-chrome --version

# Copy package.json and package-lock.json
COPY package.json package-lock.json ./

# Install Node.js dependencies (without dev dependencies)
RUN npm install --omit=dev --no-optional && npm cache clean --force

# Copy project files
COPY . .

# Expose necessary ports
EXPOSE 8080

# Start your application
CMD ["node", "server.js"]
