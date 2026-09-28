package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"

	"golang.org/x/oauth2"
)

// ManagedPage is a Facebook Page the connected user can act on, with its Page
// access token. The token is a credential: never log or store it.
type ManagedPage struct {
	ID          string   `json:"id"`
	Name        string   `json:"name"`
	AccessToken string   `json:"access_token"`
	Tasks       []string `json:"tasks"`
}

// ListManagedPages returns the user's Pages with Page access tokens
// (GET /me/accounts). Needs pages_show_list.
func (c *Client) ListManagedPages(ctx context.Context) ([]ManagedPage, error) {
	q := url.Values{"fields": {"id,name,access_token,tasks"}}
	var out []ManagedPage
	err := c.each(ctx, "me/accounts", q, func(raw json.RawMessage) error {
		var p ManagedPage
		if err := json.Unmarshal(raw, &p); err != nil {
			return fmt.Errorf("meta: decode page: %w", err)
		}
		out = append(out, p)
		return nil
	})
	return out, err
}

// SubscribePageLeadgen subscribes the app to a Page's leadgen webhook field
// (POST /{page-id}/subscribed_apps?subscribed_fields=leadgen), so Meta pushes
// new lead-form submissions. It must use the Page access token; the user needs
// pages_manage_metadata and the MANAGE task on the Page.
func (c *Client) SubscribePageLeadgen(ctx context.Context, pageID, pageToken string) error {
	var res struct {
		Success bool `json:"success"`
	}
	pc := c.withToken(pageToken)
	if err := pc.call(ctx, http.MethodPost, url.PathEscape(pageID)+"/subscribed_apps",
		url.Values{"subscribed_fields": {"leadgen"}}, &res); err != nil {
		return err
	}
	if !res.Success {
		return fmt.Errorf("meta: subscribe page %s: not successful", pageID)
	}
	return nil
}

// withToken returns a client with the same options that authenticates with a
// fixed token (e.g. a Page access token).
func (c *Client) withToken(token string) *Client {
	o := c.opts
	o.TokenSource = oauth2.StaticTokenSource(&oauth2.Token{AccessToken: token})
	return New(o)
}
