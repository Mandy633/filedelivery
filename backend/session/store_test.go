package session_test

import (
	"testing"

	"github.com/mandy633/filedelivery/backend/session"
)

func TestCreate(t *testing.T) {
	s := session.NewStore()
	id, err := s.Create("file.txt", "text/plain", 100)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if id == "" {
		t.Fatal("expected non-empty session ID")
	}
	if !s.Exists(id) {
		t.Fatal("session should exist after Create")
	}
}

func TestCreateCap(t *testing.T) {
	s := session.NewStore()
	for i := range 500 {
		_, err := s.Create("f", "text/plain", 1)
		if err != nil {
			t.Fatalf("unexpected error at session %d: %v", i, err)
		}
	}
	_, err := s.Create("f", "text/plain", 1)
	if err == nil {
		t.Fatal("expected an error when exceeding the 500-session cap")
	}
}

func TestTakeData_notReadyBeforeSetData(t *testing.T) {
	s := session.NewStore()
	id, _ := s.Create("f.txt", "text/plain", 5)
	_, ok := s.TakeData(id)
	if ok {
		t.Fatal("TakeData should return false before SetData is called")
	}
	if !s.Exists(id) {
		t.Fatal("session should still exist after failed TakeData")
	}
}

func TestTakeData_deletesSession(t *testing.T) {
	s := session.NewStore()
	id, _ := s.Create("f.txt", "text/plain", 5)
	s.SetData(id, []byte("hello"))

	data, ok := s.TakeData(id)
	if !ok {
		t.Fatal("TakeData should return true after SetData")
	}
	if string(data) != "hello" {
		t.Fatalf("expected %q, got %q", "hello", data)
	}
	if s.Exists(id) {
		t.Fatal("session should be deleted after TakeData")
	}
}

func TestTakeData_onlyOneWinner(t *testing.T) {
	s := session.NewStore()
	id, _ := s.Create("f.txt", "text/plain", 5)
	s.SetData(id, []byte("data"))

	_, first := s.TakeData(id)
	_, second := s.TakeData(id)
	if !first {
		t.Fatal("first TakeData should succeed")
	}
	if second {
		t.Fatal("second TakeData should fail (session already deleted)")
	}
}

func TestGetMeta(t *testing.T) {
	s := session.NewStore()
	id, _ := s.Create("doc.pdf", "application/pdf", 42)

	snap, ok := s.GetMeta(id)
	if !ok {
		t.Fatal("GetMeta should find the session")
	}
	if snap.FileName != "doc.pdf" {
		t.Errorf("FileName: got %q, want %q", snap.FileName, "doc.pdf")
	}
	if snap.MIMEType != "application/pdf" {
		t.Errorf("MIMEType: got %q, want %q", snap.MIMEType, "application/pdf")
	}
	if snap.FileSize != 42 {
		t.Errorf("FileSize: got %d, want 42", snap.FileSize)
	}
	if snap.Ready {
		t.Error("Ready should be false before SetData")
	}

	s.SetData(id, []byte("pdfdata"))
	snap, _ = s.GetMeta(id)
	if !snap.Ready {
		t.Error("Ready should be true after SetData")
	}
}

func TestDelete(t *testing.T) {
	s := session.NewStore()
	id, _ := s.Create("f.txt", "text/plain", 1)
	s.Delete(id)
	if s.Exists(id) {
		t.Fatal("session should be gone after Delete")
	}
}
