package handlers

import (
	"encoding/json"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var signalUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type signalRoom struct {
	mu      sync.Mutex
	clients []*websocket.Conn
}

type signalHub struct {
	mu    sync.RWMutex
	rooms map[string]*signalRoom
}

var globalSignal = &signalHub{rooms: make(map[string]*signalRoom)}

func SignalHandler(w http.ResponseWriter, r *http.Request) {
	sessionID := r.URL.Query().Get("session")
	if sessionID == "" {
		http.Error(w, "session required", http.StatusBadRequest)
		return
	}

	conn, err := signalUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	globalSignal.mu.Lock()
	room, ok := globalSignal.rooms[sessionID]
	if !ok {
		room = &signalRoom{}
		globalSignal.rooms[sessionID] = room
	}
	room.mu.Lock()
	room.clients = append(room.clients, conn)
	room.mu.Unlock()
	globalSignal.mu.Unlock()

	defer func() {
		conn.Close()
		globalSignal.mu.Lock()
		room.mu.Lock()
		newClients := room.clients[:0]
		for _, c := range room.clients {
			if c != conn {
				newClients = append(newClients, c)
			}
		}
		room.clients = newClients
		if len(room.clients) == 0 {
			delete(globalSignal.rooms, sessionID)
		}
		room.mu.Unlock()
		globalSignal.mu.Unlock()
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg json.RawMessage = raw
		room.mu.Lock()
		for _, c := range room.clients {
			if c != conn {
				c.WriteMessage(websocket.TextMessage, msg)
			}
		}
		room.mu.Unlock()
	}
}
