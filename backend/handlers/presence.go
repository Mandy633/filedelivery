package handlers

import (
	"encoding/json"
	"net"
	"net/http"
	"sync"

	"github.com/gorilla/websocket"
)

var presenceUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type peer struct {
	conn     *websocket.Conn
	name     string
	ip       string
	pairWith chan string // receives the name of the device that accepted pairing
}

type presenceHub struct {
	mu    sync.RWMutex
	peers map[string]*peer // key = name
}

var globalHub = &presenceHub{peers: make(map[string]*peer)}

type presenceMsg struct {
	Type    string   `json:"type"`
	Name    string   `json:"name,omitempty"`
	Peers   []string `json:"peers,omitempty"`
	Target  string   `json:"target,omitempty"`
	From    string   `json:"from,omitempty"`
	Accepted bool    `json:"accepted,omitempty"`
}

func PresenceHandler(w http.ResponseWriter, r *http.Request) {
	conn, err := presenceUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	name := r.URL.Query().Get("name")
	if name == "" {
		conn.Close()
		return
	}

	ip := clientIP(r)
	p := &peer{conn: conn, name: name, ip: ip, pairWith: make(chan string, 1)}

	globalHub.mu.Lock()
	globalHub.peers[name] = p
	globalHub.mu.Unlock()

	broadcastPeerList(ip)

	defer func() {
		globalHub.mu.Lock()
		delete(globalHub.peers, name)
		globalHub.mu.Unlock()
		conn.Close()
		broadcastPeerList(ip)
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var msg presenceMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			continue
		}
		switch msg.Type {
		case "pair-request":
			globalHub.mu.RLock()
			target, ok := globalHub.peers[msg.Target]
			globalHub.mu.RUnlock()
			if !ok {
				continue
			}
			target.conn.WriteJSON(presenceMsg{Type: "pair-request", From: name})
		case "pair-response":
			globalHub.mu.RLock()
			initiator, ok := globalHub.peers[msg.Target]
			globalHub.mu.RUnlock()
			if !ok {
				continue
			}
			initiator.conn.WriteJSON(presenceMsg{Type: "pair-response", From: name, Accepted: msg.Accepted})
		}
	}
}

func broadcastPeerList(ip string) {
	globalHub.mu.RLock()
	defer globalHub.mu.RUnlock()
	var names []string
	for _, p := range globalHub.peers {
		if p.ip == ip {
			names = append(names, p.name)
		}
	}
	for _, p := range globalHub.peers {
		if p.ip == ip {
			p.conn.WriteJSON(presenceMsg{Type: "peers", Peers: names})
		}
	}
}

func clientIP(r *http.Request) string {
	forwarded := r.Header.Get("X-Forwarded-For")
	if forwarded != "" {
		return forwarded
	}
	ip, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return ip
}
