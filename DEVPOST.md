# CrackWatch — Devpost draft

## Inspiration

In a lot of Indian homes the first structural question is not abstract. It is a line in the plaster, a stair-step in a brick pier, a crack above a door in a housing society, and a family argument about whether it can wait. Engineers are the right people to answer that. Phones are what people actually have on a Sunday evening.

CrackWatch started from that gap: a photo, a coin everyone has in a pocket, and a rating with the rules written out, so "it looks bad" becomes a number you can photograph again next month.

## What it does

- Outlines a crack on the photo, pixel by pixel, in the browser.
- Estimates length along the centreline and width across the dark dip.
- Converts pixels to millimetres from a ₹10 coin (27 mm), a ₹5 coin, or any known length you tap.
- Rates the crack: hairline (under 0.3 mm), monitor (0.3–3 mm), or see a structural engineer (over 3 mm, or a diagonal or stair-step pattern).
- Optionally compares an older and a newer photo and reports whether the crack appears to have grown.
- Ships with four credited sample photos so it can be tried with no camera.

## How we built it

The whole app is static HTML, CSS and JavaScript, so it can sit on GitHub Pages with no API key and no server. That constraint ruled out sending the photo to a general vision model, which was also the wrong tool: judges and users both need a crack measurement, not a caption.

Segmentation is the classical crack pipeline. A multi-scale morphological black-hat lifts thin dark lines. A Frangi ridge filter, the same family of filter used on blood vessels, rejects round texture such as plaster grain. Hysteresis thresholding and an elongation check drop stains and shadows. Length uses Zhang–Suen thinning with diagonal steps counted as √2. Width is a half-depth profile across the centreline, because the binary mask is wider than the crack and would inflate every reading. Risk rules are pure functions with tests around the 0.3 mm and 3 mm boundaries, and around what counts as a stair-step (a real stepped path, not two unrelated cracks).

The growth check is the piece that does use a library: OpenCV.js, loaded only when needed, for ORB features and a RANSAC homography. A one-pixel margin stops a small change in camera position from looking like movement.

The interface was designed mobile-first, because the photo will be taken in a corridor. The rating, the three numbers, and the reason are on one card. The disclaimer stays on that card.

## Challenges

Phone photos of walls are not the road-crack datasets most pretrained segmenters are trained on. A small network trained on asphalt would have been a worse fit, and training one properly was not going to be honest inside a hackathon window. The hand-built pipeline is weaker on rough concrete, grout and cables, and stronger on the plaster cracks the product is for. We tuned it on openly licensed photographs and kept the failures in the limitations instead of hiding them.

Width was the other trap. Measuring the binary mask reported almost every crack as several millimetres wide. Moving the measurement onto the greyscale dip, and reporting a typical width beside the widest point, made the number follow the crack instead of the outline.

## Accomplishments that we're proud of

- A crack tool that runs offline in the browser, with the maths tested.
- Ratings a person can argue with, because the rule that fired is on the screen.
- Sample photos with names, licences and sources, so the demo is not a blank upload box.

## What we learned

A coin in the frame matters more than a fancier model. Without a scale, a beautiful outline is still just pixels. And a stair-step detector that looks at the whole photo, rather than one crack, will call a normal plaster pattern an emergency.

## What's next

- A closer capture guide (how near, how square, where to put the coin).
- Letting the user erase a grout line or a cable from the mask before the rating.
- Repeating the growth check against a saved reading, not only against a second photo.

## Built with

HTML, CSS, JavaScript, OpenCV.js, and the classical filters credited in the README (Frangi vesselness, Zhang–Suen thinning, Felzenszwalb distance transform).

## Disclaimer

CrackWatch is not a structural inspection and not a substitute for a qualified structural engineer.
