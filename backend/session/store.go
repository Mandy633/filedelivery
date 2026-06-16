package session

import (
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
)

const TTL = time.Hour
const maxSessions = 500

// MetaSnapshot holds immutable session fields plus a ready flag.
type MetaSnapshot struct {
	FileName string
	MIMEType string
	FileSize int64
	Ready    bool
}

type session struct {
	id        string
	fileName  string
	mimeType  string
	fileSize  int64
	data      []byte
	createdAt time.Time
}

type Store struct {
	mu       sync.RWMutex
	sessions map[string]*session
}

func NewStore() *Store {
	s := &Store{sessions: make(map[string]*session)}
	go s.cleanupLoop()
	return s
}

func (s *Store) Create(fileName, mimeType string, fileSize int64) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if len(s.sessions) >= maxSessions {
		return "", errors.New("server at capacity, try again later")
	}
	// Retry on the rare collision (32-bit ID space).
	var id string
	for {
		id = uuid.New().String()[:8]
		if _, exists := s.sessions[id]; !exists {
			break
		}
	}
	s.sessions[id] = &session{
		id:        id,
		fileName:  fileName,
		mimeType:  mimeType,
		fileSize:  fileSize,
		createdAt: time.Now(),
	}
	return id, nil
}

// GetMeta returns immutable metadata and whether the blob is ready.
func (s *Store) GetMeta(id string) (MetaSnapshot, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	if !ok {
		return MetaSnapshot{}, false
	}
	return MetaSnapshot{
		FileName: sess.fileName,
		MIMEType: sess.mimeType,
		FileSize: sess.fileSize,
		Ready:    len(sess.data) > 0,
	}, true
}

// Exists reports whether the session is still present.
func (s *Store) Exists(id string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, ok := s.sessions[id]
	return ok
}

// SetData stores the encrypted blob. Returns false if the session is gone.
func (s *Store) SetData(id string, data []byte) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return false
	}
	sess.data = data
	return true
}

// TakeData atomically removes the session and returns its blob.
// Returns (nil, false) if the session does not exist or has no data yet.
func (s *Store) TakeData(id string) ([]byte, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok || len(sess.data) == 0 {
		return nil, false
	}
	data := sess.data
	delete(s.sessions, id)
	return data, true
}

// Delete removes a session unconditionally.
func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, id)
}

func (s *Store) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		for id, sess := range s.sessions {
			if time.Since(sess.createdAt) > TTL {
				delete(s.sessions, id)
			}
		}
		s.mu.Unlock()
	}
}
