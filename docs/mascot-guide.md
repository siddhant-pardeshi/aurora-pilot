# Skye — the mascot guide

Skye is the copilot on the intercom: the deck's shared layered-SVG character — chibi kid in the pale-blue fox hoodie with the gold star charm — rebuilt from the studio's reference sheet as vector layers with a real animation state machine. Ears, eyes, mouth, arms, tail and head all move independently.

## Character invariants

- Pale-blue fox hoodie, cream lining and belly, gold four-point star charm, navy shorts, blue boots, cream-tipped tail.
- Wide-set angled fox ears, big brown eyes, soft blush.
- The reference sheet wins over any written description.

## States used in this game

| Trigger | Performance | Line |
| --- | --- | --- |
| First visit | Entrance + wave | "Skye, your copilot. Mail run starts at first light." |
| Return visit | Wave | "Winds are gentle today. She missed you." |
| Flight start | Alert | "Throttle up — follow the gold." |
| Ring streak (x3+) | Cheer | "Ring streak alive — bonus pay!" |
| Fuel low | Alert | "Fuel is getting thin — hunt a canister." |
| Rock strike | Sad | "Rock strike! Hull holding… barely." |
| Sky shift | Wave + comment | "Entering new skies — look at that light." |
| Pause | Sleep (z's) | — |
| Win / run end | Cheer / sad | "Mail delivered…" / "Engine is cold…" |

Lines rotate without back-to-back repeats; cooldowns gate rapid events. Bubbles dismiss on tap; the mouth flaps while a line is up.

## Where Skye lives

Bottom-right dock on desktop, bottom-left on touch, scaled down on small screens — never over the HUD chips or the joystick. Settings → **Show Skye** hides them; reduced motion keeps only slow blinks.

## Replacing the art

The character is one SVG string + one stylesheet in `js/mascot.js`. Keep the element ids (`m-armR`, `m-earL`, `m-eyeL`, `m-mouth`, `m-tail`, `m-charm`…), keep the layer order, swap colors in the palette object, and preview every state via `?mascot=gallery` on any game URL.
