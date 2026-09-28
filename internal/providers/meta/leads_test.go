package meta

import (
	"context"
	"net/http"
	"net/url"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/providers"
)

func TestListAdLeads(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/2001/leads", serveJSON([]byte(`{"data":[{
		"id":"9001","created_time":"2026-09-20T10:15:00+0000","ad_id":"2001","adset_id":"3001","campaign_id":"4001",
		"form_id":"5001","is_organic":false,
		"field_data":[{"name":"full_name","values":["Rahul Sharma"]},{"name":"phone_number","values":["+919800000000"]},
		              {"name":"which_budget?","values":["50L","80L"]}]
	}]}`), 200))

	since := time.Date(2026, 9, 1, 0, 0, 0, 0, time.UTC)
	leads, err := c.ListAdLeads(context.Background(), "act_1001", "2001", since)
	require.NoError(t, err)
	require.Len(t, leads, 1)
	l := leads[0]
	require.Equal(t, "9001", l.ExternalID)
	require.Equal(t, "1001", l.AccountID)
	require.Equal(t, "4001", l.CampaignID)
	require.Equal(t, "3001", l.AdGroupID)
	require.Equal(t, "2001", l.AdID)
	require.Equal(t, time.Date(2026, 9, 20, 10, 15, 0, 0, time.UTC), l.CreatedAt)
	require.Equal(t, map[string]string{"full_name": "Rahul Sharma", "phone_number": "+919800000000", "which_budget?": "50L, 80L"}, l.Fields)

	form := url.Values(fg.forms[len(fg.forms)-1])
	require.Contains(t, form.Get("filtering"), `"value":1788220800`)
	require.Contains(t, form.Get("fields"), "field_data")
}

func TestGetLead(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/9002", serveJSON([]byte(`{
		"id":"9002","created_time":"2026-09-21T08:00:00+0000","ad_id":"2001","adset_id":"3001","campaign_id":"4001",
		"form_id":"5001","is_organic":false,"field_data":[{"name":"email","values":["a@example.com"]}]}`), 200))

	l, err := c.GetLead(context.Background(), "9002")
	require.NoError(t, err)
	require.Equal(t, "9002", l.ExternalID)
	require.Equal(t, "2001", l.AdID)
	require.Equal(t, "3001", l.AdGroupID)
	require.Equal(t, time.Date(2026, 9, 21, 8, 0, 0, 0, time.UTC), l.CreatedAt)
	require.Equal(t, map[string]string{"email": "a@example.com"}, l.Fields)
	require.Contains(t, url.Values(fg.forms[len(fg.forms)-1]).Get("fields"), "field_data")
}

func TestGetLeadPermissionDenied(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/9003", serveJSON([]byte(`{"error":{"message":"no","code":200}}`), 403))
	_, err := c.GetLead(context.Background(), "9003")
	require.ErrorIs(t, err, providers.ErrPermissionDenied)
}

func TestListPagesAndSubscribe(t *testing.T) {
	fg, c, _ := newFakeGraph(t)
	fg.on("GET", "/me/accounts", serveJSON([]byte(`{"data":[
		{"id":"p1","name":"Shop","access_token":"page-tok-1","tasks":["MANAGE","ADVERTISE"]},
		{"id":"p2","name":"Blog","access_token":"page-tok-2","tasks":["ADVERTISE"]}]}`), 200))
	var auth []string
	fg.on("POST", "/p1/subscribed_apps", func(w http.ResponseWriter, r *http.Request) {
		auth = append(auth, r.Header.Get("Authorization"))
		serveJSON([]byte(`{"success":true}`), 200)(w, r)
	})
	fg.on("POST", "/p2/subscribed_apps", serveJSON([]byte(`{"error":{"message":"needs MANAGE","code":200}}`), 403))

	pages, err := c.ListManagedPages(context.Background())
	require.NoError(t, err)
	require.Len(t, pages, 2)
	require.Equal(t, "page-tok-1", pages[0].AccessToken)
	require.Equal(t, []string{"MANAGE", "ADVERTISE"}, pages[0].Tasks)

	require.NoError(t, c.SubscribePageLeadgen(context.Background(), "p1", pages[0].AccessToken))
	require.Equal(t, []string{"Bearer page-tok-1"}, auth)
	require.Equal(t, "leadgen", url.Values(fg.forms[len(fg.forms)-1]).Get("subscribed_fields"))

	err = c.SubscribePageLeadgen(context.Background(), "p2", pages[1].AccessToken)
	require.ErrorIs(t, err, providers.ErrPermissionDenied)
}
