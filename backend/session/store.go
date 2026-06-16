package session

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

const TTL = time.Hour

type Session struct {
	ID         string
	FileName   string
	MIMEType   string
	FileSize   int64
	Data       []byte
	CreatedAt  time.Time
	Downloaded bool
}

type Store struct {
	mu       sync.RWMutex
	sessions map[string]*Session
}

func NewStore() *Store {
	s := &Store{sessions: make(map[string]*Session)}
	go s.cleanupLoop()
	return s
}

func (s *Store) Create(fileName, mimeType string, fileSize int64) *Session {
	sess := &Session{
		ID:        uuid.New().String()[:8],
		FileName:  fileName,
		MIMEType:  mimeType,
		FileSize:  fileSize,
		CreatedAt: time.Now(),
	}
	s.mu.Lock()
	s.sessions[sess.ID] = sess
	s.mu.Unlock()
	return sess
}

func (s *Store) Get(id string) (*Session, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	sess, ok := s.sessions[id]
	return sess, ok
}

func (s *Store) SetData(id string, data []byte) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	sess, ok := s.sessions[id]
	if !ok {
		return false
	}
	sess.Data = data
	return true
}

func (s *Store) Delete(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	delete(s.sessions, id)
}

func (s *Store) MarkDownloaded(id string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if sess, ok := s.sessions[id]; ok {
		sess.Downloaded = true
	}
}

func (s *Store) cleanupLoop() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		s.mu.Lock()
		for id, sess := range s.sessions {
			if time.Since(sess.CreatedAt) > TTL {
				delete(s.sessions, id)
			}
		}
		s.mu.Unlock()
	}
}
