package meta

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"mime/multipart"
	"net/http"
	"net/url"
	"strings"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/providers"
)

// UploadVideo streams a video to the ad account's library as a multipart
// upload. Meta then processes it; GetVideo reports when it is ready. Not
// retried: the reader can only be read once.
func (c *Client) UploadVideo(ctx context.Context, accountID, filename string, r io.Reader) (ads.Video, error) {
	tok, err := c.opts.TokenSource.Token()
	if err != nil {
		return ads.Video{}, c.tokenError(err)
	}
	q := url.Values{}
	if c.opts.AppSecret != "" {
		q.Set("appsecret_proof", appSecretProof(tok.AccessToken, c.opts.AppSecret))
	}
	u := c.base + "/" + actPath(accountID) + "/advideos"
	if len(q) > 0 {
		u += "?" + q.Encode()
	}

	pr, pw := io.Pipe()
	mw := multipart.NewWriter(pw)
	go func() {
		err := func() error {
			if filename != "" {
				if err := mw.WriteField("name", filename); err != nil {
					return err
				}
			}
			part, err := mw.CreateFormFile("source", filename)
			if err != nil {
				return err
			}
			if _, err := io.Copy(part, r); err != nil {
				return err
			}
			return mw.Close()
		}()
		pw.CloseWithError(err)
	}()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, u, pr)
	if err != nil {
		return ads.Video{}, err
	}
	req.Header.Set("Authorization", "Bearer "+tok.AccessToken)
	req.Header.Set("Content-Type", mw.FormDataContentType())
	resp, err := c.opts.HTTPClient.Do(req)
	if err != nil {
		if ctx.Err() != nil {
			return ads.Video{}, ctx.Err()
		}
		return ads.Video{}, &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: err.Error()}
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return ads.Video{}, &providers.Error{Provider: ads.ProviderMeta, Kind: providers.ErrTemporary, Message: err.Error()}
	}
	usage := c.observeUsage(resp.Header)
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return ads.Video{}, classify(resp.StatusCode, data, usage)
	}
	var res struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(data, &res); err != nil || res.ID == "" {
		return ads.Video{}, fmt.Errorf("meta: video upload returned no id")
	}
	return ads.Video{ID: res.ID, Status: "processing"}, nil
}

// GetVideo reports a video's processing status and generated thumbnail.
func (c *Client) GetVideo(ctx context.Context, _ string, videoID string) (ads.Video, error) {
	if !numericID(videoID) {
		return ads.Video{}, invalid("invalid video id")
	}
	var res struct {
		ID     string `json:"id"`
		Status struct {
			VideoStatus string `json:"video_status"`
		} `json:"status"`
		Picture string `json:"picture"`
	}
	if err := c.call(ctx, http.MethodGet, videoID, url.Values{"fields": {"id,status,picture"}}, &res); err != nil {
		return ads.Video{}, err
	}
	status := strings.ToLower(res.Status.VideoStatus)
	switch status {
	case "ready":
	case "error", "expired", "upload_failed":
		status = "error"
	default:
		status = "processing"
	}
	return ads.Video{ID: res.ID, Status: status, ThumbnailURL: res.Picture}, nil
}

func numericID(s string) bool {
	if s == "" || len(s) > 32 {
		return false
	}
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return true
}
