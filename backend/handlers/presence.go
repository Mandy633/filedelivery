package handlers

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/gorilla/websocket"
)

var presenceUpgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		allowed := os.Getenv("CORS_ORIGIN")
		if allowed == "" || allowed == "*" {
			return true
		}
		return r.Header.Get("Origin") == allowed
	},
}

type peer struct {
	conn    *websocket.Conn
	writeMu sync.Mutex // gorilla/websocket requires serialised writes per connection
	name    string
	ip      string
}

func (p *peer) writeJSON(v any) {
	p.writeMu.Lock()
	defer p.writeMu.Unlock()
	if err := p.conn.WriteJSON(v); err != nil {
		log.Printf("presence: write to %s: %v", p.name, err)
	}
}

type presenceHub struct {
	mu    sync.RWMutex
	peers map[string]*peer // keyed by device name
}

var globalHub = &presenceHub{peers: make(map[string]*peer)}

type presenceMsg struct {
	Type     string   `json:"type"`
	Name     string   `json:"name,omitempty"`
	Peers    []string `json:"peers,omitempty"`
	Target   string   `json:"target,omitempty"`
	From     string   `json:"from,omitempty"`
	Accepted bool     `json:"accepted,omitempty"`
	URL      string   `json:"url,omitempty"`
	FileName string   `json:"fileName,omitempty"`
}

func PresenceHandler(w http.ResponseWriter, r *http.Request) {
	name := r.URL.Query().Get("name")
	if name == "" {
		http.Error(w, "name required", http.StatusBadRequest)
		return
	}

	// Reject duplicate names before upgrading (pre-check under read lock).
	globalHub.mu.RLock()
	_, taken := globalHub.peers[name]
	globalHub.mu.RUnlock()
	if taken {
		http.Error(w, "name already in use", http.StatusConflict)
		return
	}

	conn, err := presenceUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}

	ip := clientIP(r)
	p := &peer{conn: conn, name: name, ip: ip}

	// Re-check under write lock to close the TOCTOU window.
	globalHub.mu.Lock()
	if _, taken = globalHub.peers[name]; taken {
		globalHub.mu.Unlock()
		conn.Close()
		return
	}
	globalHub.peers[name] = p
	globalHub.mu.Unlock()

	broadcastPeerList(ip)

	defer func() {
		globalHub.mu.Lock()
		if globalHub.peers[name] == p {
			delete(globalHub.peers, name)
		}
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
			if ok {
				target.writeJSON(presenceMsg{Type: "pair-request", From: name})
			}

		case "pair-response":
			globalHub.mu.RLock()
			initiator, ok := globalHub.peers[msg.Target]
			globalHub.mu.RUnlock()
			if ok {
				initiator.writeJSON(presenceMsg{Type: "pair-response", From: name, Accepted: msg.Accepted})
			}

		case "transfer-invite":
			// Relay the receive URL to the target device.
			// The URL contains the encryption key in its fragment; the server
			// forwards it opaquely and never interprets the fragment.
			globalHub.mu.RLock()
			target, ok := globalHub.peers[msg.Target]
			globalHub.mu.RUnlock()
			if ok {
				target.writeJSON(presenceMsg{Type: "transfer-invite", From: name, URL: msg.URL, FileName: msg.FileName})
			}
		}
	}
}

func broadcastPeerList(ip string) {
	// Collect targets under the read lock; write outside it to avoid holding
	// the lock while doing potentially slow WebSocket writes.
	globalHub.mu.RLock()
	var targets []*peer
	var names []string
	for _, p := range globalHub.peers {
		if p.ip == ip {
			names = append(names, p.name)
			targets = append(targets, p)
		}
	}
	globalHub.mu.RUnlock()

	msg := presenceMsg{Type: "peers", Peers: names}
	for _, p := range targets {
		p.writeJSON(msg)
	}
}

// clientIP returns the request's real IP. X-Forwarded-For is only trusted
// when the request comes from the address in the TRUSTED_PROXY env var.
func clientIP(r *http.Request) string {
	remoteIP, _, _ := net.SplitHostPort(r.RemoteAddr)
	if trustedProxy := os.Getenv("TRUSTED_PROXY"); trustedProxy != "" && remoteIP == trustedProxy {
		if fwd := r.Header.Get("X-Forwarded-For"); fwd != "" {
			return strings.TrimSpace(strings.SplitN(fwd, ",", 2)[0])
		}
	}
	if remoteIP == "" {
		return r.RemoteAddr
	}
	return remoteIP
}
