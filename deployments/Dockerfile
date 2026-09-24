# Builds all Go binaries; choose one at runtime, e.g. `command: ["/app/api"]`.
FROM golang:1.27-alpine AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /out/ ./cmd/...

FROM gcr.io/distroless/static-debian12:nonroot
WORKDIR /app
COPY --from=build /out/ /app/
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT []
CMD ["/app/api"]
