# Combined backend + frontend image for single-service deployment (e.g. Render).
# The Go server serves the built frontend from ../web/dist with SPA fallback,
# so both pieces need to land in that relative layout inside the final image.

FROM golang:1.26-alpine AS backend-builder
WORKDIR /app/backend
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ .
RUN go build -o filedelivery .

FROM node:22-alpine AS frontend-builder
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci
COPY web/ .
RUN npm run build

FROM alpine:3.20
RUN apk add --no-cache ca-certificates
WORKDIR /app/backend
COPY --from=backend-builder /app/backend/filedelivery .
COPY --from=frontend-builder /app/web/dist /app/web/dist
EXPOSE 8080
CMD ["./filedelivery"]
