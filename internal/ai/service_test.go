package ai

import (
	"context"
	"errors"
	"log/slog"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/stretchr/testify/require"

	"github.com/iamv1n/adwise/internal/organizations"
	"github.com/iamv1n/adwise/internal/platform/testdb"
)

func TestMain(m *testing.M) { os.Exit(testdb.Run(m)) }

func member(f testdb.Fixture) organizations.Membership {
	return organizations.Membership{OrganizationID: f.OrganizationID, UserID: f.UserID, Role: organizations.RoleOwner}
}

func TestConversationsArePrivateToTheirOwner(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	f := testdb.NewFixture(t, db)
	other := testdb.NewFixture(t, db)
	svc := NewService(db, &Agent{}, "test-model", 0, slog.Default())

	c, err := svc.Prepare(ctx, member(f), nil, "Where am I wasting money?\nsecond line")
	require.NoError(t, err)
	require.Equal(t, "Where am I wasting money?", c.Title)

	list, err := svc.List(ctx, member(f))
	require.NoError(t, err)
	require.Len(t, list, 1)

	// Another org's user can't see, continue or delete it.
	_, err = svc.Get(ctx, member(other), c.ID)
	require.ErrorIs(t, err, ErrConversationNotFound)
	_, err = svc.Prepare(ctx, member(other), &c.ID, "hi")
	require.ErrorIs(t, err, ErrConversationNotFound)
	require.ErrorIs(t, svc.Delete(ctx, member(other), c.ID), ErrConversationNotFound)

	// Nor can a second user in the same org.
	sameOrg := member(f)
	sameOrg.UserID = other.UserID
	_, err = svc.Get(ctx, sameOrg, c.ID)
	require.ErrorIs(t, err, ErrConversationNotFound)

	require.NoError(t, svc.Delete(ctx, member(f), c.ID))
	_, err = svc.Get(ctx, member(f), c.ID)
	require.ErrorIs(t, err, ErrConversationNotFound)
}

func TestMessagesKeepOrderAndBumpConversation(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	f := testdb.NewFixture(t, db)
	svc := NewService(db, &Agent{}, "test-model", 0, slog.Default())
	c, err := svc.Prepare(ctx, member(f), nil, "q1")
	require.NoError(t, err)

	for i, role := range []string{"user", "assistant", "user", "assistant"} {
		_, err := svc.st.addMessage(ctx, newMessage{ConversationID: c.ID, OrganizationID: f.OrganizationID, Role: role,
			Text: role + string(rune('0'+i)), Tools: []string{"get_overview"}})
		require.NoError(t, err)
	}
	d, err := svc.Get(ctx, member(f), c.ID)
	require.NoError(t, err)
	require.Len(t, d.Messages, 4)
	require.Equal(t, "user0", d.Messages[0].Text)
	require.Equal(t, "assistant3", d.Messages[3].Text)
	require.Equal(t, []string{"get_overview"}, d.Messages[1].Tools)
	require.True(t, d.UpdatedAt.After(c.UpdatedAt) || d.UpdatedAt.Equal(c.UpdatedAt))

	last2, err := svc.st.messages(ctx, c.ID, 2)
	require.NoError(t, err)
	require.Equal(t, []string{"user2", "assistant3"}, []string{last2[0].Text, last2[1].Text})
}

func TestPrepareEnforcesDailyTokenCap(t *testing.T) {
	db := testdb.New(t)
	ctx := context.Background()
	f := testdb.NewFixture(t, db)
	svc := NewService(db, &Agent{}, "test-model", 1000, slog.Default())

	c, err := svc.Prepare(ctx, member(f), nil, "q")
	require.NoError(t, err)
	_, err = svc.st.addMessage(ctx, newMessage{ConversationID: c.ID, OrganizationID: f.OrganizationID, Role: "assistant",
		Text: "a", Usage: Usage{InputTokens: 900, OutputTokens: 100}})
	require.NoError(t, err)

	_, err = svc.Prepare(ctx, member(f), &c.ID, "again")
	require.ErrorIs(t, err, ErrDailyLimit)

	// Yesterday's usage doesn't count.
	svc.now = func() time.Time { return time.Now().Add(48 * time.Hour) }
	_, err = svc.Prepare(ctx, member(f), &c.ID, "again")
	require.NoError(t, err)
}

func TestPrepareWithoutAgentIsDisabled(t *testing.T) {
	db := testdb.New(t)
	f := testdb.NewFixture(t, db)
	svc := NewService(db, nil, "", 0, slog.Default())
	_, err := svc.Prepare(context.Background(), member(f), nil, "q")
	require.True(t, errors.Is(err, ErrDisabled))
	// Reading history still works without a key.
	_, err = svc.List(context.Background(), member(f))
	require.NoError(t, err)
}

func TestTitleAndHistoryHelpers(t *testing.T) {
	require.Equal(t, "New conversation", title("   "))
	long := title(strings.Repeat("a", 200))
	require.Equal(t, titleMaxRunes, len([]rune(long)))
	require.True(t, strings.HasSuffix(long, "…"))

	h := dropUnanswered([]Turn{{"user", "a"}, {"user", "b"}, {"assistant", "c"}, {"user", "d"}})
	require.Equal(t, []Turn{{"user", "b"}, {"assistant", "c"}, {"user", "d"}}, h)
}
