package entities

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/analytics/params"
	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/httpx"
)

type Handlers struct {
	svc *Service
}

func NewHandlers(svc *Service) *Handlers { return &Handlers{svc: svc} }

// Register adds the entity routes under /orgs/{orgID}. r must already apply
// auth and organizations.RequireMember.
func (h *Handlers) Register(r chi.Router) {
	r.Get("/orgs/{orgID}/accounts", httpx.Handler(h.listAccounts))
	r.With(organizations.RequireRole(organizations.RoleAdmin)).
		Patch("/orgs/{orgID}/accounts/{accountID}", httpx.Handler(h.updateAccount))
	r.Get("/orgs/{orgID}/campaigns", httpx.Handler(h.listCampaigns))
	r.Get("/orgs/{orgID}/ad-groups", httpx.Handler(h.listAdGroups))
	r.Get("/orgs/{orgID}/ads", httpx.Handler(h.listAds))
	r.Get("/orgs/{orgID}/creatives", httpx.Handler(h.listCreatives))
}

func (h *Handlers) listAccounts(w http.ResponseWriter, r *http.Request) error {
	provider, err := params.Provider(r.URL.Query())
	if err != nil {
		return err
	}
	accounts, err := h.svc.ListAccounts(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, provider)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"accounts": accounts, "labels": Labels})
	return nil
}

type updateAccountRequest struct {
	SyncEnabled *bool `json:"sync_enabled" validate:"required"`
}

func (h *Handlers) updateAccount(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "accountID"))
	if err != nil {
		return ErrAccountNotFound
	}
	var req updateAccountRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	m := organizations.MembershipFromContext(r.Context())
	acct, err := h.svc.SetSyncEnabled(r.Context(), m.OrganizationID, m.UserID, id, *req.SyncEnabled)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]any{"account": acct})
	return nil
}

func parseListFilter(r *http.Request) (ListFilter, error) {
	q := r.URL.Query()
	var f ListFilter
	var err error
	if f.AccountID, err = params.UUID(q, "account_id"); err != nil {
		return f, err
	}
	if f.CampaignID, err = params.UUID(q, "campaign_id"); err != nil {
		return f, err
	}
	if f.AdGroupID, err = params.UUID(q, "ad_group_id"); err != nil {
		return f, err
	}
	if f.Provider, err = params.Provider(q); err != nil {
		return f, err
	}
	if f.Status, err = params.Status(q); err != nil {
		return f, err
	}
	if f.Search, err = params.Search(q); err != nil {
		return f, err
	}
	if f.Range, err = params.OptionalDateRange(q); err != nil {
		return f, err
	}
	if f.Page, err = params.ParsePage(q); err != nil {
		return f, err
	}
	return f, nil
}

func listResponse(key string, rows any, total int64, f ListFilter) map[string]any {
	out := map[string]any{key: rows, "page": params.PageJSON(f.Page, total), "labels": Labels}
	if f.Range != nil {
		out["range"] = f.Range.JSON()
	}
	return out
}

func (h *Handlers) listCampaigns(w http.ResponseWriter, r *http.Request) error {
	f, err := parseListFilter(r)
	if err != nil {
		return err
	}
	rows, total, err := h.svc.ListCampaigns(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, listResponse("campaigns", rows, total, f))
	return nil
}

func (h *Handlers) listAdGroups(w http.ResponseWriter, r *http.Request) error {
	f, err := parseListFilter(r)
	if err != nil {
		return err
	}
	rows, total, err := h.svc.ListAdGroups(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, listResponse("ad_groups", rows, total, f))
	return nil
}

func (h *Handlers) listAds(w http.ResponseWriter, r *http.Request) error {
	f, err := parseListFilter(r)
	if err != nil {
		return err
	}
	rows, total, err := h.svc.ListAds(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, listResponse("ads", rows, total, f))
	return nil
}

func (h *Handlers) listCreatives(w http.ResponseWriter, r *http.Request) error {
	f, err := parseListFilter(r)
	if err != nil {
		return err
	}
	rows, total, err := h.svc.ListCreatives(r.Context(), organizations.MembershipFromContext(r.Context()).OrganizationID, f)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, listResponse("creatives", rows, total, f))
	return nil
}
