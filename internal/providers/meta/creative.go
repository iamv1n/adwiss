package meta

import (
	"context"
	"net/url"

	"github.com/iamv1n/adwise/internal/ads"
)

// Ad creation by format. Image, video and carousel ads create an ad creative
// first and then the ad; flexible ads send their assets on the ad itself
// (creative_asset_groups_spec) and Meta builds the combinations.

func callToAction(typ, link string) map[string]any {
	if typ == "" {
		typ = "LEARN_MORE"
	}
	return map[string]any{"type": typ, "value": map[string]any{"link": link}}
}

func storySpec(s ads.AdSpec) map[string]any {
	story := map[string]any{"page_id": s.PageID}
	if s.InstagramUserID != "" {
		story["instagram_user_id"] = s.InstagramUserID
	}
	return story
}

// videoThumbnail returns the thumbnail fields for a video: the uploaded image
// when one was given, else the thumbnail Meta generated.
func (c *Client) videoThumbnail(ctx context.Context, accountID, videoID, imageHash string) (map[string]any, error) {
	if imageHash != "" {
		return map[string]any{"image_hash": imageHash}, nil
	}
	v, err := c.GetVideo(ctx, accountID, videoID)
	if err != nil {
		return nil, err
	}
	if v.Status != "ready" {
		return nil, invalid("video %s is still processing; try again when it is ready", videoID)
	}
	if v.ThumbnailURL == "" {
		return nil, invalid("video %s has no thumbnail yet; upload one as an image", videoID)
	}
	return map[string]any{"image_url": v.ThumbnailURL}, nil
}

// creativeParams builds the /adcreatives form for image, video and carousel ads.
func (c *Client) creativeParams(ctx context.Context, accountID string, s ads.AdSpec) (url.Values, error) {
	cr := s.Creative
	if s.PageID == "" || cr.Link == "" {
		return nil, invalid("page_id and creative.link are required")
	}
	story := storySpec(s)
	switch cr.Format {
	case "", ads.FormatImage:
		if cr.ImageHash == "" {
			return nil, invalid("creative.image_hash is required")
		}
		link := map[string]any{"image_hash": cr.ImageHash, "link": cr.Link}
		setText(link, "message", cr.Message)
		setText(link, "name", cr.Headline)
		setText(link, "description", cr.Description)
		setText(link, "caption", cr.DisplayLink)
		if cr.CallToAction != "" {
			link["call_to_action"] = callToAction(cr.CallToAction, cr.Link)
		}
		story["link_data"] = link

	case ads.FormatVideo:
		if cr.VideoID == "" {
			return nil, invalid("creative.video_id is required")
		}
		thumb, err := c.videoThumbnail(ctx, accountID, cr.VideoID, cr.ImageHash)
		if err != nil {
			return nil, err
		}
		video := map[string]any{"video_id": cr.VideoID, "call_to_action": callToAction(cr.CallToAction, cr.Link)}
		for k, v := range thumb {
			video[k] = v
		}
		setText(video, "message", cr.Message)
		setText(video, "title", cr.Headline)
		setText(video, "link_description", cr.Description)
		story["video_data"] = video

	case ads.FormatCarousel:
		if len(cr.Cards) < 2 || len(cr.Cards) > 10 {
			return nil, invalid("a carousel needs 2–10 cards")
		}
		cards := make([]map[string]any, 0, len(cr.Cards))
		for i, card := range cr.Cards {
			link := card.Link
			if link == "" {
				link = cr.Link
			}
			m := map[string]any{"link": link}
			switch {
			case card.VideoID != "":
				thumb, err := c.videoThumbnail(ctx, accountID, card.VideoID, card.ImageHash)
				if err != nil {
					return nil, err
				}
				m["video_id"] = card.VideoID
				if h, ok := thumb["image_hash"]; ok {
					m["image_hash"] = h
				} else {
					m["picture"] = thumb["image_url"]
				}
			case card.ImageHash != "":
				m["image_hash"] = card.ImageHash
			default:
				return nil, invalid("carousel card %d needs an image or a video", i+1)
			}
			setText(m, "name", card.Headline)
			setText(m, "description", card.Description)
			if cr.CallToAction != "" {
				m["call_to_action"] = callToAction(cr.CallToAction, link)
			}
			cards = append(cards, m)
		}
		link := map[string]any{
			"link": cr.Link, "child_attachments": cards,
			"multi_share_optimized": true, "multi_share_end_card": false,
		}
		setText(link, "message", cr.Message)
		setText(link, "caption", cr.DisplayLink)
		if cr.CallToAction != "" {
			link["call_to_action"] = callToAction(cr.CallToAction, cr.Link)
		}
		story["link_data"] = link

	default:
		return nil, invalid("unknown creative format %q", cr.Format)
	}
	cv := url.Values{"name": {s.Name + " creative"}, "object_story_spec": {jsonParam(story)}}
	if s.URLTags != "" {
		cv.Set("url_tags", s.URLTags)
	}
	return cv, nil
}

// flexibleParams builds the /ads form for a flexible ad: one asset group with
// every image, video and text; Meta shows the best combination per person.
func flexibleParams(s ads.AdSpec, status string) (url.Values, error) {
	cr := s.Creative
	if s.PageID == "" || cr.Link == "" {
		return nil, invalid("page_id and creative.link are required")
	}
	group := map[string]any{"call_to_action": callToAction(cr.CallToAction, cr.Link)}
	var images, videos []map[string]any
	for _, h := range cr.ImageHashes {
		images = append(images, map[string]any{"hash": h})
	}
	for _, id := range cr.VideoIDs {
		videos = append(videos, map[string]any{"video_id": id})
	}
	if len(images)+len(videos) == 0 {
		return nil, invalid("a flexible ad needs at least one image or video")
	}
	if len(images)+len(videos) > 10 {
		return nil, invalid("a flexible ad takes at most 10 images and videos")
	}
	if images != nil {
		group["images"] = images
	}
	if videos != nil {
		group["videos"] = videos
	}
	var texts []map[string]any
	add := func(kind string, list []string) error {
		if len(list) > 5 {
			return invalid("a flexible ad takes at most 5 texts of each kind")
		}
		for _, t := range list {
			if t != "" {
				texts = append(texts, map[string]any{"text": t, "text_type": kind})
			}
		}
		return nil
	}
	if err := add("primary_text", orOne(cr.Messages, cr.Message)); err != nil {
		return nil, err
	}
	if err := add("headline", orOne(cr.Headlines, cr.Headline)); err != nil {
		return nil, err
	}
	if err := add("description", orOne(cr.Descriptions, cr.Description)); err != nil {
		return nil, err
	}
	if texts != nil {
		group["texts"] = texts
	}
	creative := map[string]any{"name": s.Name + " creative", "object_story_spec": storySpec(s)}
	if s.URLTags != "" {
		creative["url_tags"] = s.URLTags
	}
	return url.Values{
		"name": {s.Name}, "adset_id": {s.AdGroupID}, "status": {status},
		"creative":                   {jsonParam(creative)},
		"creative_asset_groups_spec": {jsonParam(map[string]any{"groups": []any{group}})},
	}, nil
}

func setText(m map[string]any, key, v string) {
	if v != "" {
		m[key] = v
	}
}

func orOne(list []string, one string) []string {
	if len(list) > 0 {
		return list
	}
	if one != "" {
		return []string{one}
	}
	return nil
}
