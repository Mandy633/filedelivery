package handlers

import (
	"testing"
)

func TestSessionIDFromPath(t *testing.T) {
	cases := []struct {
		path string
		want string
	}{
		{"/api/sessions/abc12345/file", "abc12345"},
		{"/api/sessions/abc12345/meta", "abc12345"},
		{"/api/sessions/abc12345", "abc12345"},
		{"/api/sessions/abc12345/", "abc12345"},
		{"/api/sessions/", ""},
		{"/api/sessions", ""},
		{"/other/path/entirely", ""},
		{"", ""},
	}
	for _, tc := range cases {
		got := sessionIDFromPath(tc.path)
		if got != tc.want {
			t.Errorf("sessionIDFromPath(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}
}
