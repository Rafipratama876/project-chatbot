# CHANNEL LETTERS — WOLF STUDIO KNOWLEDGE BASE v2.2
**Sign type:** `CL` · **Stage 1 — pre-sales mockup** · **Compiled:** 29 Aug 2026

**What changed from v2.1.**

1. **New Layer 3 — COMPOSITION.** A sign is not one thing. It is a set of **elements**, each
   of which gets its own **construction**. Small copy cannot be channel letters, so it becomes
   a pill box, flat cut letters or vinyl. That decision is now a deterministic decision tree
   with nine rules, running in its own gate before any geometry validation.
2. Non-lit return depth confirmed at **3″ standard**, 4″ or 5″ on request.
3. Layers renumbered to make room: Materials 3→4, Production 4→5, Constraints 5→6,
   Mounting 6→7, Defaults 7→8, Output 8→9. Rule IDs unchanged; each rule now carries a
   **gate** so execution order no longer depends on ID order.

Rule count 47 → **56.** Blocking rules: **1.** Open questions: **3.**

**Sources:** Sign Pack training v1 & v7, Step-by-Step v2, In-House Manufacturing Standards
(SK 11/14/24), Substrates (06/2025), Sign Reference Guide, Wolf Studio form schema, Sign Pack
direction 29 Aug 2026, plus external verification (Gemini GemTrim 2026, Vidon Jewelite, Grimco,
3M, Orafol, Avery Dennison, Steel Art, Sign Fab, Eastern Metal, NEC 600, UL 48).

Tags: `[SP]` Sign Pack internal · `[AVG]` collapsed from the vendor spread, Appendix A
· `[EXT]` external verified · `[DER]` derived, confirm if wrong

---

# LAYER 0 — AGENT SCOPE

**In scope.** Fabricated dimensional letters and logo shapes with a returned (three-
dimensional) can — illuminated or not — **together with every supporting element in the same
sign**: pill boxes, logo boxes, flat cut letters, applied vinyl, backers, raceways, wireways.

A tagline rendered as a pill box is still this agent's job. It is part of the sign.

**Out of scope — hand off.**

| Situation | Owner |
|---|---|
| Flat cut letters as the **whole sign** (no channel letters present) | Dimensional Letters agent |
| Cast metal, formed/injection-moulded plastic letters | Dimensional Letters agent |
| A full enclosed cabinet as the **whole sign** | Sign Cabinet agent |
| Letters on a monument | Monument agent owns structure; CL agent owns letters |
| Letters on a pylon | Pylon agent owns structure; CL agent owns letters |
| Vinyl-only wall lettering | Wall Graphics agent |
| Anything needing a stamped engineered drawing | Human — escalate |

**Hard stop.** Pre-sales concepts only. Never present output as production-ready, permit-ready
or engineered. Every export carries the Layer 9 disclaimer.

---

# LAYER 1 — TAXONOMY

## 1.1 Types

| ID | Canonical name | Aliases (input parsing only) | Definition | Status |
|---|---|---|---|---|
| `CL-T-01` | **Front Lit** | Face Lit, Front-Lit, Standard Channel Letter | Translucent face, opaque return, LEDs firing forward. | Standard |
| `CL-T-02` | **Back / Halo Lit** | Halo Lit, Reverse Lit, Back-Lit | Opaque metal face and return, clear polycarbonate back, LEDs firing rearward. Stands off on spacers. | Standard |
| `CL-T-03` | **Front and Back / Halo Lit** | Combination Lit, Dual Lit | Translucent face **and** rear illumination. | Standard |
| `CL-T-04` | **Non-Lit** | Unlit, Non-Illuminated, Hollow Letter | Fabricated can, no internal illumination. | Standard |
| `CL-T-05` | **Trimless Front Lit** | No-Trim Face Lit, Frameless | Retainer formed into the return profile. | Specialty |
| `CL-T-06` | **Trimless Back / Halo Lit** | No-Trim Halo | Halo lit with an integral retainer. | Specialty |
| `CL-T-07` | **Side Lit** | Edge Lit, Sidelit | LEDs light the return/edge only. | Specialty |
| `CL-T-08` | **Front and Side Lit** | Face & Edge Lit | Translucent face plus illuminated edge. | Specialty |
| `CL-T-09` | **Bevelled Edge** | Bevel Edge, Fab Bevel | Angled face perimeter, face- or halo-lit. | Specialty |
| `CL-T-10` | **Marquée** | Marquee, Bulb Letter | Exposed simulated-neon or bulb illumination. | Specialty |
| `CL-T-11` | **Faux Neon** | LED Neon, Neon Flex | Flexible LED neon tube tracing the letterform. | Specialty |
| `CL-T-12` | **Open Face** | Open Pan, Exposed Neon | Aluminium face inset, channel left open. | Rare |
| `CL-T-13` | **Custom / Specialty** | — | Faux vegetation, wood laminate, printed texture, mixed media. | Rare |

> `[SP]` ~90% of jobs are `CL-T-01`, `CL-T-02` or `CL-T-03`. **Bias defaults toward the three.**

## 1.2 Wolf Studio form → taxonomy mapping

| Form value | Maps to |
|---|---|
| Front Lit | `CL-T-01` |
| Back Lit | `CL-T-02` |
| Front and Back Lit | `CL-T-03` |
| Non-Lit | `CL-T-04` |
| Faux Neon | `CL-T-11` |
| Custom | `CL-T-05` … `CL-T-13` — **resolve from Additional Information. Cannot resolve → escalate.** |

The form type describes **the primary copy**. Supporting elements get their own construction
from Layer 3 — they do not inherit the form value blindly.

## 1.3 Sub-type modifiers

| ID | Modifier | Applies to |
|---|---|---|
| `CL-S-01` | Standard trim cap | `CL-T-01`, `CL-T-03` |
| `CL-S-02` | Retainer (extruded) | `CL-T-01`, `CL-T-03`; **mandatory** above the `CL-R-13` threshold |
| `CL-S-03` | Trimless | `CL-T-05`, `CL-T-06` |
| `CL-S-04` | Perforated return | specialty fabricated |
| `CL-S-05` | Push-through acrylic face | `CL-T-10`, `CL-T-12` |
| `CL-S-06` | Day/Night face | `CL-T-01`, `CL-T-03` |
| `CL-S-07` | RGB / colour-changing | any illuminated type |

---

# LAYER 2 — ANATOMY (part vocabulary)

**No callout, dimension or render instruction may name a part that isn't on this list.**

| ID | Part | What it is | Visible in mockup |
|---|---|---|---|
| `CL-P-01` | **Face** | Front surface. Translucent (lit) or opaque metal (halo/non-lit). | Yes |
| `CL-P-02` | **Return** | Side wall of the can. Depth = return depth. | Yes |
| `CL-P-03` | **Trim Cap** | CAB moulding over aluminium foil, glued to the face edge, screwed to the return. | Yes — thin outline |
| `CL-P-04` | **Retainer** | Extruded aluminium face frame; replaces trim cap on large and trimless work. | Yes |
| `CL-P-05` | **Back** | Rear closure. Aluminium (front lit) or clear polycarbonate (halo). | No |
| `CL-P-06` | **Flange** | Bent tab at the rear of the return the back fastens to. | No |
| `CL-P-07` | **Rivets** | Fasteners joining return seams and back. | No |
| `CL-P-08` | **Drain / weep holes** | 1/4″ holes at low points. | No |
| `CL-P-09` | **LED module** | Internal light engine. | No — glow only |
| `CL-P-10` | **Power supply** | LED driver, 120V to low-voltage DC. | No |
| `CL-P-11` | **Flexible conduit / whip** | Wiring run to the supply. | No |
| `CL-P-12` | **Waterproof enclosure box** | Remote housing for supplies. | No |
| `CL-P-13` | **Disconnect switch** | Externally operable, within sight of the sign. | No |
| `CL-P-14` | **Dedicated sign circuit** | 120V branch circuit. | No |
| `CL-P-15` | **Spacer / standoff** | Holds the letter off the surface so halo light escapes. | Yes — shadow gap |
| `CL-P-16` | **Angle clip** | Bracket securing a letter to a backer or raceway. | No |
| `CL-P-17` | **Mounting stud** | Threaded stud through the letter back into the surface. | No |
| `CL-P-18` | **Raceway** | Rectangular enclosure — mounting structure **and** electrical housing. | Yes |
| `CL-P-19` | **Wireway** | Slimmer enclosure — wiring chase, mounting surface, backing board. | Yes |
| `CL-P-20` | **Backer panel** | Panel behind the whole set. Orthogonal to mount method. | Yes |
| `CL-P-21` | **Pill box** | Small illuminated cabinet carrying secondary copy. Rectangular, rounded or capsule-shaped. Also called a light box or capsule. | Yes |
| `CL-P-22` | **Photocell** | Ambient-light switch. | No |
| `CL-P-23` | **Timer** | Scheduled switch. | No |
| `CL-P-24` | **Vinyl application** | Translucent, cut, day/night or printed vinyl on a letter face. | Yes — as face colour |
| `CL-P-25` | **Polycarbonate (Lexan) back** | Clear rear panel the LEDs mount to on halo types. | No |
| `CL-P-26` | **Floating-element frame** | 2″×2″ frame with square or circular base for detached elements. | No |
| `CL-P-27` | **Bottom rail** | Horizontal rail the letters stand on and bolt down into. | Yes |
| `CL-P-28` | **Support rod** | Slim vertical rod carrying an element above the letter line. | Yes |
| `CL-P-29` | **Push-through acrylic** | Acrylic protruding through a routed face. | Yes |
| `CL-P-30` | **Gooseneck / spotlight** | External illumination for non-lit letters. | Yes, if specified |
| `CL-P-31` | **Mounting surface** | Wall, parapet, canopy fascia or rail the sign mounts to. | Yes |
| `CL-P-32` | **Logo box** | Illuminated cabinet cut to a logo silhouette rather than a rectangle. | Yes |
| `CL-P-33` | **Flat cut letter** | Letter with no return — flat acrylic or metal, stud or tape mounted. | Yes |
| `CL-P-34` | **Copy vinyl** | The lettering applied to, or reversed out of, a box face. | Yes |

---

# LAYER 3 — COMPOSITION
## How one sign becomes several elements, and how each gets built

A storefront sign is almost never a single construction. It is a **primary name**, often a
**logo mark**, usually a **tagline**, sometimes an **article** — and each of those is built
differently, because **small copy cannot be made as channel letters**.

Below the minimums a fabricated can is impossible, or so expensive and fragile that no shop
would build it. The industry substitutes a **pill box**, **flat cut letters**, or **vinyl**.
The agent must make that swap itself, from measurements it already has.

### Worked example — the elements of a real sign

```
"HEAVEN CREPES AND WAFFLES"

  ELEMENT 1   wing mark          LOGO MARK   →  Logo box, magenta face
  ELEMENT 2   "HEAVEN"           PRIMARY     →  Individual channel letters, front lit
  ELEMENT 3   "CREPES AND        TAGLINE     →  Pill box, copy reversed out of an
              WAFFLES"                          opaque field — copy glows, field dark
```

Three constructions, one sign, one proof.

## 3.1 Element roles

| ID | Role | How to recognise it |
|---|---|---|
| `CL-E-01` | **Primary copy** | The brand name. The tallest typographic element. |
| `CL-E-02` | **Secondary copy** | A second word or line at 70–100% of primary height, own baseline. |
| `CL-E-03` | **Tagline / descriptor** | Supporting copy, typically **25–40%** of primary height. "Crepes and Waffles", "Noodles ∗ Salad ∗ Grill", "Where Guys Go For Great Cuts". |
| `CL-E-04` | **Logo mark / icon** | Non-typographic shape — symbol, monogram, pictorial mark. |
| `CL-E-05` | **Article / connector** | THE, &, AT, OF, A — short words, often set at a different scale as a design device. |
| `CL-E-06` | **Legal / contact line** | Phone, web address, hours, suite number. Smallest copy on the sign. |

## 3.2 Grouping — what counts as one element

Work from the per-item dimensions the tool produces. Merge items into elements:

- **Same cap height (±15%) + same baseline + same colour + contiguous** → one element
- A distinct baseline → a new element
- A distinct colour → a new element **only if** it also changes scale or baseline; a two-colour
  word ("MemorialCare", "SUMMER R☀LL") stays one element with a colour break noted
- Any non-typographic shape → its own element
- A short word at a markedly different scale → its own element (`CL-E-05`)

## 3.3 Constructions

| ID | Construction | What it is | Lights? |
|---|---|---|---|
| `CL-C-01` | **Individual channel letters** | Fabricated cans, one per character. Inherits the sign's type. | per type |
| `CL-C-02` | **Pill box** | Small illuminated cabinet; copy applied to or reversed out of the face. | Yes |
| `CL-C-03` | **Logo box** | Same, cut to the logo silhouette instead of a rectangle. | Yes |
| `CL-C-04` | **Flat cut acrylic letters** | Individual flat letters, no return, stud or tape mounted. | No |
| `CL-C-05` | **Flat cut metal letters** | Same in aluminium or stainless. Premium. | No |
| `CL-C-06` | **Applied vinyl** | Cut or printed graphics on the backer, fascia or glass. | No |
| `CL-C-07` | **Push-through acrylic** | Acrylic pushed through a routed opaque face on a box. | Yes |

## 3.4 Copy treatment inside a box — this decides the day and night read

| ID | Treatment | Day | Night |
|---|---|---|---|
| `CL-CT-01` | **Opaque vinyl copy on a white face** | Coloured copy on white | Field glows white, **copy stays dark** |
| `CL-CT-02` | **Reversed out** — opaque vinyl field, copy knocked out | Dark field, copy in the face colour | Field stays dark, **copy glows** |
| `CL-CT-03` | **Translucent vinyl copy on a white face** | Coloured copy on white | Field glows white, **copy glows in colour** |
| `CL-CT-04` | **Push-through acrylic** | Dimensional copy proud of the face | Field dark, **copy glows and reads dimensional** |
| `CL-CT-05` | **Routed and backed** | Flush copy, crisp edge | Field dark, **copy glows flush** |

`CL-CT-02` reversed-out is the **default** — it matches the way lit channel letters read at
night (bright copy, dark surround) so the whole sign reads as one family. `CL-CT-01` is the
cheaper, higher-daytime-contrast alternative; propose it when the tagline must be legible in
daylight above all.

## 3.5 The decision tree — deterministic, runs per element

```
FOR each element E:
    H  = cap height          S  = narrowest stroke
    P  = primary element cap height
    LIT = the sign is illuminated (form type is not Non-Lit)

 ── 1. NON-TYPOGRAPHIC (CL-E-04 logo mark) ─────────────────────────────
    Does the mark have fine detail, enclosed counters, or colour breaks
    that cannot be separate cans?
        YES  →  CL-C-03  logo box
        NO   →  CL-C-01  individual channel shape, same type as the sign

 ── 2. TYPOGRAPHIC ─────────────────────────────────────────────────────
    IF  H ≥ min_height  AND  S ≥ min_stroke        (Layer 6 §6.1)
        →  CL-C-01  individual channel letters

    ELSE IF  H < 2"
        →  CL-C-06  applied vinyl        (too small for any dimensional build)

    ELSE IF  LIT
        →  CL-C-02  pill box             DEFAULT for taglines
             copy treatment  →  CL-CT-02 reversed out

    ELSE
        →  CL-C-04  flat cut acrylic letters
             (CL-C-05 metal if the sign's returns are metal-finished)
```

**Do not thicken a tagline.** The Offset Path autofixes in §6.1 apply to `CL-E-01` and
`CL-E-02` only. Running them on a tagline destroys the typography — the correct answer is to
change the construction, not the letterform.

## 3.6 Pill box and logo box sizing `[DER]`

| Property | Value |
|---|---|
| **Minimum box height** | **4″** — needs room for LED modules (0.5″–0.8″ tall) plus mixing distance |
| **Copy margin** | ≥ **1″** above and below the copy cap height |
| **Box height from copy** | `copy cap height + 2″`, or 4″, whichever is greater |
| **Minimum copy cap height** | **2″** — below this, use `CL-C-06` vinyl |
| **Box depth** | **Match the letter return depth** so the faces sit in one plane |
| **Box shape** | Rectangle, rounded rectangle (capsule), or contour-cut to the copy |
| **Face** | White or coloured acrylic, same material rules as a letter face |
| **Return colour** | Matches the letter returns by default |
| **Corner radius** | Capsule = half the box height; rounded rectangle = 1″–2″ |

## 3.7 Composition patterns worth proposing

Not rules — design moves a human designer would make. The agent may offer them, flagged as a
suggestion, never applied silently.

| Pattern | When |
|---|---|
| **Article in a box** | A short word (THE, &) set vertically or in a small box beside the primary. Turns an awkward orphan into a deliberate device. |
| **Tagline capsule under the primary** | The most common storefront arrangement. Capsule width matches or slightly under-runs the primary. |
| **Logo box + letters on a shared backer** | Ties mixed constructions into one visual object; also simplifies installation to one piece. |
| **Icon replacing a character** | A mark standing in for a letter (the sun in "SUMMER R☀LL"). Needs its own construction assessment. |

## 3.8 What composition changes downstream

- **Validation** — §6.1 stroke and height rules run only on elements assigned `CL-C-01`.
- **Render** — each construction has its own day and night behaviour (§9.2).
- **Spec block** — one block **per element**, not one per sign (§9.3).
- **Mounting** — boxes and flat cut letters mount by the same methods as letters, and a mixed
  sign usually shares one backer, raceway or rail.

---

# LAYER 4 — MATERIALS & FINISHES (by part)

## 4.1 `CL-P-01` Face

| Material | Thicknesses | Stock sizes | When |
|---|---|---|---|
| **Acrylic** (standard) | 1/16″, 1/8″, 1/4″, 1/2″, 3/4″, 1″ | 4′×8′, 4′×10′, 5′×10′ | **Default lit face.** Breaks and cracks easily. |
| **Impact-modified acrylic** | sheet + reel | 51″×100″, 51″×125″, 75″×100″, 75″×125″; reels 64″, 76″, 100″ | Over 5′×10′, or letters over 48″H. Best with **a lot of white space**. |
| **Polycarbonate (Lexan)** | 3/16″ typical | **Rolls 55″, 78″, 104″**, by the linear foot | Oversized faces; less breakable; **yellows in sunlight**. Best when **fully printed**. |
| **Aluminium** (halo / non-lit face) | .040 – .125 | 4′×10′, 5′×10′, 4′×12′, 6′×12′ | Opaque faces, welded to returns on halo types. |
| **Stainless / Corten / Brass / Copper** | — | — | Premium fabricated metal faces. Flag cost. |
| **Day/Night acrylic (Acrylite)** | 0.177″, 0.118″ | 49″×97″ | Black by day, white illuminated by night. On request. |

## 4.2 `CL-P-02` Return — depth is type-dependent

| Type | Standard depth | On request |
|---|---|---|
| **Front Lit** `CL-T-01` | **5″** | 4″ or 6″ |
| **Back / Halo Lit** `CL-T-02` | **3″** | 4″ or 6″ |
| **Front and Back Lit** `CL-T-03` | **5″** | 4″ or 6″ |
| **Non-Lit** `CL-T-04` | **3″** | **4″ or 5″** `[SP]` |

**Stocked coil depths: 3″ and 5″.** On-request depths are buildable and the agent draws them —
flagged as available but not standard, with a price and lead-time note. Outside those ranges
means welded construction.

Material: pre-finished aluminium coil (preformed) or sheet (welded). Default colour **Black**.

## 4.3 `CL-P-03` Trim Cap

| Property | Value |
|---|---|
| Widths | **3/4″, 1″, 2″** — 1″ default and the widest colour range |
| Projection above face | **1/8″** — a face-edge detail. **Not added to the quoted depth.** |
| Face recess behind trim | **1/8″** |
| Material | CAB extruded around prime aluminium foil. UL-recognised component. |
| Bonds to | Acrylic and polycarbonate. Seal with a full bead of Scigrip #16 or #40. |
| Roll lengths | 150′ (3/4″), 150′ (1″), 100′ (2″) |
| Brands | **Gemini GemTrim Flex** and **Vidon Jewelite** — both acceptable |
| Default colour | **Black** |

### GemTrim Flex — 31 standard colours `[EXT]`
28 colours in 3/4″, 31 in 1″, 10 in 2″.

| Colour | # | Widths | | Colour | # | Widths |
|---|---|---|---|---|---|---|
| White | 5687 | 3/4″, 1″, 2″ | | Lt. Green | 2108 | 3/4″, 1″, 2″ |
| Pearl Grey | 4272 | 3/4″, 1″ | | Hunter Green | 2162 | 3/4″, 1″ |
| Ivory | 2718 | 3/4″, 1″ | | Orange | 2119 | 3/4″, 1″ |
| Yellow | 2000 | 3/4″, 1″ | | Mango | 2540 | 3/4″, 1″ |
| Mustard | 7548 | **1″ only** | | Red | 2793 | 3/4″, 1″, 2″ |
| Dove Grey | 4310 | 3/4″, 1″ | | Maroon | 2240 | 3/4″, 1″ |
| Black | 2025 | 3/4″, 1″, 2″ | | Burgundy | 4840 | 3/4″, 1″ |
| Midnight Blue | 2767 | 3/4″, 1″ | | Brown | 2418 | 3/4″, 1″ |
| Dark Blue | 2050 | 3/4″, 1″, 2″ | | Bronze | 0313 | 3/4″, 1″, 2″ |
| Intense Blue | 2945 | 3/4″, 1″, 2″ | | Med. Bronze | 3120 | 3/4″, 1″, 2″ |
| Purple | 2287 | 3/4″, 1″ | | Dur. Bronze | 3130 | 3/4″, 1″ |
| Teal | 3210 | 3/4″, 1″ | | Metallic Silver | 8886 | 3/4″, 1″, 2″ |
| Spring Green | 3555 | 3/4″, 1″ | | Brushed Silver | 8884 | 3/4″, 1″ |
| Holiday Green | 1225 | **1″ only** | | Polished Silver | 8885 | 3/4″, 1″ |
| Irish Green | 2426 | **1″ only** | | Brushed Gold | 2764 | 3/4″, 1″ |
| | | | | Polished Gold | 2766 | 3/4″, 1″, 2″ |

### Jewelite by Vidon — 20 standard colours `[EXT]` · 3/4″, 1″, 2″

Brushed Gold · Burgundy · Green · Ivory · **Paintable** · True Red · Hunter Green · White ·
Brushed Chrome · Orange · Teal · Metallic Silver · Bronze · Yellow · Intense Blue ·
Bronze 313 · Brown · Holiday Green · Blue · Black

**Jewelite Paintable is the route to any off-catalogue colour** — costs more and takes longer;
flag it on the proof.

## 4.4 `CL-P-05` / `CL-P-25` Back

Front lit → **aluminium**. Halo and front+halo → **clear polycarbonate**, which the LEDs mount
to. Translucent vinyl on the polycarbonate tints the halo colour.

## 4.5 `CL-P-20` Backer panel — orthogonal to mount method

| Property | Value |
|---|---|
| Materials | ACM (DiBond / Max-Metal, 1/8″ and 1/4″) · Acrylic (**1/4″ standard**) · PVC · Aluminium |
| Shapes | Straight Flat · Straight Aluminium Pan · Contour Flat / Cloud Flat · Letter Cloud / Letter Bubble · Contour Pan · Custom |
| **Minimum depth** | **4″** when it houses power supplies |
| Default | **No backer**; matches the mounting surface colour when used |

## 4.6 `CL-P-18` Raceway / `CL-P-19` Wireway

| | Raceway | Wireway |
|---|---|---|
| Function | Mounting structure **+** electrical enclosure | Wiring chase **+** mounting surface **+** backing board |
| **Standard size** | **4.75″H × 5″D** | **12″H × 2″D** |
| Also available | 4.5″×4.5″, 6″×6.5″, 8″×5″ | 3″×1.5″, 4″×1″, custom |
| Choose wireway when | Protrusion limit a raceway would exceed | |
| **Colour** | **Match the mounting surface** | same |

## 4.7 Colour systems — what the spec block may say

| Application | Accepted systems `[SP]` |
|---|---|
| **Paint** — returns, backs, backers, raceways, boxes, metal faces | **PMS · Sherwin-Williams · Matthews Paint** |
| **Translucent vinyl** — lit faces and box copy | **3M** Scotchcal 3630 · 3M Envision 3730 (LED-optimised, more light) · **Orafol** Oracal 8500 · **Avery Dennison** 4500 |
| **Trim cap** | GemTrim or Jewelite catalogue name, or Jewelite Paintable + paint colour |

CMYK, RGB and HEX may drive the on-screen render. They **never appear in the spec block** —
convert to the nearest colour in an accepted system, marked *indicative, to be confirmed
against a physical sample*.

## 4.8 `CL-P-09` Illumination

| Property | Value |
|---|---|
| Kelvin range | 1800K – 6500K. **Bright white most commonly requested — the default.** |
| Colours | White (warm→cool), red, blue, green, orange, yellow, RGB, RGBW |
| Even illumination | Comfortable at 4″+ depth for a **front-lit** face. Halo types are unaffected. |
| Coloured faces | Need more light than white faces for the same apparent brightness. |
| Red faces | **Red acrylic + red LED.** White LED behind red acrylic reads dull and pink. `[SP]` |

---

# LAYER 5 — PRODUCTION METHODS

| ID | Method | How | What it means for the concept |
|---|---|---|---|
| `CL-PM-01` | **Preformed** | Coil bent on a channel-letter bender, notched and clinched, riveted | Standard, lowest cost, most common. Uses stocked 3″ and 5″ coil. |
| `CL-PM-02` | **Welded / fabricated** | Sheet cut, formed, welded, seams ground | Seamless, any depth, any metal. Higher cost. Required for non-standard depths. |
| `CL-PM-03` | **Extruded / trimless** | Aluminium extrusion with an integral retainer groove | Crisp frameless edge, lip ~1/8″. Premium. |
| `CL-PM-04` | **Cast metal** | Poured into a mould | Solid, robust. Halo lit only, typically 6″–24″ high. |
| `CL-PM-05` | **Pan formed** | Face and return vacuum-formed as one piece | **4″ minimum stroke** — rules most logos out. Rare. |
| `CL-PM-06` | **Fabricated box** | Aluminium cabinet, welded or riveted, with an acrylic face | Pill boxes and logo boxes. Same shop, same finishes as the letters. |

**Fabrication sequence** `[SP]`: design and planning → material cutting (CNC router) → paper
pattern printing → bending and assembly → painting and finishing → LED installation → back
panel or raceway preparation → quality control → packaging and shipping.

---

# LAYER 6 — CONSTRAINTS

**56 rules. One of them blocks.** Where a requested configuration cannot work, the agent
**substitutes the correct one and says so prominently** rather than refusing.

Tiers: **VISUAL** changes the render · **SPEC** changes the proof text · **STANDING** prints as
boilerplate (§6.9). Rules marked ⚠ **CRITICAL SUBSTITUTION** change what the customer asked
for and get their own callout on the proof.

Each rule carries a **gate**. Rule numbers reflect when a rule was added; **the gate decides
when it runs.**

## 6.0 Composition — runs in Gate 2, before everything else

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-48` | SPEC | Artwork contains more than one element | AUTOFIX | Group per-item dimensions into elements (§3.2) and assign a role (§3.1) to each. |
| `CL-R-49` | SPEC | Element role unassigned | AUTOFIX | Tallest typographic element = `CL-E-01` primary. Elements at 25–40% of primary on their own baseline = `CL-E-03` tagline. Non-typographic = `CL-E-04`. |
| `CL-R-50` | VISUAL | Typographic element meets the height and stroke minimums | AUTOFIX | Assign `CL-C-01` individual channel letters, inheriting the sign's type. |
| `CL-R-51` | VISUAL | ⚠ Typographic element **below** the height or stroke minimum, sign **is illuminated**, cap height ≥ 2″ | AUTOFIX | **Assign `CL-C-02` pill box** with `CL-CT-02` reversed-out copy. Do not thicken the letterform. Callout on the proof. |
| `CL-R-52` | VISUAL | ⚠ Typographic element below minimum, sign **not illuminated**, cap height ≥ 2″ | AUTOFIX | **Assign `CL-C-04` flat cut acrylic letters** — or `CL-C-05` metal if the returns are metal-finished. Callout. |
| `CL-R-53` | VISUAL | Element cap height < **2″** | AUTOFIX | Assign `CL-C-06` applied vinyl. Too small for any dimensional build. |
| `CL-R-54` | VISUAL | `CL-E-04` logo mark with fine detail, enclosed counters or colour breaks that cannot be separate cans | AUTOFIX | Assign `CL-C-03` logo box, cut to the mark's silhouette. |
| `CL-R-55` | SPEC | Pill or logo box height < copy cap height + 2″, or < 4″ | AUTOFIX | Resize: `max(copy cap height + 2″, 4″)`. `[DER]` |
| `CL-R-56` | VISUAL | Box depth differs from the letter return depth | AUTOFIX | Match the letter return depth so the faces sit in one plane. |

## 6.1 Stroke and height — Gate 4, **`CL-C-01` elements only**

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-01` | VISUAL | Illuminated, stroke < **1.5″** | AUTOFIX | Offset Path to 1.5″. Revalidate. `[AVG]` |
| `CL-R-02` | VISUAL | Front **and** back lit, stroke < **2″** | AUTOFIX | Offset Path to 2″ — two LED systems need the room. `[AVG]` |
| `CL-R-03` | VISUAL | Non-illuminated, stroke < **1″** | AUTOFIX | Offset Path to 1″. `[AVG]` |
| `CL-R-04` | VISUAL | Any small element below the governing minimum — tittles and i-dots, commas, apostrophes, periods, serifs, thin terminals, thin crossbars | AUTOFIX | Thicken to minimum. If the mark distorts, flag and escalate. **Most common failure in the source material.** `[SP]` |
| `CL-R-05` | VISUAL | Offset Path applied to **A B D G R P Q** | NOTE | Counters close up. Inspect before rendering. `[SP]` |
| `CL-R-06` | VISUAL | Script or cursive letterform | WARN | Offset Path often renders script illegible. Propose a simplified alternative. `[SP]` |
| `CL-R-07` | SPEC | Illuminated, cap height < **8″** (**10″** serif or script) | WARN | Only reached if composition assigned `CL-C-01`. Flag that specialty fabrication is needed. `[AVG]` |
| `CL-R-08` | SPEC | Non-illuminated, cap height < **3″** | WARN | Flag. `[AVG]` |

## 6.2 Face material and size — Gate 4

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-09` | SPEC | Letter height > **48″** with standard acrylic | AUTOFIX | Face → impact-modified acrylic or polycarbonate. |
| `CL-R-10` | SPEC | Any face dimension > **5′ × 10′** | AUTOFIX | Face → impact-modified acrylic or polycarbonate. `[SP]` |
| `CL-R-11` | SPEC | Face carries large open or white areas | NOTE | Prefer impact-modified acrylic. `[SP]` |
| `CL-R-12` | SPEC | Face is fully digitally printed | NOTE | Prefer polycarbonate. `[SP]` |
| `CL-R-13` | VISUAL | Height > **4′** OR width > **10′** (circles ≥ 6′) | AUTOFIX | Specify a **retainer** instead of trim cap — render the retainer edge. `[SP]` |
| `CL-R-14` | SPEC | Polycarbonate face wider than **104″** | WARN | Beyond the widest roll — seam required. `[EXT]` |
| `CL-R-15` | SPEC | Printed graphic wider than **52″** | WARN | Outsourced print — note lead time. `[SP]` |
| `CL-R-16` | SPEC | Lighted face or gradient needing a print seam | WARN | Outsourced print; seam location confirmed at production. `[SP]` |
| `CL-R-17` | SPEC | Formed face larger than **8′ × 14′** | WARN | Seam required. `[AVG]` |
| `CL-R-18` | SPEC | Smallest dimension > **14′** | NOTE | Oversized shipping — flag cost and lead time. |

## 6.3 Depth — Gate 4

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-19` | SPEC | Return depth unspecified | AUTOFIX | Type default: front lit **5″**, halo **3″**, front+back **5″**, non-lit **3″**. `[SP]` |
| `CL-R-20` | SPEC | Depth is an on-request value (4″/6″ lit, 4″/5″ non-lit) | NOTE | Buildable, available on request, not stocked. Note price and lead-time difference. `[SP]` |
| `CL-R-21` | SPEC | Depth outside the standard and on-request set | WARN | Welded construction. Flag cost, or propose the nearest stocked depth (3″ or 5″). |
| `CL-R-22` | VISUAL | **Front lit** with return depth ≤ **3″** | WARN | Shallow front-lit cans hot-spot. Recommend 5″. Halo at 3″ is standard — no flag. |
| `CL-R-23` | SPEC | Backer houses power supplies and is < **4″** deep | AUTOFIX | Set backer depth to 4″. `[SP]` |

## 6.4 Mounting — Gate 4

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-24` | VISUAL | ⚠ Rear-illuminated type mounted **flush** | AUTOFIX | **Substitute spacers** and render it. Light cannot escape a flush-mounted halo letter. `[SP]` |
| `CL-R-25` | VISUAL | ⚠ Rear-illuminated type on a **raceway with no backer** | AUTOFIX | **Substitute raceway + backer** — the backer gives the halo a surface to wash across. `[SP]` |
| `CL-R-26` | VISUAL | ⚠ Rear-illuminated type **bottom mounted** with no surface behind | AUTOFIX | **Add a backer** (default) or **switch to front lit**. Offer both. `[DER]` |
| `CL-R-27` | SPEC | Any letter or logo > **36″H** on a raceway | AUTOFIX | Second raceway or a larger fabricated one. `[SP]` |
| `CL-R-28` | VISUAL | Raceway, wireway or bottom rail colour differs from the mounting surface | AUTOFIX | Sample the surface colour; call out "match building colour". `[SP]` |
| `CL-R-29` | VISUAL | Detached element with fewer than 2 attachment points | AUTOFIX | 2″×2″ frame with a square or circular base, or support rods above the letter line. `[SP]` |
| `CL-R-30` | SPEC | Bottom mounted, letter > **36″H** or set > **10′** long | WARN | Rail sizing and anchorage need engineering review. Do not assert it will hold. |
| `CL-R-31` | SPEC | Protrusion-limited façade with a raceway specified | WARN | Propose a wireway — it is thinner. `[SP]` |
| `CL-R-32` | SPEC | Sign area may exceed the permitted signage area | WARN | Flag for permit review. **Never assert compliance.** `[SP]` |

## 6.5 Illumination and control — Gate 4

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-33` | SPEC | Flush, spacer or bottom mounted, illuminated, control unspecified | AUTOFIX | Specify a **timer**. `[SP]` |
| `CL-R-34` | SPEC | Backer or raceway mounted, illuminated, control unspecified | AUTOFIX | Specify a **photocell**. `[SP]` |
| `CL-R-35` | VISUAL | Red translucent face | AUTOFIX | **Red acrylic + red LED.** `[SP]` |
| `CL-R-36` | SPEC | Illuminated, LED colour unspecified | AUTOFIX | White, bright white. `[SP]` |
| `CL-R-37` | VISUAL | Rear-illuminated type rendered without a standoff gap | AUTOFIX | Render a 1.5″–2″ gap. |

## 6.6 Colour — Gate 4

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-38` | SPEC | Paint colour given as CMYK, RGB or HEX | AUTOFIX | Convert to closest **PMS / Sherwin-Williams / Matthews**; mark indicative. `[SP]` |
| `CL-R-39` | SPEC | Translucent face or box copy colour given as CMYK, RGB or HEX | AUTOFIX | Convert to closest **3M 3630 / Envision 3730 / Oracal 8500 / Avery 4500**; mark indicative. `[SP]` |
| `CL-R-40` | SPEC | Trim cap colour not in the GemTrim or Jewelite catalogue | AUTOFIX | Specify **Jewelite Paintable, painted to <colour>**. Flag cost and lead time. `[SP]` |
| `CL-R-41` | SPEC | Trim cap colour is catalogue but not offered in that width | AUTOFIX | Switch to 1″ (carries all 31 GemTrim colours) or pick the nearest colour in that width. `[EXT]` |
| `CL-R-42` | SPEC | Halo type with different face and return colours | NOTE | House standard is the **same colour on both**. `[SP]` |

## 6.7 Artwork — Gate 4

| ID | Tier | Condition | Sev | Action |
|---|---|---|---|---|
| `CL-R-43` | VISUAL | Distressed, organic, hand-drawn or heavily textured letterform | AUTOFIX | Simplify the font, **or** build a "bubble" per letter with Offset Path and specify the original as face vinyl. Flag it. `[SP]` |
| `CL-R-44` | VISUAL | Face texture or photographic effect | AUTOFIX | Convert to a vinyl application; keep the can shape simple. `[SP]` |
| `CL-R-45` | VISUAL | Unnecessary tiny counters or holes at extreme sizes | AUTOFIX | Remove them. `[SP]` |
| `CL-R-46` | VISUAL | Letterform still unbuildable after every autofix **and** every construction alternative | **BLOCK** | Escalate with the failing rule ID. **The only blocking rule.** |
| `CL-R-47` | SPEC | Any autofix changed the customer's artwork or configuration | NOTE | **Must appear on the proof in plain language.** Critical substitutions get their own callout. |

## 6.9 STANDING NOTES — printed on every proof, never evaluated

```
· 1/4" drain holes at the low point of each letter and box
· UL 48 listed components; UL label on the raceway or enclosure housing the power supply
· Dedicated 120V sign circuit, 20A minimum
· Externally operable, lockable disconnect within sight of the sign
· LED power supplies sized with a 25% safety margin
· All exterior fasteners and mounting hardware corrosion-resistant
```

---

# LAYER 7 — MOUNTING

## 7.1 Mount methods — matched to the Wolf Studio form

| ID | Form value | Description |
|---|---|---|
| `CL-MT-01` | **Flush mounted** | Studs through the back into the surface, element tight against it. |
| `CL-MT-02` | **Direct mounted with spacers** | Same, spaced off the surface. **Mandatory for every rear-illuminated type.** |
| `CL-MT-03` | **Raceway** | Elements on a raceway carrying wiring and drivers. Fewest penetrations. |
| `CL-MT-04` | **Wireway** | Slimmer chase; also a mounting surface and backing board. |
| `CL-MT-05` | **Bottom mounted** | Elements stand on a horizontal rail and bolt down into it — parapet caps, canopy fascias, ledges. |
| `CL-MT-06` | **Other** | Resolve from Additional Information: tape or adhesive, square tube frame, free-standing base, suspended. **Cannot resolve → escalate.** |

**Backer is not a mount method** — the form asks for it separately. Any method can carry one.
A mixed-construction sign usually shares **one** backer, raceway or rail across all elements.

## 7.2 Type × Mount compatibility

`✔` allowed · `▲` conditional · `⚠` substitute per the rule

| | `01` Flush | `02` Spacers | `03` Raceway | `04` Wireway | `05` Bottom | `06` Other |
|---|---|---|---|---|---|---|
| **`CL-T-01` Front Lit** | ✔ | ✔ | ✔ | ✔ | ✔ | ▲ |
| **`CL-T-02` Back / Halo Lit** | ⚠ `R-24` | ✔ | ⚠ `R-25` | ✔ | ▲ `R-26` | ▲ |
| **`CL-T-03` Front + Halo Lit** | ⚠ `R-24` | ✔ | ⚠ `R-25` | ✔ | ▲ `R-26` | ▲ |
| **`CL-T-04` Non-Lit** | ✔ | ✔ | ✔ | ✔ | ✔ | ▲ |
| **`CL-T-05` Trimless Front Lit** | ✔ | ✔ | ✔ | ✔ | ✔ | ▲ |
| **`CL-T-06` Trimless Halo Lit** | ⚠ `R-24` | ✔ | ⚠ `R-25` | ✔ | ▲ `R-26` | ▲ |
| **`CL-T-07` Side Lit** | ✔ | ✔ | ✔ | ✔ | ✔ | ▲ |
| **`CL-T-11` Faux Neon** | ✔ | ✔ | ▲ | ✔ | ✔ | ▲ |

Pill boxes, logo boxes and flat cut letters follow the same matrix as `CL-T-01` — they have no
rear illumination, so no substitution applies.

## 7.3 Installation sequence `[SP]`

Site preparation → measurement and marking with templates → structure attachment (raceway,
wireway, backer or bottom rail) → wiring routed and secured → element installation →
electrical connection and verification → final testing → finishing and cleaning → handover.

---

# LAYER 8 — DEFAULTS & PRECEDENCE

## 8.1 Defaults — apply to every empty field, and log that you did

| ID | Field | Default |
|---|---|---|
| `CL-D-01` | **Return depth** | Front lit **5″** · Halo **3″** · Front+back **5″** · Non-lit **3″** |
| `CL-D-02` | Return colour | **Black** |
| `CL-D-03` | Trim cap colour | **Black** |
| `CL-D-04` | Trim cap width | **1″** |
| `CL-D-05` | Face colour | **Per logo** |
| `CL-D-06` | Face colour treatment | **Per logo** |
| `CL-D-07` | Face material | **Acrylic**, unless `CL-R-09` / `CL-R-10` triggers |
| `CL-D-08` | Back material | Aluminium (front lit) · clear polycarbonate (halo, front+halo) |
| `CL-D-09` | Backer | **None** |
| `CL-D-10` | Backer colour | **Match mounting surface** |
| `CL-D-11` | Raceway / wireway / rail colour | **Match mounting surface** |
| `CL-D-12` | Raceway size | **4.75″H × 5″D** |
| `CL-D-13` | Wireway size | **12″H × 2″D** |
| `CL-D-14` | Trim cap projection / face recess | **1/8″** — **not added to quoted depth** |
| `CL-D-15` | LED | White, bright white |
| `CL-D-16` | Minimum stroke | **1.5″** illuminated · **2″** front+halo · **1″** non-lit |
| `CL-D-17` | Minimum height | **8″** illuminated · **10″** serif/script · **3″** non-lit |
| `CL-D-18` | Standoff gap (halo types) | **1.5″–2″** |
| `CL-D-19` | Paint system | **PMS**, else Sherwin-Williams or Matthews |
| `CL-D-20` | Translucent film | **3M 3630**, else Envision 3730 / Oracal 8500 / Avery 4500 |
| `CL-D-21` | Show sizes on proof | **Yes** |
| `CL-D-22` | Materials thickness on proof | **Do not show** |
| `CL-D-23` | Quantity | **1** |
| `CL-D-24` | External illumination for `CL-T-04` | **None** unless requested |
| `CL-D-25` | **Tagline construction** | **Pill box** `CL-C-02` when the sign is lit; **flat cut acrylic** `CL-C-04` when it is not |
| `CL-D-26` | **Box copy treatment** | **Reversed out** `CL-CT-02` — copy glows, field dark |
| `CL-D-27` | **Box depth** | **Matches the letter return depth** |
| `CL-D-28` | **Box shape** | Rounded rectangle (capsule) for a single line of copy |
| `CL-D-29` | **Box face colour** | The primary letter face colour, unless the logo specifies otherwise |

## 8.2 Precedence — highest wins

```
1. BUILDABILITY & SAFETY     Anything that would not light, would not hold, or is unsafe.
2. LANDLORD / PERMIT         Protrusion limits, permitted area, mandated mount method.
3. CUSTOMER EXPLICIT         Written instruction in the form's Additional Information field.
4. SIGN PACK HOUSE STANDARD  §6 rules and §8.1 defaults.
5. AGENT DEFAULT             Anything §8.1 does not name.
```

**Worked case — the customer asks for the tagline as channel letters at 4″ tall.** Level 3
beats level 4, but level 1 still governs: 4″ letters cannot carry a 1.5″ stroke and stay
legible. The agent renders the tagline as a **pill box**, and the callout explains that at 4″
the copy is below the minimum for individual letters, so it has been shown as a capsule with
the copy reversed out — same night read, buildable, and a fraction of the cost.

---

# LAYER 9 — OUTPUT CONTRACT

## 9.1 Required views

| Sign | Views |
|---|---|
| Any element illuminated | **Day** + **Night** |
| Nothing illuminated | **Day**; night only if external illumination was specified |

## 9.2 What must be visually true — **per construction**

| Construction | Day | Night |
|---|---|---|
| **Channel letters — front lit** | Face reads its daytime colour; trim cap a thin outline. | **Face glows.** Returns and trim dark. Nothing behind glows. |
| **Channel letters — halo** | Face and returns one solid opaque colour; shadow gap visible. | **Surface behind glows** in a halo; face stays dark and solid. |
| **Channel letters — front + halo** | As front lit, plus a standoff gap. | Face glows **and** halo present, balanced. |
| **Channel letters — non-lit** | Dimensional letters with a cast shadow. | **Never self-illuminated.** |
| **Pill box — reversed out** `CL-CT-02` | Dark field, copy in the face colour. | Field stays dark, **copy glows**. |
| **Pill box — vinyl on white** `CL-CT-01` | Coloured copy on a white field. | **Field glows white, copy stays dark.** |
| **Pill box — translucent copy** `CL-CT-03` | Coloured copy on white. | Field glows white, copy glows in colour. |
| **Logo box** | Reads as the logo silhouette, not a rectangle. | Face glows in the logo colours. |
| **Flat cut letters** | Flat, dimensional, cast shadow, no visible return depth. | **Dark.** No glow of any kind. |
| **Applied vinyl** | Flat graphics, no dimension, no shadow. | **Dark.** |
| **Push-through acrylic** | Copy proud of the face. | Field dark, copy glows and reads dimensional. |

**True of every render:**

- Sign sits inside the measured area and clears windows, doors, awnings, mullions, downspouts
  and expansion joints.
- Return depth reads consistently in perspective at the specified value.
- **Box faces sit in the same plane as the letter faces** — depths match.
- Raceway, wireway or bottom rail drawn where specified, **surface-coloured**.
- Standoff gap drawn for every rear-illuminated element.
- Bottom-mounted sets sit **on** the rail, rail visible beneath the baseline.
- Per-item proportions match the measured values — do not re-proportion.
- **Mixed-construction signs must read as one object**: shared baseline logic, aligned edges,
  consistent depth, one colour family.
- **No fabrication hardware** in a customer-facing render: no rivets, studs, drivers, conduit.

## 9.3 Required spec block — **one per element**

```
SIGN TYPE          Channel Letters — <n> elements
QUANTITY           <n>
OVERALL SIZE       <W>" × <H>"  ·  <sq ft> sq ft
MOUNTING           <method> (<CL-MT-##>)
RACEWAY/WIREWAY    <H × D>, colour: match building
BACKER             <shape>, <material>, <size>, colour: <...>
CONTROL            <photocell | timer>

── ELEMENT 1 · <role> · "<content>"
   CONSTRUCTION    <CL-C-##>
   SIZE            <W>" × <H>"   ·   CAP HEIGHT <h>"
   RETURN DEPTH    <d>"
   FACE            <material>, <colour>
   RETURN          aluminium, <colour>
   TRIM CAP        <1" GemTrim ####  |  Jewelite <colour>  |  retainer  |  n/a>
   ILLUMINATION    <LED white | none>
   COPY TREATMENT  <CL-CT-##>              (boxes only)

── ELEMENT 2 · …
```

Then the **standing notes** block (§6.9). Suppress thickness and dimension lines per the form.

## 9.4 Required disclosures

1. ⚠ **Critical substitutions in their own callout**, above the notes list, written for the
   customer. Construction changes are the most common:
   *"'Crepes and Waffles' is 4″ tall — too small to build as individual channel letters, where
   the minimum is 8″. We've shown it as an illuminated capsule with the copy reversed out, so
   it lights the same way the letters do at night and stays crisp at that size."*
2. Every other AUTOFIX in plain language.
3. Every WARN — including any non-standard return depth.
4. Every defaulted field.
5. The disclaimer:

> **Pre-sales concept only.** Colours are indicative and not a colour match. Dimensions are
> approximate and subject to site survey. Not for production, permit or engineering use.
> Final specifications require review by a Sign Pack designer and the selected fabricator.
> Permit allowances, landlord criteria and structural requirements have not been verified.

## 9.5 Design guidance (soft, after every hard rule passes) `[SP]`

Legibility over decoration. Contrast against the surface, day and night. Size for viewing
distance (§10). Materials appropriate to the environment. Light without glare.
When in doubt, **simplify** — `[SP]` *"always look for simplicity. We can change and simplify
fonts and shapes in order to make the sign happen."*

---

# 10. LETTER VISIBILITY CHART `[SP]`

| Letter height | Best-impact distance | Max readable distance |
|---|---|---|
| 3″ | 30 ft | 100 ft |
| 4″ | 40 ft | 150 ft |
| 6″ | 60 ft | 200 ft |
| 8″ | 80 ft | 350 ft |
| 10″ | 100 ft | 450 ft |
| 12″ | 120 ft | 525 ft |
| 15″ | 150 ft | 630 ft |
| 18″ | 180 ft | 750 ft |
| 24″ | 240 ft | 1,000 ft |
| 30″ | 300 ft | 1,250 ft |
| 36″ | 360 ft | 1,500 ft |
| 48″ | 480 ft | 2,000 ft |
| 60″ | 600 ft | 2,500 ft |

Best-impact distance ≈ **10 ft per inch of letter height**. Use it to sanity-check tagline
copy: a 3″ tagline stops being readable past ~100 ft, whatever it is built from.

---

# 11. OPEN QUESTIONS

Three left. None blocks the agent.

1. **Does “Other” installation method need sub-options?** Tape or adhesive, square tube frame,
   free-standing base, suspended — as dropdown values, or free text the agent reads?
2. **Backer Panel Options dropdown values** — if they don't match the eight shapes in §4.5 they
   need a mapping table like §1.2.
3. **Trim cap brand preference** — GemTrim and Jewelite are treated interchangeably. If the
   shop stocks one, the agent will name from it first.

**Closed:** depth convention · installation methods · non-lit depth · polycarbonate widths ·
propose-vs-stop · trim cap catalogue · paint and vinyl colour systems · **element composition**.

---

# APPENDIX A — STAGE 2 VENDOR REFERENCE
### Parked. The Stage 1 bot does not read this.

## A.1 Where the house numbers came from

| House rule | Value | The vendor spread it collapses |
|---|---|---|
| Min stroke, illuminated | **1.5″** | Sign Fab 1.5″ · Esco 1.5–2″ · house 1.5″ · *(Steel Art 3/4″, Everylite 0.6″)* |
| Min stroke, front+halo | **2″** | Sign Fab 2″ · Esco 2″ |
| Min stroke, non-lit | **1″** | Sign Fab flat cut 0.75″ · Steel Art depth ÷ 3 |
| Min height, illuminated | **8″** | Sign Fab 7″ · Esco 8″ · *(Steel Art 4–6″, Everylite 3″)* |
| Min height, serif/script | **10″** | Esco 10″ |
| Min height, non-lit | **3″** | Sign Fab flat cut 3″ · Everylite 3″ |
| Formed face seamless max | **8′ × 14′** | Esco 8′×13′-11″ · Art Works 8′×16′ · McHenry 7′-6″×13′-4″ |
| Return depths | **3″ and 5″ stocked** | Sign Pack direction; industry 3–8″, Gemini lines 1–6″ |

## A.2 Vendor minimums

| Vendor | Face Lit | Halo Lit | Front+Halo | Notes |
|---|---|---|---|---|
| **Sign Fab** | 7″H, 1.5″ | 7″H, 1.5″ | 7″H, 2″ | Backers ≥ 4″. 2nd raceway over 36″H. Flat cut aluminium 3″H / 0.75″. PMS C only. |
| **Esco** | 8″H sans / 10″H serif, 1.5–2″ | 8″/10″H, 2″ | 8″/10″H, 2″ | PMS C only. Retainer → poly faces; trim cap → acrylic. Formed max 8′×13′-11″. |
| **Steel Art** | ThinTrim 5″H / Edge Lit 6″H, 3/4″ | 4″H sans, 6″H serif | — | **No raceways.** Stroke ≈ depth ÷ 3; illuminated floor 3/4″. |
| **Everylite** | 3″H, 0.6″ | same | same | Smallest minimums available. |
| **Gemini** | see A.3 | see A.3 | — | **PMS or brand colour + number only.** Flat cut metal: 0.125″ stroke, 0.080″ serif. |
| **Art Works** | pan formed | — | — | 4″ min stroke, ~6″ min height. Formed faces max 8′×16′. |
| **McHenry** | pan formed | — | — | 4″ stroke, 6″ height. Formed max 7′-6″×13′-4″. |

## A.3 Gemini published lines

| Line | Return depths | Heights |
|---|---|---|
| Stainless Steel Halo Lit | 1″, 1.5″, 2″, 3″, 4″ | 6″–36″ |
| Painted Aluminium Halo Lit | 1″, 1.5″, 2″, 3″, 4″ | 16″–60″ |
| Trimless SS & Alum Halo Lit | 1″, 2″, 3″ | SS 6″–36″; Alum 16″–48″ |
| Trimless SS & Alum Face Lit | 2″, 3″ | SS 6″–36″; Alum 16″–48″ |
| Stainless Steel Face Lit | 3″, 4″, 5″, 6″ | 9″–36″ |
| Painted Aluminium Face Lit | 3″, 4″, 5″, 6″ | 16″–60″ |
| Custom Cast Halo Lit | 1″–3″ | 6″–24″ |
| Lit Acrylic | 1.5″ | 8″–24″ |
| Formed Plastic G-100 … G-500 | 1″, 1.25″, 1.5″, 2″ | 6″–36″ (faux neon 6″–24″) |

## A.4 Steel Art published lines

| Line | Height | Depth | Notes |
|---|---|---|---|
| Edge Lit | 4″–48″ | 0.75″–6″ | Acrylic projection .25″–.75″. Front lit needs 2″ min can depth. |
| ThinTrim / Plus | 6″–48″ | 2″–6″ | Retainer lip 1/8″. White acrylic #2447 / #7328, RGBW. |
| Sidelit / Extra | 6″–24″ | 1/2″–1.5″ | **1.25″ min stroke.** |
| Fab Bevel Edge | 10″–36″ | 1.5″–4″ | SS and titanium, RGBW. |
| Perforated / Special | 10″–48″ | 2″–6″ | With or without illumination. |
| Marquée | 4″–48″ | 2″–6″ | Simulated neon or bulbs. |

---

# APPENDIX B — STAGE 2 TECHNICAL REFERENCE
### Parked. The Stage 1 bot does not read this.

## B.1 LED module spacing by return depth `[EXT]`

| Return depth | Module spacing |
|---|---|
| 2″–3″ | Not viable with standard SMD modules for a **front-lit** face |
| 4″ | 4″–6″ |
| 5″ | 6″–8″ |
| 6″ | 8″–10″ |
| 8″+ | up to 12″ with high-output modules |

White acrylic diffuses well and tolerates wider spacing; coloured acrylic needs tighter.

## B.2 Power supply sizing `[SP]`

```
Total W     = module count × watts per module
With margin = Total W × 1.25
Driver      = next standard size above
Example: 50 × 0.72 W = 36 W → × 1.25 = 45 W → specify a 60 W driver.
```

## B.3 Aluminium coil `[EXT]`

3105-H14 alloy. .040 standard, .063 heavy-duty, .080 for 36″+ letters. 270 ft per coil, 20″ ID,
PVC mask one side. Stocked White/White and Black/White; Bronze, Red, Matte Black special order.

## B.4 Raceway extrusions `[EXT]` Eastern Metal

3″×1.5″ (RW-3) · 4″×1.5″ and 4″×1″ (RW-4A) · 7-1/4″ (RW-7) · 6″×6.5″ · 7-1/4″×7″. Tab-mounted
LED raceways 4.5″×4.5″, 4.5″×7″, 7-1/4″×7″. Lids, end caps, 20 ft lengths.

## B.5 Trim cap and film fabrication notes `[EXT]`

- Seal GemTrim with a full bead of **Scigrip #16 or #40**.
- **Avoid contact between translucent film and the trim cap adhesive** — 3M warns this causes
  curling and premature failure.
- 3M Envision 3730 transmits more light than 3630 — fewer modules for the same brightness.
- Oracal 8500: 3 mil, 55 colours, widths 15″ (punched), 24″, 30″, 36″ (black and white only),
  48″. Durability 7 yr Zone 1 colours, 5 yr metallics.

## B.6 Code detail `[EXT]`

NEC 600.5 dedicated 20 A minimum branch circuit · 600.6 disconnect externally operable,
lockable open, within sight · 600.9(A) 14 ft clearance over vehicle-accessible areas unless
mechanically protected · 600.9(D) weatherproof with drain holes in wet locations · UL 48: since
1 July 2024 individual letters need not be labelled separately if the UL "Electric Sign" mark
is on the raceway or enclosure containing the power supply.

## B.7 Esco minimum fabrication dimensions

| Dim | CHL 5″ | CHL 7.5″ | RCHL 1.5″ | RCHL 3″ |
|---|---|---|---|---|
| A | 3/8″ | 3/8″ | 3/8″ | 3/8″ |
| B | 1-1/2″ | 1-1/2″ | 1-1/2″ | 1-1/2″ |
| C | 1/2″ | 1/2″ | 1/2″ | 1/2″ |
| D | 1″ | 1″ | 1″ | 1″ |
| E | LED W + 1″ | LED W + 1″ | LED W + 1″ | LED W + 1″ |
| H (majority min stroke) | 1-1/2″ | 1-1/2″ | 1″ | 1-1/2″ |
| K (minority min stroke) | 1-1/2″ | 1-1/2″ | 1″ | 1-1/4″ |
| S | 8″ | 12″ | 6″ | 8″ |
| T | 8″ | 12″ | 6″ | 8″ |

**N by letter height:** 8″–24″ → 3/4″ · 25″–48″ → 1″ · 49″–72″ → 1-1/2″ · 73″–96″ → 2″.
Backs inset: CHL 0.13″ · reverse CHL 0.140″ · baffled 0.063″.

---

*End of Channel Letters KB v2.2. Runtime checklist: `02-AGENT-CHECKLIST.md`.
Machine-readable rules: `channel-letters-rules.json`.*
