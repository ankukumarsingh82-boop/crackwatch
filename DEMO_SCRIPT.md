# CrackWatch — 3 minute demo script

Read this at a normal pace. About 150 words a minute, so the whole script is roughly three minutes. The page should already be open. The plaster sample loads on its own.

---

**0:00 — What it is**

This is CrackWatch. You photograph a crack in a wall, a ceiling, a pillar or a floor — the thing people in a flat or a housing society argue about — and it outlines the crack, estimates how long and how wide it is, and rates it.

It runs in the browser. The photo stays on the phone. And it is not an engineer. The disclaimer stays on the card for that reason.

**0:25 — The outline**

This first picture is a plaster wall, from an open photo by Nolan Issac. The red line is the crack mask. I can turn it off and on.

It is not a chatbot looking at the picture. A black-hat filter picks out thin dark lines, and a ridge filter drops round texture like plaster grain. What is left gets thinned to a centreline for the length, and the width is read across the dark dip.

If your crack is faint, the sensitivity slider keeps more of it. If you are looking at rough concrete or at grout lines, it will outline those too. That is a real limit.

**1:05 — The scale**

Pixels are not millimetres. On a real wall I would put a ten-rupee coin next to the crack — it is 27 millimetres across — and tap the two sides.

For this sample there is no coin, so I will use the illustrative scale. It pretends the long edge of the photo is 30 centimetres. The page says that, so nobody mistakes it for a measurement.

**1:30 — The rating**

The card shows length, a typical width, and the widest point. The rating uses the widest point, plus the shape.

Under 0.3 millimetres, and straight, is a hairline: photograph it again in a few months.

From 0.3 to 3 millimetres, straight, is "monitor": measure it again with the same coin.

Over 3 millimetres, or a diagonal or a stair-step at any width, says see a structural engineer. Diagonal and stair-step cracks can mean the wall is moving, even when they are still narrow.

The reasons are written under the badge. You can see which rule fired.

**2:10 — Another pattern**

Here is a different sample: the crack in the wall at Kilfane. The pattern comes back as diagonal, about 44 degrees. Width is not the whole story. A diagonal or a stair-step is rated "see an engineer" even when the line is still narrow, because that shape can mean the wall is shifting.

On the Tbilisi sample, mortar joints are also thin and dark, so they get outlined too. That is the failure to know about: cables, grout and mortar can look like cracks.

**2:35 — Growth, and the close**

If you have an older photo of the same crack, "Has it grown?" lines the two pictures up and paints new crack in red. It needs the same wall in both frames. A one-pixel margin stops a small change in where you stood from looking like movement.

I would not vacate a building from this screen. I would use it to decide whether to watch the crack, or to call someone who can stand in the room.

---

## If something misbehaves while recording

- Overlay missing: click a sample again, or raise sensitivity.
- Rating says "Scale needed": press "Illustrative scale: long edge = 30 cm", and say that it is not a real measurement.
- Growth check spins: it is downloading OpenCV.js once. If it fails, skip to the disclaimer and keep going. The single-photo check is the core.
