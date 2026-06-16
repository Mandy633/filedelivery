package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"github.com/mandy633/filedelivery/backend/session"
)

const maxUploadSize = 100 * 1024 * 1024 // 100 MB

type SessionHandler struct {
	Store *session.Store
}

type createRequest struct {
	FileName string `json:"fileName"`
	MIMEType string `json:"mimeType"`
	FileSize int64  `json:"fileSize"`
}

type createResponse struct {
	SessionID string `json:"sessionId"`
}

func (h *SessionHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Bound the JSON body to prevent memory exhaustion.
	r.Body = http.MaxBytesReader(w, r.Body, 4096)
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.FileName == "" || req.MIMEType == "" {
		http.Error(w, "fileName and mimeType required", http.StatusBadRequest)
		return
	}
	if req.FileSize > maxUploadSize {
		http.Error(w, "file too large (max 100 MB)", http.StatusRequestEntityTooLarge)
		return
	}
	id, err := h.Store.Create(req.FileName, req.MIMEType, req.FileSize)
	if err != nil {
		http.Error(w, err.Error(), http.StatusServiceUnavailable)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(createResponse{SessionID: id})
}

func (h *SessionHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := sessionIDFromPath(r.URL.Path)
	if !h.Store.Exists(id) {
		http.NotFound(w, r)
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, maxUploadSize)
	data, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "read error", http.StatusBadRequest)
		return
	}
	if !h.Store.SetData(id, data) {
		http.NotFound(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *SessionHandler) Meta(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := sessionIDFromPath(r.URL.Path)
	snap, ok := h.Store.GetMeta(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	type metaResponse struct {
		FileName string `json:"fileName"`
		MIMEType string `json:"mimeType"`
		FileSize int64  `json:"fileSize"`
		Ready    bool   `json:"ready"`
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(metaResponse{
		FileName: snap.FileName,
		MIMEType: snap.MIMEType,
		FileSize: snap.FileSize,
		Ready:    snap.Ready,
	})
}

func (h *SessionHandler) Download(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := sessionIDFromPath(r.URL.Path)

	// Capture metadata before atomically removing the blob so the filename
	// is available for the Content-Disposition header after deletion.
	meta, exists := h.Store.GetMeta(id)
	if !exists {
		http.NotFound(w, r)
		return
	}
	if !meta.Ready {
		http.Error(w, "not ready", http.StatusAccepted)
		return
	}

	data, ok := h.Store.TakeData(id)
	if !ok {
		// Lost a race with a concurrent download — session already gone.
		http.NotFound(w, r)
		return
	}
	// RFC 5987 preserves the original Unicode filename in all modern browsers.
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename*=UTF-8''%s`, url.PathEscape(meta.FileName)))
	w.Header().Set("Content-Length", strconv.Itoa(len(data)))
	w.Write(data)
}

func (h *SessionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.Store.Delete(sessionIDFromPath(r.URL.Path))
	w.WriteHeader(http.StatusNoContent)
}

// sessionIDFromPath extracts the session ID from /api/sessions/{id}[/...].
func sessionIDFromPath(path string) string {
	rest := strings.TrimPrefix(path, "/api/sessions/")
	if rest == path {
		return ""
	}
	return strings.SplitN(rest, "/", 2)[0]
}
