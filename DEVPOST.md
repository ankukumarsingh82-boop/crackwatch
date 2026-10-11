# CrackWatch

**Live demo:** https://raw.githack.com/ankukumarsingh82-boop/crackwatch/COMMIT_PIN/index.html

The first visit asks you to press **Open the page**.

1. The plaster photo loads with an outline and pixel sizes. There is no rating yet.
2. **Wood grain** is a picture we drew. It should say **No clear crack found — try a closer photo**.
3. **Synthetic: drawn coin** is not a photograph, and the disc is not detected. Press **Apply the 27 mm scale** to enter that known length. The badge should say **Monitor**.

## Inspiration

In a lot of Indian homes the first structural question is a line in the plaster, a crack above a door, and a family argument about whether it can wait. Engineers are the right people to answer that. A phone is what people actually have on a Sunday evening.

CrackWatch started from that gap: a photo, a known length such as a coin, and a rating with the rule written out, so “it looks bad” becomes a number you can photograph again next month.

## Brainstorming

We wanted one job: look at a crack and say how serious it looks, in words a household can use. The first idea was to send the photo to a general vision model. That would have been a caption, not a measurement, and it would have needed an API key. We dropped it.

The path we kept is classical computer vision in the browser. A filter finds thin dark lines. A second check throws away texture. Pixels become millimetres only when the user supplies a known length. The rules are hairline, monitor, or see an engineer, and the reason is on the screen.

Two samples are drawn so a judge can try this without a camera. Wood grain is there to show a rejection. The coin picture is there so the known-length step can be pressed once. It is not a detector looking for a coin.

## Design process

The page is static HTML, CSS and JavaScript. The photo never leaves the phone.

Segmentation follows the shape of a crack. A multi-scale black-hat lifts thin dark lines. A Frangi ridge filter, the kind used on blood vessels, drops round texture such as plaster grain. Hysteresis and an elongation check remove stains. A confidence check then looks at what is left: the longest collinear run, how many similar runs sit beside it, and whether they share a direction. Repeated grain fails that check. The card says no clear crack was found, and it does not invent a pattern or a rating.

Length is a Zhang–Suen centreline, with diagonal steps counted as √2. Width is the dark dip across that line, not the thickness of the mask. The widest point used for the rating is the 90th percentile, so one junction does not set the number.

A rating needs a scale. The user taps a ₹10 coin (27 mm), a ₹5 coin, or any two points of known length. A “30 cm across the long edge” control keeps the numbers in pixels and does not rate. On the synthetic sample, **Apply the 27 mm scale** fills in the diameter we drew. The app does not search the picture for a coin.

The growth check is separate and marked beta. It loads OpenCV.js only when asked, aligns two photos with ORB and a homography, and stops after 10 seconds if the library does not start.

## Resources

No paid model and no vision API.

Methods and libraries:

- Alejandro F. Frangi, Wiro J. Niessen, Koen L. Vincken, Max A. Viergever. *Multiscale vessel enhancement filtering.* MICCAI 1998.
- T. Y. Zhang and C. Y. Suen. *A fast parallel algorithm for thinning digital patterns.* Communications of the ACM, 1984.
- Pedro F. Felzenszwalb and Daniel P. Huttenlocher. *Distance Transforms of Sampled Functions.* Theory of Computing, 2012.
- OpenCV.js 4.9, Apache 2.0, loaded on demand for the beta growth check. https://opencv.org and https://docs.opencv.org/4.9.0/opencv.js

Coin diameters used as the reference lengths: the current ₹10 coin is 27 mm. ₹5 coins are 23 mm, or 25 mm from 2019. Reserve Bank of India coin specifications.

Photographs, so the demo can start without a camera:

| Photo | Author | Licence | Source |
| --- | --- | --- | --- |
| Plaster wall | Nolan Issac | CC0 | https://commons.wikimedia.org/wiki/File:Cracked_Cream_Walls_(Unsplash).jpg |
| Stepped crack, Tbilisi | Vladimer Shioshvili | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Crack_in_the_wall.jpg |
| Kilfane Church wall | A.-K. D. | CC BY-SA 4.0 | https://commons.wikimedia.org/wiki/File:Crack_in_the_wall_(44892).jpg |
| Larkbeare Road, Exeter | David Smith / Geograph Britain and Ireland | CC BY-SA 2.0 | https://commons.wikimedia.org/wiki/File:Crack_in_the_wall,_Larkbeare_Road,_Exeter_-_geograph.org.uk_-_5058687.jpg |

Drawn by us, MIT, not photographs:

- `samples/wood-grain.jpg` — parallel grain, for the rejection case.
- `samples/coin-demo.jpg` — a crack and a disc whose diameter is 27 mm in the scale step. The disc is not detected.

## Final product

CrackWatch is a phone-friendly page. You open a photo or a sample. It outlines a crack, or it says none was found. You set a known length. It shows length, typical width, the widest point, the pattern, and a rating with the reason: hairline under 0.3 mm, monitor from 0.3 to 3 mm, or see a structural engineer above 3 mm or for a diagonal or stair-step pattern.

On the live demo, do this:

1. Plaster photo: outline on, sizes in pixels, no rating.
2. Wood grain: **No clear crack found — try a closer photo**.
3. Synthetic drawn coin: **Apply the 27 mm scale**. Expect **Monitor**, about 0.75 mm wide.

The disclaimer stays on the card. The page does not replace a structural engineer.

## Limitations

- It is a screening aid. Lighting, focus, angle and the reference all change the numbers.
- A hairline only shows up in a close photo. Across a whole wall it can be a fraction of a pixel.
- Width is read from the dark dip. Blur and shadow push it wider. Repeat the reading with the same reference and the same distance.
- Repeated grain is rejected. One long dark mark that is not a crack can still be outlined. On the Tbilisi photo, mortar beside the crack is still outlined.
- The drawn coin sample is not a photograph and not a coin detector. The 27 mm value is a scale step we labelled.
- The 30 cm control never produces a rating.
- The growth check is beta. It needs two photos of the same wall, downloads about 10 MB, and gives up after 10 seconds if OpenCV.js does not start.
