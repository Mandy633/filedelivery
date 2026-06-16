package main

import (
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/mandy633/filedelivery/backend/handlers"
	"github.com/mandy633/filedelivery/backend/session"
)

func main() {
	store := session.NewStore()
	sh := &handlers.SessionHandler{Store: store}
	sig := &handlers.SignalHandler{Store: store}

	mux := http.NewServeMux()

	// Session REST API
	mux.HandleFunc("/api/sessions", sh.Create)
	mux.HandleFunc("/api/sessions/", func(w http.ResponseWriter, r *http.Request) {
		path := r.URL.Path
		switch {
		case strings.HasSuffix(path, "/file") && r.Method == http.MethodPut:
			sh.Upload(w, r)
		case strings.HasSuffix(path, "/file") && r.Method == http.MethodGet:
			sh.Download(w, r)
		case strings.HasSuffix(path, "/meta") && r.Method == http.MethodGet:
			sh.Meta(w, r)
		case r.Method == http.MethodDelete:
			sh.Delete(w, r)
		default:
			http.NotFound(w, r)
		}
	})

	// WebSocket endpoints
	mux.HandleFunc("/ws/presence", handlers.PresenceHandler)
	mux.HandleFunc("/ws/signal", sig.Handle)

	// Serve compiled frontend with SPA fallback.
	webDir := "../web/dist"
	if _, err := os.Stat(webDir); err == nil {
		fs := http.FileServer(http.Dir(webDir))
		mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
			// Serve the real file if it exists; otherwise fall back to index.html
			// so that client-side routes like /r/:id work after a hard reload.
			candidate := filepath.Join(webDir, filepath.Clean("/"+r.URL.Path))
			if _, err := os.Stat(candidate); err == nil {
				fs.ServeHTTP(w, r)
				return
			}
			http.ServeFile(w, r, filepath.Join(webDir, "index.html"))
		})
	}

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}
	log.Printf("Server listening on :%s", port)
	log.Fatal(http.ListenAndServe(":"+port, corsMiddleware(mux)))
}

func corsMiddleware(next http.Handler) http.Handler {
	allowedOrigin := os.Getenv("CORS_ORIGIN")
	if allowedOrigin == "" {
		allowedOrigin = "*"
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", allowedOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}
