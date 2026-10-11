# CrackWatch

**Live demo:** https://raw.githack.com/ankukumarsingh82-boop/crackwatch/7f4c5ef2a36b3d2e034926c225c4b446aca18a7c/index.html

The first visit asks you to press **Open the page**. The plaster sample loads in pixels and does not show a risk rating. Open **Demo: coin close-up** and press **Use the coin in this demo (27 mm)** for a rating in millimetres.

https://ankukumarsingh82-boop.github.io/crackwatch/ redirects away and does not load. Use the link above.

---

## Inspiration

In a lot of Indian homes the first structural question is not abstract. It is a line in the plaster, a stair-step in a brick pier, a crack above a door in a housing society, and a family argument about whether it can wait. Engineers are the right people to answer that. Phones are what people actually have on a Sunday evening.

CrackWatch started from that gap: a photo, a coin everyone has in a pocket, and a rating with the rules written out, so “it looks bad” becomes a number you can photograph again next month.

## What it does

- Outlines a crack on the photo, pixel by pixel, in the browser.
- Refuses the outline when the marks look like texture: short pieces, repeated lines (wood grain, cables, brick joints), or strokes pointing in conflicting directions. The card says “No clear crack found — try a closer photo.”
- Estimates length along the centreline and width across the dark dip. Until you set a scale, those numbers stay in pixels.
- Converts pixels to millimetres only from a ₹10 coin (27 mm), a ₹5 coin, or any known length you tap. A “30 cm across the long edge” control does not produce a rating.
- Includes a drawn close-up with a 27 mm disc, and one button that applies that coin, so the demo can show a genuine rating.
- Rates the crack: hairline (under 0.3 mm), monitor (0.3–3 mm), or see a structural engineer (over 3 mm, or a diagonal or stair-step pattern).
- Offers a beta growth check: an older photo and a newer one, aligned with ORB and a homography. If OpenCV.js does not start within 10 seconds, the page says so and the single-photo check still works.
- Ships with credited sample photos so it can be tried with no camera.

## How we built it

The whole app is static HTML, CSS and JavaScript, so it runs with no API key and no server. That constraint ruled out sending the photo to a general vision model, which was also the wrong tool: the result has to be a measurement, not a caption.

Segmentation is a classical crack pipeline. A multi-scale morphological black-hat lifts thin dark lines. A Frangi ridge filter, the same family of filter used on blood vessels, rejects round texture such as plaster grain. Hysteresis thresholding and an elongation check drop stains and shadows. A second gate then looks at the lines that survived: how long the longest collinear run is, how many similar runs sit beside it, and whether they share a direction. Texture fails that gate. A real crack does not.

Length uses Zhang–Suen thinning, with diagonal steps counted as √2. Width is a half-depth profile across the centreline, because the binary mask is wider than the crack. Risk rules are pure functions, tested at the 0.3 mm and 3 mm boundaries, and around what counts as a stair-step (one stepped path, not two unrelated cracks). Only a coin or a two-point scale is allowed to turn those pixels into a badge.

The growth check is the piece that uses a library: OpenCV.js 4.9, loaded on demand, for ORB features and a RANSAC homography. It is labelled beta. The build is about 10 MB, which is too large to bundle, so it stays on the OpenCV host with a 10 second timeout. A one-pixel margin stops a small change in camera position from looking like movement.

The interface is mobile-first, because the photo will be taken in a corridor. The rating, the three numbers, and the reason are on one card. The disclaimer stays on that card.

## Challenges

Phone photos of walls are not the road-crack datasets most pretrained segmenters are trained on. A small network trained on asphalt would have been a worse fit, and training one properly was not going to be honest inside a hackathon window. The hand-built pipeline is weaker on rough concrete and on mortar that is fused to a real crack, and stronger on a crack in smooth plaster. We tested it on openly licensed photographs and on synthetic brick, wood grain, foliage, wires and stucco, and we kept the failures in the limitations.

Width was the other trap. Measuring the binary mask reported almost every crack as several millimetres wide. Moving the measurement onto the greyscale dip, and reporting a typical width beside the widest point, made the number follow the crack instead of the outline.

A third trap was scale. Treating the long edge of the photo as 30 cm produced confident millimetre ratings that were not measurements. The badge now waits for a coin or two tapped points. The drawn coin sample is there so a judge can still see a real rating in one click.

## Accomplishments that we're proud of

- A crack tool that runs in the browser, with the maths and the no-crack gate tested.
- Ratings a person can argue with, because the rule that fired is on the screen, and because a fake scale cannot fire a rule.
- Sample photos with names, licences and sources, plus a drawn coin close-up so the demo is not a blank upload box.

## What we learned

A coin in the frame matters more than a fancier model. Without a scale, a beautiful outline is still just pixels. And a detector that calls every dark line a crack will rate ivy, wood grain and power lines as if the building were moving.

## What's next

- A closer capture guide: how near, how square, where to put the coin.
- Letting the user erase a grout line or a cable from the mask before the rating.
- A smaller growth check that does not depend on a 10 MB download.

## Built with

HTML, CSS, JavaScript. Frangi vesselness (MICCAI 1998), Zhang–Suen thinning (1984), the Felzenszwalb distance transform (2012). OpenCV.js 4.9 (Apache 2.0) for the beta growth check. Sample photographs by Nolan Issac (CC0), Vladimer Shioshvili (CC BY-SA 2.0), A.-K. D. (CC BY-SA 4.0), and David Smith / Geograph (CC BY-SA 2.0). Coin diameters from Reserve Bank of India specifications: ₹10 is 27 mm.

## Disclaimer

CrackWatch is not a structural inspection and not a substitute for a qualified structural engineer.
