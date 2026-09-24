// Package organizations manages organizations, memberships, roles and invitations.
package organizations

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/google/uuid"

	"github.com/iamv1n/adwise/internal/audit"
	"github.com/iamv1n/adwise/internal/auth"
	"github.com/iamv1n/adwise/internal/platform/database"
	"github.com/iamv1n/adwise/internal/platform/httpx"
	"github.com/iamv1n/adwise/internal/store"
)

var (
	ErrLastOwner = httpx.NewError(http.StatusConflict, "last_owner",
		"an organization must keep at least one owner")
	ErrRoleTooHigh = httpx.NewError(http.StatusForbidden, "role_too_high",
		"you cannot grant or manage a role higher than your own")
	ErrAlreadyMember = httpx.NewError(http.StatusConflict, "already_member",
		"this person is already a member of the organization")
	ErrInvitationExists = httpx.NewError(http.StatusConflict, "invitation_exists",
		"an invitation for this email is already pending")
	ErrInvitationInvalid = httpx.NewError(http.StatusNotFound, "invitation_invalid",
		"this invitation is invalid, expired or already used")
	ErrInvitationEmail = httpx.NewError(http.StatusForbidden, "invitation_email_mismatch",
		"this invitation was sent to a different email address")
)

type Service struct {
	db            *database.DB
	invitationTTL time.Duration
}

func NewService(db *database.DB, invitationTTL time.Duration) *Service {
	return &Service{db: db, invitationTTL: invitationTTL}
}

type OrgWithRole struct {
	ID   uuid.UUID `json:"id"`
	Name string    `json:"name"`
	Slug string    `json:"slug"`
	Role Role      `json:"role"`
}

func (s *Service) ListForUser(ctx context.Context, userID uuid.UUID) ([]OrgWithRole, error) {
	rows, err := s.db.ListOrganizationsForUser(ctx, userID)
	if err != nil {
		return nil, err
	}
	out := make([]OrgWithRole, len(rows))
	for i, r := range rows {
		out[i] = OrgWithRole{ID: r.Organization.ID, Name: r.Organization.Name, Slug: r.Organization.Slug, Role: r.Role}
	}
	return out, nil
}

// Create makes a new organization with the caller as its owner.
func (s *Service) Create(ctx context.Context, userID uuid.UUID, name string) (OrgWithRole, error) {
	name = strings.TrimSpace(name)
	base := slugify(name)

	// The first attempt uses the bare slug; collisions retry with a random suffix.
	for attempt := 0; ; attempt++ {
		slug := base
		if attempt > 0 {
			slug = base + "-" + randomSuffix()
		}

		var org store.Organization
		err := s.db.InTx(ctx, func(q *store.Queries) error {
			var err error
			if org, err = q.CreateOrganization(ctx, store.CreateOrganizationParams{Name: name, Slug: slug}); err != nil {
				return err
			}
			if err := q.AddOrganizationUser(ctx, store.AddOrganizationUserParams{
				OrganizationID: org.ID, UserID: userID, Role: RoleOwner,
			}); err != nil {
				return err
			}
			return audit.Record(ctx, q, audit.Entry{
				OrganizationID: &org.ID, ActorUserID: &userID,
				Action: "organization.created", EntityType: "organization", EntityID: org.ID.String(),
			})
		})
		if database.IsUniqueViolation(err) && attempt < 5 {
			continue
		}
		if err != nil {
			return OrgWithRole{}, err
		}
		return OrgWithRole{ID: org.ID, Name: org.Name, Slug: org.Slug, Role: RoleOwner}, nil
	}
}

func (s *Service) ListMembers(ctx context.Context, orgID uuid.UUID) ([]store.ListMembersRow, error) {
	return s.db.ListMembers(ctx, orgID)
}

// ChangeRole sets a member's role. Actors cannot manage members above their own
// role, grant a role above their own, or demote the last owner.
func (s *Service) ChangeRole(ctx context.Context, actor Membership, targetUserID uuid.UUID, role Role) error {
	if !AtLeast(actor.Role, role) {
		return ErrRoleTooHigh
	}
	return s.db.InTx(ctx, func(q *store.Queries) error {
		target, err := s.lockAndLoadMember(ctx, q, actor.OrganizationID, targetUserID)
		if err != nil {
			return err
		}
		if !AtLeast(actor.Role, target.Role) {
			return ErrRoleTooHigh
		}
		if target.Role == role {
			return nil
		}
		if target.Role == RoleOwner {
			if err := ensureAnotherOwner(ctx, q, actor.OrganizationID); err != nil {
				return err
			}
		}
		if err := q.UpdateMemberRole(ctx, store.UpdateMemberRoleParams{
			OrganizationID: actor.OrganizationID, UserID: targetUserID, Role: role,
		}); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &actor.OrganizationID, ActorUserID: &actor.UserID,
			Action: "member.role_changed", EntityType: "user", EntityID: targetUserID.String(),
			Metadata: map[string]any{"from": target.Role, "to": role},
		})
	})
}

// RemoveMember removes a member. Anyone may remove themselves (leave); removing
// others requires admin and a role at least as high as the target's.
func (s *Service) RemoveMember(ctx context.Context, actor Membership, targetUserID uuid.UUID) error {
	self := actor.UserID == targetUserID
	if !self && !AtLeast(actor.Role, RoleAdmin) {
		return httpx.ErrForbidden
	}
	return s.db.InTx(ctx, func(q *store.Queries) error {
		target, err := s.lockAndLoadMember(ctx, q, actor.OrganizationID, targetUserID)
		if err != nil {
			return err
		}
		if !self && !AtLeast(actor.Role, target.Role) {
			return ErrRoleTooHigh
		}
		if target.Role == RoleOwner {
			if err := ensureAnotherOwner(ctx, q, actor.OrganizationID); err != nil {
				return err
			}
		}
		if err := q.RemoveMember(ctx, store.RemoveMemberParams{OrganizationID: actor.OrganizationID, UserID: targetUserID}); err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &actor.OrganizationID, ActorUserID: &actor.UserID,
			Action: "member.removed", EntityType: "user", EntityID: targetUserID.String(),
		})
	})
}

type CreatedInvitation struct {
	Invitation store.OrganizationInvitation
	Token      string
}

func (s *Service) Invite(ctx context.Context, actor Membership, email string, role Role) (CreatedInvitation, error) {
	if !AtLeast(actor.Role, role) {
		return CreatedInvitation{}, ErrRoleTooHigh
	}
	email = strings.TrimSpace(email)

	token, hash, err := auth.NewToken()
	if err != nil {
		return CreatedInvitation{}, err
	}

	var inv store.OrganizationInvitation
	err = s.db.InTx(ctx, func(q *store.Queries) error {
		member, err := q.IsMemberByEmail(ctx, store.IsMemberByEmailParams{OrganizationID: actor.OrganizationID, Email: email})
		if err != nil {
			return err
		}
		if member {
			return ErrAlreadyMember
		}
		if err := q.RevokeExpiredOpenInvitation(ctx, store.RevokeExpiredOpenInvitationParams{
			OrganizationID: actor.OrganizationID, Email: email,
		}); err != nil {
			return err
		}
		inv, err = q.CreateInvitation(ctx, store.CreateInvitationParams{
			OrganizationID: actor.OrganizationID,
			Email:          email,
			Role:           role,
			TokenHash:      hash,
			InvitedBy:      actor.UserID,
			ExpiresAt:      time.Now().Add(s.invitationTTL),
		})
		if database.IsUniqueViolation(err) {
			return ErrInvitationExists
		}
		if err != nil {
			return err
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &actor.OrganizationID, ActorUserID: &actor.UserID,
			Action: "invitation.created", EntityType: "invitation", EntityID: inv.ID.String(),
			Metadata: map[string]any{"email": email, "role": role},
		})
	})
	return CreatedInvitation{Invitation: inv, Token: token}, err
}

func (s *Service) ListInvitations(ctx context.Context, orgID uuid.UUID) ([]store.OrganizationInvitation, error) {
	return s.db.ListOpenInvitations(ctx, orgID)
}

func (s *Service) RevokeInvitation(ctx context.Context, actor Membership, invitationID uuid.UUID) error {
	return s.db.InTx(ctx, func(q *store.Queries) error {
		n, err := q.RevokeInvitation(ctx, store.RevokeInvitationParams{ID: invitationID, OrganizationID: actor.OrganizationID})
		if err != nil {
			return err
		}
		if n == 0 {
			return httpx.ErrNotFound
		}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &actor.OrganizationID, ActorUserID: &actor.UserID,
			Action: "invitation.revoked", EntityType: "invitation", EntityID: invitationID.String(),
		})
	})
}

// AcceptInvitation adds the user to the invitation's organization. The user's
// email must match the invited email.
func (s *Service) AcceptInvitation(ctx context.Context, user store.User, token string) (OrgWithRole, error) {
	var out OrgWithRole
	err := s.db.InTx(ctx, func(q *store.Queries) error {
		inv, err := q.GetOpenInvitationByTokenHash(ctx, auth.HashToken(token))
		if database.IsNotFound(err) {
			return ErrInvitationInvalid
		}
		if err != nil {
			return err
		}
		if !strings.EqualFold(inv.Email, user.Email) {
			return ErrInvitationEmail
		}

		role := inv.Role
		existing, err := q.GetMembership(ctx, store.GetMembershipParams{OrganizationID: inv.OrganizationID, UserID: user.ID})
		switch {
		case err == nil:
			role = existing.Role // already a member; keep the current role
		case database.IsNotFound(err):
			if err := q.AddOrganizationUser(ctx, store.AddOrganizationUserParams{
				OrganizationID: inv.OrganizationID, UserID: user.ID, Role: inv.Role,
			}); err != nil {
				return err
			}
		default:
			return err
		}

		if err := q.MarkInvitationAccepted(ctx, inv.ID); err != nil {
			return err
		}
		org, err := q.GetOrganization(ctx, inv.OrganizationID)
		if err != nil {
			return err
		}
		out = OrgWithRole{ID: org.ID, Name: org.Name, Slug: org.Slug, Role: role}
		return audit.Record(ctx, q, audit.Entry{
			OrganizationID: &org.ID, ActorUserID: &user.ID,
			Action: "invitation.accepted", EntityType: "invitation", EntityID: inv.ID.String(),
		})
	})
	return out, err
}

// lockAndLoadMember locks the organization row so concurrent membership changes
// serialise, then loads the target membership.
func (s *Service) lockAndLoadMember(ctx context.Context, q *store.Queries, orgID, userID uuid.UUID) (store.OrganizationUser, error) {
	if err := q.LockOrganization(ctx, orgID); err != nil {
		return store.OrganizationUser{}, err
	}
	m, err := q.GetMembership(ctx, store.GetMembershipParams{OrganizationID: orgID, UserID: userID})
	if database.IsNotFound(err) {
		return store.OrganizationUser{}, httpx.ErrNotFound
	}
	return m, err
}

func ensureAnotherOwner(ctx context.Context, q *store.Queries, orgID uuid.UUID) error {
	n, err := q.CountOwners(ctx, orgID)
	if err != nil {
		return err
	}
	if n <= 1 {
		return ErrLastOwner
	}
	return nil
}

var nonSlug = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	s := strings.Trim(nonSlug.ReplaceAllString(strings.ToLower(name), "-"), "-")
	if len(s) > 48 {
		s = strings.TrimRight(s[:48], "-")
	}
	if s == "" {
		s = "org"
	}
	return s
}

func randomSuffix() string {
	b := make([]byte, 3)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
