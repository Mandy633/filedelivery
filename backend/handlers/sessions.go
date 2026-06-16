package handlers

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"github.com/mandy633/filedelivery/backend/session"
)

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
	var req createRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "bad request", http.StatusBadRequest)
		return
	}
	if req.FileName == "" || req.MIMEType == "" {
		http.Error(w, "fileName and mimeType required", http.StatusBadRequest)
		return
	}
	const maxSize = 100 * 1024 * 1024 // 100 MB
	if req.FileSize > maxSize {
		http.Error(w, "file too large (max 100 MB)", http.StatusRequestEntityTooLarge)
		return
	}
	sess := h.Store.Create(req.FileName, req.MIMEType, req.FileSize)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(createResponse{SessionID: sess.ID})
}

func (h *SessionHandler) Upload(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := sessionIDFromPath(r.URL.Path)
	sess, ok := h.Store.Get(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	_ = sess
	const maxSize = 100 * 1024 * 1024
	r.Body = http.MaxBytesReader(w, r.Body, maxSize)
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
	sess, ok := h.Store.Get(id)
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
		FileName: sess.FileName,
		MIMEType: sess.MIMEType,
		FileSize: sess.FileSize,
		Ready:    len(sess.Data) > 0,
	})
}

func (h *SessionHandler) Download(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := sessionIDFromPath(r.URL.Path)
	sess, ok := h.Store.Get(id)
	if !ok {
		http.NotFound(w, r)
		return
	}
	if len(sess.Data) == 0 {
		http.Error(w, "not ready", http.StatusAccepted)
		return
	}
	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Content-Disposition", "attachment")
	w.Write(sess.Data)
	h.Store.MarkDownloaded(id)
	go h.Store.Delete(id)
}

func (h *SessionHandler) Delete(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	id := sessionIDFromPath(r.URL.Path)
	h.Store.Delete(id)
	w.WriteHeader(http.StatusNoContent)
}

// sessionIDFromPath extracts the last path segment.
func sessionIDFromPath(path string) string {
	parts := strings.Split(strings.TrimSuffix(path, "/"), "/")
	for i := len(parts) - 1; i >= 0; i-- {
		if parts[i] != "" && parts[i] != "file" && parts[i] != "meta" {
			return parts[i]
		}
	}
	return ""
}
