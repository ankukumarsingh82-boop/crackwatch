# CrackWatch

CrackWatch is a photo check for cracks in walls, ceilings, pillars and floors — the kind people notice in a flat or a housing society and are not sure whether to worry about.

You take a picture. The page outlines the crack, estimates its length and its width, and rates it with rules you can read: **hairline**, **monitor**, or **see a structural engineer**. It runs entirely in the browser. The photo is not uploaded.

It is a screening aid. It is not a structural inspection, and it does not replace an engineer.

## Try it

The site is static and is published on the `gh-pages` branch. Until GitHub Pages is switched on for the repository, the same files are served here:

https://raw.githack.com/ankukumarsingh82-boop/crackwatch/gh-pages/index.html

The first visit shows that host’s “Open the page” notice. After that, the plaster sample loads on its own. Choose **Use 30 cm across the long edge** to see a rating. That scale is labelled illustrative: it is not measured from the picture.

The intended GitHub Pages address is https://ankukumarsingh82-boop.github.io/crackwatch/ . In the repository settings, set Pages to deploy from the `gh-pages` branch, folder `/`.

## Why it matters

Hairline plaster cracks are common and often harmless. A crack that is widening, or one that runs diagonally or stair-steps through brickwork, can mean the building is moving. People usually have a phone and not a crack gauge. CrackWatch is a first look: measure it the same way next month, and know when the photo is no longer enough.

## How it works

### Segmentation

The outline is a crack-shaped computer-vision pipeline, not a general vision API.

1. The photo is reduced so the long edge is about 720 pixels, then converted to greyscale.
2. Slow lighting is divided out, so a shadow across the wall is not treated as a crack.
3. **Multi-scale black-hat.** A greyscale closing fills dark lines thinner than the structuring element. Subtracting the original image leaves those lines and ignores wide stains. Radii are 1, 2, 4 and 7 pixels.
4. **Frangi vesselness** (Frangi et al., MICCAI 1998) at two scales. Cracks are ridges. Round texture — plaster grain, concrete pores — is not, and the filter drops it.
5. Hysteresis thresholding keeps strong ridge pixels and the weaker pixels connected to them. A one-pixel closing bridges small gaps. Components that are not elongated are discarded.

Raising sensitivity keeps fainter lines. "Crack is lighter than the wall" inverts the photo first, for the less common pale crack on a dark surface.

### Measurement

The scale comes from something in the same plane as the crack:

- a ₹10 coin, 27 mm across (tap the two sides of the diameter)
- a ₹5 coin, 25 mm (2019 onwards) or 23 mm (older coins still in circulation)
- any two points whose real distance you know

Millimetres per pixel = known length ÷ pixel distance. The camera should be square to the wall. An illustrative control treats the long edge of the photo as 30 cm so the rating can be previewed; it is labelled as not a measurement.

**Length.** The mask is thinned to a one-pixel centreline (Zhang–Suen, 1984). Orthogonal steps count as 1 px and diagonal steps as √2, so a slanted crack is not short-changed.

**Width.** Width is the dark dip across the centreline, not the thickness of the binary mask (the mask runs wider than a hairline). At each centreline pixel the image is sampled perpendicular to the crack. The width is how far the line stays darker than halfway from its darkest point to the plaster beside it. The **typical width** is the median of those cross-sections. The **widest point**, which the rating uses, is the 90th percentile, so one junction does not set the number by itself.

### Risk rules

| Rating | When |
| --- | --- |
| Hairline | Widest point under 0.3 mm, and the crack is not diagonal or stair-step |
| Monitor | Widest point from 0.3 mm to 3 mm, in a straight pattern |
| See an engineer | Widest point over 3 mm, **or** a diagonal or stair-step pattern at any width |

A stair-step is one crack that switches between across and down at least twice, with a real run in each direction — the mortar-joint pattern in a shifting wall. Two separate cracks, one across and one down, are not called a stair-step. A single corner is not either. A diagonal is a consistent slant between 25° and 65° from horizontal.

### Growth check

An older photo and a newer photo are aligned with ORB features and a RANSAC homography (OpenCV.js). Both are segmented in the shared frame. Crack pixels in the new mask that are not within one pixel of the old mask count as possible growth. The one-pixel margin is there because a small change in where you stood should not look like movement.

## Tech stack

- Static HTML, CSS and JavaScript. No build step and no server.
- The segmentation, skeleton, distance transform and width profile are plain JavaScript, so the measurement can be tested in Node.
- [OpenCV.js](https://docs.opencv.org/4.9.0/opencv.js) 4.9 is loaded only when you run the growth check.
- Hosted as a static site from the `gh-pages` branch (GitHub Pages, or the link above until Pages is enabled).

## Credits

Methods:

- Alejandro F. Frangi, Wiro J. Niessen, Koen L. Vincken, Max A. Viergever. *Multiscale vessel enhancement filtering.* MICCAI 1998. The ridge filter used to separate cracks from round texture.
- T. Y. Zhang and C. Y. Suen. *A fast parallel algorithm for thinning digital patterns.* Communications of the ACM, 1984.
- Pedro F. Felzenszwalb and Daniel P. Huttenlocher. *Distance Transforms of Sampled Functions.* Theory of Computing, 2012. Used for the geometric width check.
- OpenCV, Apache 2.0, for ORB and homography in the growth check. https://opencv.org

Coin diameters: the current ₹10 coin is 27 mm; ₹5 coins are 23 mm (older) or 25 mm (2019 onwards). Reserve Bank of India coin specifications.

Sample photographs, bundled so the demo works without a camera:

| Photo | Author | Licence | Source |
| --- | --- | --- | --- |
| Plaster wall | Nolan Issac | CC0 | https://commons.wikimedia.org/wiki/File:Cracked_Cream_Walls_(Unsplash).jpg |
| Stepped crack, Tbilisi | Vladimer Shioshvili | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Crack_in_the_wall.jpg |
| Kilfane Church wall | A.-K. D. | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Crack_in_the_wall_(44892).jpg |
| Larkbeare Road, Exeter | David Smith / Geograph Britain and Ireland | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Crack_in_the_wall,_Larkbeare_Road,_Exeter_-_geograph.org.uk_-_5058687.jpg |

## Limitations

- It is not an inspection. A dangerous crack can be hard to see, and a harmless one can look dramatic in raking light.
- Hairlines only show up if you are close. At 720 pixels across a whole wall, a 0.3 mm crack is a fraction of a pixel.
- Width is read from the dark dip in the photo. Blur, shadow and a thick mask all push it wider. Treat the number as a screening estimate and repeat it with the same coin and the same distance.
- Grout, formwork lines, cables and picture frames are thin and dark, so they can be outlined too. Mortar joints next to a real crack are the usual false lines.
- Very wide cracks, larger than the black-hat kernels, may be traced at their edges rather than filled in.
- Rough concrete and busy tile are weaker than a crack in smooth plaster.
- The growth check fails when the two photos do not share enough wall around the crack, or when OpenCV.js cannot be loaded. The first comparison downloads about 10 MB and the library's startup can stall the tab; reload if that happens. The single-photo check does not use it.
- Diagonal and stair-step calls are geometric. They are a reason to ask an engineer, not a diagnosis of shear or settlement.

## Run locally

Any static server from the repository root:

```bash
python3 -m http.server 4173
```

Open `http://localhost:4173`. The growth check needs network access the first time, to load OpenCV.js.

Tests cover the measurement maths, the risk bands, the pattern rules, mask comparison, and segmentation of a synthetic crack:

```bash
npm install
npm test
```

## Licence

MIT. See [LICENSE](LICENSE). Sample photographs keep the licences in the table above.
