package sms

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestTwilioSend(t *testing.T) {
	var got *http.Request
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = r.ParseForm()
		got = r
		w.WriteHeader(http.StatusCreated)
	}))
	defer srv.Close()
	tw := &Twilio{AccountSID: "AC1", AuthToken: "tok", From: "+15550001111", BaseURL: srv.URL}
	require.NoError(t, tw.Send(context.Background(), "+15552223333", "hello"))
	assert.Equal(t, "/2010-04-01/Accounts/AC1/Messages.json", got.URL.Path)
	user, pass, _ := got.BasicAuth()
	assert.Equal(t, "AC1", user)
	assert.Equal(t, "tok", pass)
	assert.Equal(t, "+15552223333", got.PostForm.Get("To"))
	assert.Equal(t, "hello", got.PostForm.Get("Body"))

	fail := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "bad", http.StatusBadRequest)
	}))
	defer fail.Close()
	tw.BaseURL = fail.URL
	assert.Error(t, tw.Send(context.Background(), "+15552223333", "hello"))
}

func TestNewPicksSender(t *testing.T) {
	_, ok := New(Config{}, nil).(*Log)
	assert.True(t, ok)
	_, ok = New(Config{TwilioAccountSID: "a", TwilioAuthToken: "b", TwilioFrom: "c"}, nil).(*Twilio)
	assert.True(t, ok)
}
