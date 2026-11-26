# Print n More: website

A static website for Print n More (Miami, since 1990). The layout and motion take their cues from the Moss portfolio template: giant edge-to-edge titles, curved section edges, sticky stacked cards, a dark work grid, marquee testimonials and a pill-style call to action. It is recoloured in the brand's CMYK palette, taken straight from the logo.

No Moss code or assets are used. Everything here is written from scratch.

## Pages

| File | What's on it |
|---|---|
| `index.html` | Hero with drifting CMYK ink and two switchable photo styles (fold carousel `assets/js/fold.js` and the original floating photos), intro, "fine print" perks, 6 stacked service cards, ticker, work grid, testimonials, product slider |
| `services.html` | All six departments with full product lists and the partner catalogue links |
| `work.html` | Filterable gallery with lightbox |
| `about.html` | Story, what we do, how we work, client quote |
| `contact.html` | Phone, email, fax, address, quote-request form, map |

## Preview locally

```powershell
python -m http.server 5317
```

Then open http://localhost:5317.

## Brand tokens (`assets/css/style.css`)

- Cyan `#00AFF0`, Magenta `#E50278`, Yellow `#FFF000`, Ink `#0E0E12`, Paper `#F4F3EF`
- Type: Bricolage Grotesque (display + body), Instrument Serif italic (accents), both from Google Fonts

## Before launch

- **Photos:** several images on the current site are stock or supplier mockups. These include the business-card and car-show postcard mockups, the USB drive, the CMYK pigment and the screen-printing photo. Swap in real job photos where possible, keeping the same filenames in `assets/img/`.
- **Hero style:** a pill at the top of the home page switches between Fold and Floating (also `?hero=fold|floats`; the last pick is remembered on that device). Once one is chosen, delete the `.hero-switch` element and set `data-hero-variant` on the hero to it. You can also remove the other style's markup (and `fold.js` if Floating is kept). The Fold style loads three.js from jsDelivr the first time it is shown.
- **Hero fold photos:** `<img>` tags inside `.hero-fold` in `index.html`, in the order they pass (photo 1 starts in the centre). Each card's words come from the tag's `data-title`, `data-subtitle`, `data-tag` and `data-caption` (leave one out to drop it). Make them about 1200 × 1500 px (4:5, portrait). Timing and effect strength are in `CONFIG` at the top of `fold.js`.
- **Cache busting:** every page loads `style.css`, `main.js` and `fold.js` with `?v=20261125-10`. After changing any of those files, bump that number on all five pages, or visitors (and your own browser) may keep an old copy and the page can break, for example the hero showing raw photos.
- **Quote form:** for now, submitting it opens the visitor's email app with the details filled in. To receive submissions directly, connect a form service such as Formspree, Netlify Forms or Basin.
- **Copy check:** confirm with the owner that these are still offered: "Free pick-up", "24-hour rush", "Low price guaranteed" and the three-county service area.
- **Domain:** the canonical/OG URLs assume `https://printnmore.com/`.
