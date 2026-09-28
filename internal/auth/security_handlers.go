package auth

import (
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/platform/httpx"
)

// securityPublicRoutes are unauthenticated sign-in and recovery steps
// (mounted behind the credential rate limit).
func (h *Handlers) securityPublicRoutes(r chi.Router) {
	r.Post("/login/code/start", httpx.Handler(h.loginCodeStart))
	r.Post("/login/code/verify", httpx.Handler(h.loginCodeVerify))
	r.Post("/challenge/email", httpx.Handler(h.challengeEmail))
	r.Post("/challenge/verify", httpx.Handler(h.challengeVerify))
	r.Post("/password/forgot", httpx.Handler(h.passwordForgot))
	r.Post("/password/reset", httpx.Handler(h.passwordReset))
}

// securityRoutes are the authenticated account-security endpoints.
func (h *Handlers) securityRoutes(r chi.Router) {
	r.Post("/email/verify", httpx.Handler(h.emailVerify))
	r.Post("/email/resend", httpx.Handler(h.emailResend))
	r.Post("/password/change", httpx.Handler(h.passwordChange))
	r.Get("/security", httpx.Handler(h.securityOverview))
	r.Post("/2fa/totp/setup", httpx.Handler(h.totpSetup))
	r.Post("/2fa/totp/enable", httpx.Handler(h.totpEnable))
	r.Post("/2fa/totp/disable", httpx.Handler(h.totpDisable))
	r.Post("/2fa/email", httpx.Handler(h.email2FA))
	r.Post("/2fa/recovery-codes", httpx.Handler(h.recoveryCodes))
	r.Post("/phone", httpx.Handler(h.phoneAdd))
	r.Post("/phone/verify", httpx.Handler(h.phoneVerify))
	r.Delete("/phone", httpx.Handler(h.phoneRemove))
	r.Delete("/devices/{id}", httpx.Handler(h.deviceRemove))
	r.Post("/sessions/revoke-others", httpx.Handler(h.revokeOthers))
}

var empty = struct{}{}

func (h *Handlers) setDeviceCookie(w http.ResponseWriter, token string) {
	if token == "" {
		return
	}
	h.setCookie(w, DeviceCookieName, token, time.Now().Add(deviceCookieTTL))
}

func (h *Handlers) writeLoginResult(w http.ResponseWriter, res LoginResult) {
	if res.Session != nil {
		h.setSessionCookie(w, *res.Session)
	}
	h.setDeviceCookie(w, res.DeviceToken)
	httpx.JSON(w, http.StatusOK, res)
}

type emailRequest struct {
	Email string `json:"email" validate:"required,email,max=254"`
}

func (h *Handlers) loginCodeStart(w http.ResponseWriter, r *http.Request) error {
	var req emailRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.StartEmailLogin(r.Context(), req.Email, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

type loginCodeVerifyRequest struct {
	Email          string `json:"email" validate:"required,email,max=254"`
	Code           string `json:"code" validate:"required,max=32"`
	RememberDevice bool   `json:"remember_device"`
}

func (h *Handlers) loginCodeVerify(w http.ResponseWriter, r *http.Request) error {
	var req loginCodeVerifyRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	res, err := h.svc.VerifyEmailLogin(r.Context(), req.Email, req.Code, req.RememberDevice, clientInfo(r))
	if err != nil {
		return err
	}
	h.writeLoginResult(w, res)
	return nil
}

type challengeEmailRequest struct {
	Challenge string `json:"challenge" validate:"required,max=128"`
}

func (h *Handlers) challengeEmail(w http.ResponseWriter, r *http.Request) error {
	var req challengeEmailRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.SendChallengeEmail(r.Context(), req.Challenge, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

type challengeVerifyRequest struct {
	Challenge      string `json:"challenge" validate:"required,max=128"`
	Method         string `json:"method" validate:"required,oneof=totp email recovery"`
	Code           string `json:"code" validate:"required,max=32"`
	RememberDevice bool   `json:"remember_device"`
}

func (h *Handlers) challengeVerify(w http.ResponseWriter, r *http.Request) error {
	var req challengeVerifyRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	res, err := h.svc.VerifyChallenge(r.Context(), req.Challenge, req.Method, req.Code, req.RememberDevice, clientInfo(r))
	if err != nil {
		return err
	}
	h.writeLoginResult(w, res)
	return nil
}

func (h *Handlers) passwordForgot(w http.ResponseWriter, r *http.Request) error {
	var req emailRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.ForgotPassword(r.Context(), req.Email, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

type passwordResetRequest struct {
	Token    string `json:"token" validate:"required,max=128"`
	Password string `json:"password" validate:"required"`
}

func (h *Handlers) passwordReset(w http.ResponseWriter, r *http.Request) error {
	var req passwordResetRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.ResetPassword(r.Context(), req.Token, req.Password, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
	return nil
}

type codeRequest struct {
	Code string `json:"code" validate:"required,max=32"`
}

func (h *Handlers) emailVerify(w http.ResponseWriter, r *http.Request) error {
	var req codeRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.VerifyEmail(r.Context(), FromContext(r.Context()).User, req.Code, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]bool{"email_verified": true})
	return nil
}

func (h *Handlers) emailResend(w http.ResponseWriter, r *http.Request) error {
	if err := h.svc.ResendVerification(r.Context(), FromContext(r.Context()).User, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

type passwordChangeRequest struct {
	CurrentPassword string `json:"current_password" validate:"max=256"`
	NewPassword     string `json:"new_password" validate:"required"`
}

func (h *Handlers) passwordChange(w http.ResponseWriter, r *http.Request) error {
	var req passwordChangeRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.ChangePassword(r.Context(), FromContext(r.Context()), req.CurrentPassword, req.NewPassword, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

func (h *Handlers) securityOverview(w http.ResponseWriter, r *http.Request) error {
	o, err := h.svc.Overview(r.Context(), FromContext(r.Context()), clientInfo(r).DeviceToken)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, o)
	return nil
}

// passwordRequest is the body of sensitive changes. The password is checked
// by the service (password_required), not the validator.
type passwordRequest struct {
	Password string `json:"password" validate:"max=256"`
}

func (h *Handlers) totpSetup(w http.ResponseWriter, r *http.Request) error {
	var req passwordRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	secret, url, err := h.svc.SetupTOTP(r.Context(), FromContext(r.Context()), req.Password)
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]string{"secret": secret, "otpauth_url": url})
	return nil
}

func (h *Handlers) totpEnable(w http.ResponseWriter, r *http.Request) error {
	var req codeRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	codes, err := h.svc.EnableTOTP(r.Context(), FromContext(r.Context()), req.Code, clientInfo(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string][]string{"recovery_codes": codes})
	return nil
}

type totpDisableRequest struct {
	Password string `json:"password" validate:"max=256"`
	Code     string `json:"code" validate:"required,max=32"`
}

func (h *Handlers) totpDisable(w http.ResponseWriter, r *http.Request) error {
	var req totpDisableRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.DisableTOTP(r.Context(), FromContext(r.Context()), req.Password, req.Code, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

type email2FARequest struct {
	Password string `json:"password" validate:"max=256"`
	Enabled  bool   `json:"enabled"`
}

func (h *Handlers) email2FA(w http.ResponseWriter, r *http.Request) error {
	var req email2FARequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.SetEmail2FA(r.Context(), FromContext(r.Context()), req.Password, req.Enabled, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

func (h *Handlers) recoveryCodes(w http.ResponseWriter, r *http.Request) error {
	var req passwordRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	codes, err := h.svc.RegenerateRecoveryCodes(r.Context(), FromContext(r.Context()), req.Password, clientInfo(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string][]string{"recovery_codes": codes})
	return nil
}

type phoneRequest struct {
	Password string `json:"password" validate:"max=256"`
	Phone    string `json:"phone" validate:"max=32"`
}

func (h *Handlers) phoneAdd(w http.ResponseWriter, r *http.Request) error {
	var req phoneRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.AddPhone(r.Context(), FromContext(r.Context()), req.Password, req.Phone, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

func (h *Handlers) phoneVerify(w http.ResponseWriter, r *http.Request) error {
	var req codeRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.VerifyPhone(r.Context(), FromContext(r.Context()), req.Code, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

func (h *Handlers) phoneRemove(w http.ResponseWriter, r *http.Request) error {
	var req passwordRequest
	if err := httpx.Decode(r, &req); err != nil {
		return err
	}
	if err := h.svc.RemovePhone(r.Context(), FromContext(r.Context()), req.Password, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

func (h *Handlers) deviceRemove(w http.ResponseWriter, r *http.Request) error {
	id, err := uuid.Parse(chi.URLParam(r, "id"))
	if err != nil {
		return httpx.ErrNotFound
	}
	if err := h.svc.RemoveDevice(r.Context(), FromContext(r.Context()), id, clientInfo(r)); err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, empty)
	return nil
}

func (h *Handlers) revokeOthers(w http.ResponseWriter, r *http.Request) error {
	n, err := h.svc.RevokeOtherSessions(r.Context(), FromContext(r.Context()), clientInfo(r))
	if err != nil {
		return err
	}
	httpx.JSON(w, http.StatusOK, map[string]int64{"revoked": n})
	return nil
}
