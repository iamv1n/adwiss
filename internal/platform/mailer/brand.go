package mailer

import _ "embed"

// Brand colours, from the Brand kit in the admin section (web/src/components/admin/brand-kit.tsx)
// and the app theme tokens (web/src/styles/tokens.css, OKLCH converted to hex).
const (
	colorInk      = "#030921" // Ink: wordmark and headings
	colorMidnight = "#0F24A2" // Midnight: deepest logo shade
	colorBlue     = "#005BFD" // Adwise Blue: main logo plane
	colorSky      = "#6C84FE" // Sky: logo gradient highlight
	colorPrimary  = "#1f63ea" // --color-primary (brand-600): buttons, links
	colorMist     = "#EEF4FE" // Mist: light tile / soft panels
	colorMistLine = "#dbe6fd"
	colorAmber    = "#d97706" // --color-warning
	colorDanger   = "#dc2626" // --color-danger
	colorText     = "#3d4047" // neutral-700: body text
	colorMuted    = "#70737b" // neutral-500: secondary text
	colorLine     = "#e4e6ea" // neutral-200: borders
	colorCanvas   = "#F7F9FC" // light backdrop used by the brand kit
	contactEmail  = "vineet.likhitkar@gmail.com"
)

// Type stacks from the Brand kit: Bricolage Grotesque for display, Geist for text.
// Clients that can't load web fonts fall back to the system stack.
const (
	fontDisplay = `'Bricolage Grotesque',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
	fontText    = `Geist,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
	fontMono    = `'Geist Mono','SF Mono',SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace`
)

// LogoCID is the Content-ID of the embedded logo mark (a PNG of
// web/public/brand/adwise-mark.svg; Gmail and Outlook don't render SVG). Any HTML body that
// references cid:LogoCID gets the logo attached inline automatically, so it
// shows without the recipient having to load remote images.
const LogoCID = "adwise-logo"

//go:embed assets/logo.png
var logoPNG []byte
