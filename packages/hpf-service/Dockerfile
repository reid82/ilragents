FROM node:20-bookworm

# Install Playwright system dependencies
RUN npx playwright install-deps chromium

WORKDIR /app

# Copy package files
COPY package.json tsconfig.json ./

# Install dependencies
RUN npm install

# Install Playwright browsers
RUN npx playwright install chromium

# Copy source
COPY src/ src/

# Create data directory for session persistence
RUN mkdir -p data

EXPOSE 3100

CMD ["node", "--import", "tsx/esm", "src/server.ts"]
