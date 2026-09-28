package manage

import (
	"bytes"
	"context"
	"errors"
	"io"
	"mime/multipart"
	"net/http"
	"path/filepath"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/ads"
	"github.com/iamv1n/adwise/internal/entities"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the campaign management routes under /orgs/{orgID}. r must
// already apply auth, organizations.RequireMember and
// organizations.RequireRole(admin).
func (h *Handlers) Register(r chi.Router) {
	r.Patch("/orgs/{orgID}/campaigns/{campaignID}", httpx.Handler(h.updateCampaign))
	r.Delete("/orgs/{orgID}/campaigns/{campaignID}", httpx.Handler(h.archive(LevelCampaign, "campaignID")))
	r.Patch("/orgs/{orgID}/ad-groups/{adGroupID}", httpx.Handler(h.updateAdGroup))
	r.Delete("/orgs/{orgID}/ad-groups/{adGroupID}", httpx.Handler(h.archive(LevelAdGroup, "adGroupID")))
	r.Patch("/orgs/{orgID}/ads/{adID}", httpx.Handler(h.updateAd))
	r.Delete("/orgs/{orgID}/ads/{adID}", httpx.Handler(h.archive(LevelAd, "adID")))
	r.Post("/orgs/{orgID}/bulk/status", httpx.Handler(h.bulkStatus))

	r.Post("/orgs/{orgID}/campaigns", httpx.Handler(h.createCampaign))
	r.Post("/orgs/{orgID}/ad-groups", httpx.Handler(h.createAdGroup))
	r.Post("/orgs/{orgID}/ads", httpx.Handler(h.createAd))

	r.Get("/orgs/{orgID}/accounts/{accountID}/pages", httpx.Handler(h.pages))
	r.Post("/orgs/{orgID}/accounts/{accountID}/images", httpx.Handler(h.uploadImage))
	r.Post("/orgs/{orgID}/accounts/{accountID}/videos", httpx.Handler(h.uploadVideo))
	r.Get("/orgs/{orgID}/accounts/{accountID}/videos/{videoID}", httpx.Handler(h.videoStatus))
	r.Get("/orgs/{orgID}/accounts/{accountID}/targeting-search", httpx.Handler(h.targetingSearch))
	r.Get("/orgs/{orgID}/accounts/{accountID}/audiences", httpx.Handler(h.audiences))
	r.Get("/orgs/{orgID}/accounts/{accountID}/limits", httpx.Handler(h.limits))
	r.Patch("/orgs/{orgID}/accounts/{accountID}/limits", httpx.Handler(h.setLimits))
}

func idParam(r *http.Request, name string) (uuid.UUID, error) {
	id, err := uuid.Parse(chi.URLParam(r, name))
	if err != nil {
		return uuid.Nil, httpx.ErrNotFound
	}
	return id, nil
}

func caller(r *http.Request) (uuid.UUID, *uuid.UUID) {
	m := organizations.MembershipFromContext(r.Context())
	uid := m.UserID
	return m.OrganizationID, &uid
}

func (h *Handlers) updateCampaign(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "campaignID")
	if err != nil {
		return err
	}
	var req CampaignPatch
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	c, err := h.svc.UpdateCampaign(r.Context(), org, actor, id, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]entities.Campaign{"campaign": c})
	return nil
}

func (h *Handlers) updateAdGroup(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "adGroupID")
	if err != nil {
		return err
	}
	var req AdGroupPatch
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	g, err := h.svc.UpdateAdGroup(r.Context(), org, actor, id, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]entities.AdGroup{"ad_group": g})
	return nil
}

func (h *Handlers) updateAd(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "adID")
	if err != nil {
		return err
	}
	var req AdPatch
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	a, err := h.svc.UpdateAd(r.Context(), org, actor, id, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]entities.Ad{"ad": a})
	return nil
}

func (h *Handlers) archive(level, param string) func(http.ResponseWriter, *http.Request) error {
	return func(w http.ResponseWriter, r *http.Request) error {
		id, err := idParam(r, param)
		if err != nil {
			return err
		}
		org, actor := caller(r)
		if err := h.svc.SetStatus(r.Context(), org, actor, level, id, ads.StatusArchived); err != nil {
			return err
		}
		w.WriteHeader(http.StatusNoContent)
		return nil
	}
}

func (h *Handlers) bulkStatus(w http.ResponseWriter, r *http.Request) error {
	var req BulkStatusRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	res, err := h.svc.BulkStatus(r.Context(), org, actor, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string][]BulkResult{"results": res})
	return nil
}

func (h *Handlers) createCampaign(w http.ResponseWriter, r *http.Request) error {
	var req CreateCampaignRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	c, err := h.svc.CreateCampaign(r.Context(), org, actor, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]entities.Campaign{"campaign": c})
	return nil
}

func (h *Handlers) createAdGroup(w http.ResponseWriter, r *http.Request) error {
	var req CreateAdGroupRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	g, err := h.svc.CreateAdGroup(r.Context(), org, actor, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]entities.AdGroup{"ad_group": g})
	return nil
}

func (h *Handlers) createAd(w http.ResponseWriter, r *http.Request) error {
	var req CreateAdRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	a, err := h.svc.CreateAd(r.Context(), org, actor, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusCreated, map[string]entities.Ad{"ad": a})
	return nil
}

func (h *Handlers) pages(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	org, _ := caller(r)
	pages, err := h.svc.ListPages(r.Context(), org, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string][]ads.Page{"pages": pages})
	return nil
}

func (h *Handlers) uploadImage(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	r.Body = http.MaxBytesReader(w, r.Body, MaxImageBytes+1<<20)
	if err := r.ParseMultipartForm(1 << 20); err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return Invalid("file", "must be at most 8 MB")
		}
		return Invalid("file", "send multipart/form-data with a file field")
	}
	defer r.MultipartForm.RemoveAll() //nolint:errcheck
	f, hdr, err := r.FormFile("file")
	if err != nil {
		return Invalid("file", "required")
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, MaxImageBytes+1))
	if err != nil {
		return Invalid("file", "could not be read")
	}
	if len(data) == 0 {
		return Invalid("file", "is empty")
	}
	if len(data) > MaxImageBytes {
		return Invalid("file", "must be at most 8 MB")
	}
	switch http.DetectContentType(data) {
	case "image/jpeg", "image/png":
	default:
		return Invalid("file", "must be a JPEG or PNG image")
	}
	org, actor := caller(r)
	img, err := h.svc.UploadImage(r.Context(), org, actor, id, filepath.Base(hdr.Filename), data)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]ads.Image{"image": img})
	return nil
}

// videoUploadTimeout bounds a video upload end to end. The router's request
// timeout and the server's read timeout are too short for large files, so
// the handler extends both.
const videoUploadTimeout = 15 * time.Minute

func (h *Handlers) uploadVideo(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Now().Add(videoUploadTimeout))
	_ = rc.SetWriteDeadline(time.Now().Add(videoUploadTimeout + time.Minute))
	r.Body = http.MaxBytesReader(w, r.Body, MaxVideoBytes+1<<20)

	// Stream the file part straight through to the provider, never to disk.
	mr, err := r.MultipartReader()
	if err != nil {
		return Invalid("file", "send multipart/form-data with a file field")
	}
	var part *multipart.Part
	for {
		p, err := mr.NextPart()
		if err != nil {
			return Invalid("file", "required")
		}
		if p.FormName() == "file" {
			part = p
			break
		}
	}
	defer part.Close()
	head := make([]byte, 512)
	n, _ := io.ReadFull(part, head)
	if n == 0 {
		return Invalid("file", "is empty")
	}
	head = head[:n]
	switch ct := http.DetectContentType(head); {
	case strings.HasPrefix(ct, "video/"), isMP4(head):
	default:
		return Invalid("file", "must be a video (MP4 or MOV)")
	}
	body := io.MultiReader(bytes.NewReader(head), part)

	ctx, cancel := context.WithTimeout(context.WithoutCancel(r.Context()), videoUploadTimeout)
	defer cancel()
	org, actor := caller(r)
	v, err := h.svc.UploadVideo(ctx, org, actor, id, filepath.Base(part.FileName()), body)
	if err != nil {
		var mbe *http.MaxBytesError
		if errors.As(err, &mbe) {
			return Invalid("file", "must be at most 1 GB")
		}
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]ads.Video{"video": v})
	return nil
}

// isMP4 recognises MP4/MOV files (an "ftyp" box at offset 4), which
// DetectContentType does not always classify as video.
func isMP4(head []byte) bool { return len(head) >= 8 && string(head[4:8]) == "ftyp" }

func (h *Handlers) videoStatus(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	org, _ := caller(r)
	v, err := h.svc.VideoStatus(r.Context(), org, id, chi.URLParam(r, "videoID"))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]ads.Video{"video": v})
	return nil
}

func (h *Handlers) targetingSearch(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	org, _ := caller(r)
	q := r.URL.Query()
	out, err := h.svc.SearchTargeting(r.Context(), org, id, ads.TargetingKind(q.Get("type")), q.Get("q"))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string][]ads.TargetingOption{"results": out})
	return nil
}

func (h *Handlers) audiences(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	org, _ := caller(r)
	out, err := h.svc.ListAudiences(r.Context(), org, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string][]ads.Audience{"audiences": out})
	return nil
}

func (h *Handlers) limits(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	org, _ := caller(r)
	l, err := h.svc.AccountLimits(r.Context(), org, id)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, l)
	return nil
}

func (h *Handlers) setLimits(w http.ResponseWriter, r *http.Request) error {
	id, err := idParam(r, "accountID")
	if err != nil {
		return err
	}
	var req LimitsPatch
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	org, actor := caller(r)
	l, err := h.svc.SetAccountSpendCap(r.Context(), org, actor, id, req)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, l)
	return nil
}
