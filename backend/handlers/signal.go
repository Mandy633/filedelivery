package handlers

import (
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
	"github.com/mandy633/filedelivery/backend/session"
)

var signalUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type signalConn struct {
	conn    *websocket.Conn
	writeMu sync.Mutex
}

func (sc *signalConn) write(msgType int, data []byte) {
	sc.writeMu.Lock()
	defer sc.writeMu.Unlock()
	sc.conn.WriteMessage(msgType, data) //nolint:errcheck
}

type signalRoom struct {
	mu      sync.Mutex
	clients []*signalConn
}

type signalHub struct {
	mu    sync.RWMutex
	rooms map[string]*signalRoom
}

var globalSignal = &signalHub{rooms: make(map[string]*signalRoom)}

type SignalHandler struct {
	Store *session.Store
}

func (h *SignalHandler) Handle(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		http.Error(w, "session required", http.StatusBadRequest)
		return
	}
	// Only allow signaling for sessions that exist in the store.
	if !h.Store.Exists(sessionID) {
		http.Error(w, "session not found", http.StatusNotFound)
		return
	}

	// Check room capacity before upgrading to WebSocket.
	globalSignal.mu.Lock()
	room, exists := globalSignal.rooms[sessionID]
	if !exists {
		room = &signalRoom{}
		globalSignal.rooms[sessionID] = room
	}
	room.mu.Lock()
	if len(room.clients) >= 2 {
		room.mu.Unlock()
		globalSignal.mu.Unlock()
		http.Error(w, "room full", http.StatusConflict)
		return
	}
	room.mu.Unlock()
	globalSignal.mu.Unlock()

	conn, err := signalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	sc := &signalConn{conn: conn}

	globalSignal.mu.Lock()
	room.mu.Lock()
	room.clients = append(room.clients, sc)
	room.mu.Unlock()
	globalSignal.mu.Unlock()

	defer func() {
		conn.Close()
		globalSignal.mu.Lock()
		room.mu.Lock()
		out := room.clients[:0]
		for _, c := range room.clients {
			if c != sc {
				out = append(out, c)
			}
		}
		room.clients = out
		if len(room.clients) == 0 {
			delete(globalSignal.rooms, sessionID)
		}
		room.mu.Unlock()
		globalSignal.mu.Unlock()
	}()

	for {
		msgType, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		room.mu.Lock()
		for _, c := range room.clients {
			if c != sc {
				c.write(msgType, raw)
			}
		}
		room.mu.Unlock()
	}
}
