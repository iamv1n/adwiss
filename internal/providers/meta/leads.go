package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/iamv1n/adwise/internal/ads"
)

var (
	_ ads.LeadReader = (*Client)(nil)
	_ ads.LeadGetter = (*Client)(nil)
)

const leadFields = "id,created_time,ad_id,adset_id,campaign_id,form_id,is_organic,field_data"

type leadRow struct {
	ID          string `json:"id"`
	CreatedTime string `json:"created_time"`
	AdID        string `json:"ad_id"`
	AdsetID     string `json:"adset_id"`
	CampaignID  string `json:"campaign_id"`
	FormID      string `json:"form_id"`
	IsOrganic   bool   `json:"is_organic"`
	FieldData   []struct {
		Name   string   `json:"name"`
		Values []string `json:"values"`
	} `json:"field_data"`
}

// ListAdLeads reads an ad's lead-form submissions created after since. It
// needs the leads_retrieval permission and access to the ad's Page. Meta keeps
// leads for 90 days.
func (c *Client) ListAdLeads(ctx context.Context, accountID, adID string, since time.Time) ([]ads.Lead, error) {
	q := url.Values{}
	q.Set("fields", leadFields)
	if !since.IsZero() {
		f, _ := json.Marshal([]map[string]any{{"field": "time_created", "operator": "GREATER_THAN", "value": since.Unix()}})
		q.Set("filtering", string(f))
	}
	acct := normalizeAccountID(accountID)
	var out []ads.Lead
	err := c.each(ctx, adID+"/leads", q, func(raw json.RawMessage) error {
		l, err := parseLead(raw)
		if err != nil {
			return err
		}
		if l.AdID == "" {
			l.AdID = adID
		}
		l.AccountID = acct
		out = append(out, l)
		return nil
	})
	return out, err
}

// GetLead reads one lead-form submission by its leadgen ID (as delivered by
// the leadgen webhook). The lead does not name its ad account, so AccountID
// is empty; organic leads have no AdID.
func (c *Client) GetLead(ctx context.Context, leadID string) (ads.Lead, error) {
	var raw json.RawMessage
	q := url.Values{"fields": {leadFields}}
	if err := c.call(ctx, http.MethodGet, url.PathEscape(leadID), q, &raw); err != nil {
		return ads.Lead{}, err
	}
	return parseLead(raw)
}

// parseLead converts one Graph lead object. It is the single parser for both
// the per-ad import and the webhook fetch.
func parseLead(raw json.RawMessage) (ads.Lead, error) {
	var r leadRow
	if err := json.Unmarshal(raw, &r); err != nil {
		return ads.Lead{}, fmt.Errorf("meta: decode lead: %w", err)
	}
	created, err := time.Parse("2006-01-02T15:04:05-0700", r.CreatedTime)
	if err != nil {
		return ads.Lead{}, fmt.Errorf("meta: lead %s created_time %q: %w", r.ID, r.CreatedTime, err)
	}
	fields := make(map[string]string, len(r.FieldData))
	for _, f := range r.FieldData {
		fields[f.Name] = strings.Join(f.Values, ", ")
	}
	return ads.Lead{
		ExternalID: r.ID, CampaignID: r.CampaignID, AdGroupID: r.AdsetID, AdID: r.AdID,
		FormID: r.FormID, CreatedAt: created.UTC(), IsOrganic: r.IsOrganic, Fields: fields, Raw: raw,
	}, nil
}
