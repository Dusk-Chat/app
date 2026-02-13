Discord-like Chat App — Design Specification

1. Overview
   This chat application embodies a minimalist, high-contrast aesthetic rooted in Dutch modernism and the systematic rigor of Wim Crouwel and De Stijl. The design employs a bold grotesque sans-serif for hierarchy paired with monospace type for technical details, creating a visual language that feels both contemporary and utilitarian.

International orange serves as the sole accent color—a deliberate, high-energy choice that activates the otherwise austere black-and-white foundation. The layout is governed by a strict modular grid, ensuring every element aligns to a mathematically consistent rhythm. Motion design follows Motion principles (https://motion.dev/): smooth, purposeful, and never gratuitous.

Navigation transforms the experience through a full-screen overlay menu, reinforcing the app's bold, confident spatial decisions. Every interaction is deliberate, every transition calculated, every whitespace meaningful.

2. Visual System
   Typography Hierarchy
   Primary Typeface: Space Grotesk (Bold Grotesque)

Weights: 400 (Regular), 500 (Medium), 700 (Bold)
Usage:
Display/Headers: 700 weight, tight letter-spacing (-0.02em)
Body text: 400 weight, normal spacing
UI labels: 500 weight, uppercase with +0.05em tracking
Interactive elements: 500 weight
Secondary Typeface: JetBrains Mono (Monospace)

Weights: 400 (Regular), 500 (Medium)
Usage:
Timestamps: 400 weight, 12px
User IDs / technical metadata: 400 weight
Code blocks or system messages: 400 weight
Status indicators: 500 weight, uppercase
Scale (Desktop):

Display: 48px / 56px line-height
H1: 32px / 40px
H2: 24px / 32px
H3: 20px / 28px
Body: 16px / 24px
Small: 14px / 20px
Micro: 12px / 16px
Scale (Mobile):

Display: 32px / 40px
H1: 24px / 32px
H2: 20px / 28px
Body: 16px / 24px
Small: 14px / 20px
Micro: 12px / 16px
Color Palette
Base Colors:

Pure Black: #000000 — primary background, text on light surfaces
Off White: #FAFAFA — light background variant, cards
True White: #FFFFFF — text on dark surfaces, highest contrast elements
Contrast Layers:

Gray 900: #0A0A0A — secondary dark surface
Gray 800: #1A1A1A — elevated dark surface
Gray 200: #E5E5E5 — borders on light mode
Gray 300: #D4D4D4 — subtle dividers
Accent:

International Orange: #FF4F00 — primary accent for CTAs, active states, highlights
Orange Hover: #E64500 — hover state darkening
Orange Muted: #FF4F0015 — 8% opacity backgrounds for subtle emphasis
Semantic Colors:

Success: #00FF00 — online status, success states
Warning: #FFFF00 — warnings
Error: #FF0000 — errors, destructive actions
Spacing + Grid Philosophy
Base Unit: 8px

Spacing Scale:

xs: 4px
sm: 8px
md: 16px
lg: 24px
xl: 32px
2xl: 48px
3xl: 64px
4xl: 96px
Grid System:

Desktop: 12-column grid, 24px gutter, 1440px max-width container
Tablet: 8-column grid, 16px gutter, 100% width
Mobile: 4-column grid, 16px gutter, 100% width
Modular Rhythm:
All components snap to 8px vertical rhythm. Section padding follows 64px (desktop) / 48px (tablet) / 32px (mobile) increments.

Iconography + Motifs
Icon System: Lucide Vue

Stroke Width: 2px (consistent with grotesque weight)
Size Scale: 16px, 20px, 24px, 32px
Style: Sharp, geometric, minimal
Geometric Motifs:

45° diagonal elements for dynamic composition
Perfect squares and circles for buttons/avatars
2px solid borders (never rounded corners on containers)
Right angles maintained throughout
Avatar System:

Perfect circles for user avatars (only curved element)
32px (small), 40px (medium), 48px (large), 64px (profile)
Status indicator: 8px circle, bottom-right overlap with 2px white border 3. Layout Design
Page Structure
Three-Column Layout (Desktop):

┌────────────┬─────────────────────────┬────────────┐
│ Server │ Main Chat Area │ Sidebar │
│ List │ │ (Users/ │
│ 64px │ Fluid │ Info) │
│ │ │ 280px │
└────────────┴─────────────────────────┴────────────┘
Two-Column Layout (Tablet):

┌────────────┬─────────────────────────┐
│ Channel │ Main Chat Area │
│ List │ │
│ 240px │ Fluid │
│ │ │
└────────────┴─────────────────────────┘
Single-Column Layout (Mobile):

Full-screen chat view
Hamburger menu reveals server/channel navigation as full-screen overlay
Swipe gestures for quick navigation
Component Designs
Server List (Left Sidebar - Desktop)
64px fixed width
Black background #000000
Server icons: 48px squares, 8px margin top/bottom
Active server: 4px international orange border-left
Hover: subtle scale to 1.05, 200ms ease-out
Channel List (Secondary Sidebar)
240px width on desktop, collapses on tablet
Background: #0A0A0A
Section headers: uppercase, 500 weight, 12px, #FFFFFF at 60% opacity
Channel items:
16px font, 400 weight
40px height, 8px padding-left
Hover: #1A1A1A background
Active: international orange left border (4px), #FFFFFF text
Unread indicator: 6px orange circle, right-aligned
Main Chat Area
Background: #000000
Messages:
Avatar: 40px circle, left-aligned
Username: 500 weight, 16px, #FFFFFF
Timestamp: JetBrains Mono, 12px, #FFFFFF at 50% opacity
Message text: 400 weight, 16px, #FFFFFF at 90% opacity
Spacing: 16px between messages, 8px between text lines
Hover: #0A0A0A background on entire message block
Message Input
Fixed bottom position
Height: 64px
Background: #1A1A1A
Border-top: 1px solid #FFFFFF at 10% opacity
Input field:
Background: #000000
Border: 2px solid #FFFFFF at 20% opacity
Focus: 2px solid international orange
Padding: 12px 16px
Placeholder: JetBrains Mono, #FFFFFF at 40% opacity
Buttons
Primary (Orange):

Background: #FF4F00
Text: #FFFFFF, 500 weight, uppercase, +0.05em tracking
Padding: 12px 24px
Height: 48px
Border: none
Hover: #E64500 background, scale 0.98
Active: scale 0.96
Secondary (Ghost):

Background: transparent
Border: 2px solid #FFFFFF
Text: #FFFFFF, 500 weight, uppercase
Hover: background #FFFFFF, text #000000
Icon Button:

40px × 40px square
Background: #1A1A1A
Hover: background #FF4F00, icon color #FFFFFF
Cards/Modals
Background: #0A0A0A
Border: 2px solid #FFFFFF at 20% opacity
Padding: 32px
Shadow: none (rely on borders for hierarchy)
Title: 24px, 700 weight, #FFFFFF
Dividers: 1px solid #FFFFFF at 10% opacity
Navigation Overlay (Full-Screen Menu)
Background: #000000
Z-index: 1000
Menu items:
48px font, 700 weight, #FFFFFF
Hover: international orange color, translate-x 16px
Stagger animation on entrance (100ms delay per item)
Close button: top-right, 48px × 48px, white X icon
Backdrop blur: none (solid black)
User Sidebar (Right - Desktop)
280px width
Background: #0A0A0A
Member list:
Role headers: uppercase, JetBrains Mono, 12px, orange
User items: 40px height, avatar + name
Status dot: 8px, green/yellow/gray
Hover: #1A1A1A background
Responsive Variations
Desktop (1440px+):

Full three-column layout
All interactions visible
Spacious padding (32px standard)
Tablet (768px - 1439px):

Two-column: channels + chat
Right sidebar accessible via icon toggle
Reduced padding (24px)
Mobile (< 768px):

Single column, full-screen chat
Hamburger menu triggers full-screen overlay for navigation
Server list becomes horizontal scrollable bar at top (48px height)
Swipe right: open channel list
Swipe left: open user list
Message input remains fixed bottom
Padding: 16px 4. Interaction + Motion
Entrance Animations (Motion)
Page Load:

Server list fades in from left: opacity 0 → 1, x: -20 → 0, 400ms ease-out
Channel list follows: 100ms delay, same animation
Chat messages stagger in: 50ms delay per message, opacity 0 → 1, y: 10 → 0, 300ms ease-out
Right sidebar: 200ms delay, fade + slide from right
New Message:

opacity 0 → 1, y: 20 → 0, 300ms ease-out
Scale in from 0.95 → 1.0 simultaneously
Modal/Overlay:

Background: opacity 0 → 1, 200ms
Content: scale 0.95 → 1, opacity 0 → 1, 300ms, 100ms delay after background
Hover States
All Interactive Elements:

Transition duration: 200ms
Easing: cubic-bezier(0.4, 0.0, 0.2, 1) [ease-out]
Specific Behaviors:

Buttons: scale 0.98, background color shift
Links/Text: color shift to orange, no underline
Cards: border color brightens to #FFFFFF at 40% opacity
Icons: rotate 90° (for settings/options icons), color shift to orange
Server icons: scale 1.05, subtle glow effect (box-shadow)
Transition Behavior
Route Changes:

Current view: fade out + scale down to 0.98, 250ms
New view: fade in + scale up from 0.98, 300ms, 100ms delay
Sidebar Toggle:

Slide animation: 400ms ease-in-out
Content reflow: 400ms synchronized with slide
Expandable Sections:

Height: auto-animate with max-height trick
Duration: 300ms ease-out
Icon rotation: 180° synchronized
Overlay Menu Behavior
Open Animation:

Background fills from top: 400ms ease-out
Menu items stagger in (100ms delay each): opacity 0 → 1, x: -30 → 0, 400ms ease-out
Close button fades in: 300ms, 200ms delay
Close Animation:

Menu items stagger out in reverse: opacity 1 → 0, x: 0 → -30, 300ms ease-in
Background fades: 300ms, begins after items start
Total duration: 600ms
Navigation Interaction:

Click item: orange color + translate-x 16px (200ms)
300ms delay before route transition initiates
Menu closes as new view loads
Microinteractions
Typing Indicator:

Three dots: 4px circles, international orange
Sequential scale animation: 0.8 → 1.2 → 0.8, 600ms loop, 150ms delay per dot
Unread Badge:

Pop in: scale 0 → 1 with bounce (spring physics)
Pulse every 3s: scale 1 → 1.1 → 1, opacity 1 → 0.8 → 1
Message Reactions:

Hover: scale 1.1, 150ms
Click: scale 0.9 → 1.2 with spring, add counter increment animation
Status Indicator:

State change: scale 0.8 → 1.2 → 1, color crossfade 300ms 5. Implementation Notes
Tailwind Configuration
Custom Theme Extension:

theme: {
extend: {
colors: {
'orange': '#FF4F00',
'orange-hover': '#E64500',
'orange-muted': '#FF4F0015',
'gray-900': '#0A0A0A',
'gray-800': '#1A1A1A',
},
fontFamily: {
'sans': ['Space Grotesk', 'system-ui', 'sans-serif'],
'mono': ['JetBrains Mono', 'monospace'],
},
spacing: {
// 8px base unit system already default in Tailwind
},
maxWidth: {
'container': '1440px',
},
},
}
CSS Custom Properties

:root {
--color-bg-primary: #000000;
--color-bg-secondary: #0A0A0A;
--color-bg-tertiary: #1A1A1A;
--color-text-primary: #FFFFFF;
--color-text-secondary: rgba(255, 255, 255, 0.6);
--color-accent: #FF4F00;
--color-accent-hover: #E64500;

--spacing-unit: 8px;

--transition-fast: 200ms cubic-bezier(0.4, 0.0, 0.2, 1);
--transition-base: 300ms cubic-bezier(0.4, 0.0, 0.2, 1);
--transition-slow: 400ms cubic-bezier(0.4, 0.0, 0.2, 1);
}

Conclusion
This design system delivers a bold, systematic visual language rooted in Dutch modernism while maintaining contemporary usability standards. Every element serves the dual purpose of aesthetic clarity and functional efficiency. The international orange accent provides the necessary energy and wayfinding without compromising the minimalist foundation.

Implementation should prioritize: grid alignment, smooth Motion-powered animations (https://motion.dev/), strict typography hierarchy, and real-time functionality via WebSocket connections. The result will be a chat application that feels simultaneously timeless and cutting-edge—confident, fast, and unmistakably modern.
