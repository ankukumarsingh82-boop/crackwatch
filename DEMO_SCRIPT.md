# CrackWatch — demo script (about 2:40–2:55)

Read this aloud at a steady pace, roughly 140 to 150 words a minute. The spoken part is about 400 words. The page should already be open on the live link in the README. The first visit on that host asks you to press **Open the page**. The plaster sample then loads by itself.

---

**0:00 — Inspiration**

This is CrackWatch, for Banana Hacks.

It started from a crack in the plaster, and the argument that follows in a lot of Indian homes: is this nothing, or do we call someone? On a Sunday evening the tool people have is a phone. CrackWatch is that first look. It outlines the crack, measures it against a coin, and writes down the rule. It is not an engineer. That line stays on the card.

**0:28 — How it was designed**

The plaster photo is open. The coloured line is a crack filter, not a chatbot. A black-hat filter lifts thin dark lines. A ridge filter drops round texture, like plaster grain.

A confidence check then throws the mask away if the lines are short, repeated, or pointing every which way. Brick, wood grain, ivy and a bundle of wires come back as “No clear crack found — try a closer photo.” No direction, and no rating.

The numbers under this photo are pixels. There is no rating yet.

**1:12 — The product, with a real scale**

A rating needs a scale. The “30 centimetres” button only keeps the pixel sizes. It will not invent millimetres.

I open **Demo: coin close-up**. The pale disc is a ten-rupee coin, 27 millimetres, drawn so we know the length. I press **Use the coin in this demo**.

Length and width are now in millimetres, and the badge is a real rating. Under 0.3 millimetres, straight, is a hairline. From 0.3 to 3 is monitor. Over 3, or a diagonal or a stair-step, says see a structural engineer. On a real wall I tap the two sides of a coin. That button is “Tap two points on the photo.”

**2:05 — Resources, and one more photo**

The other pictures are open photos, credited on the card: Nolan Issac, Kilfane Church, Exeter, and a stepped crack in Tbilisi.

Kilfane comes back diagonal, about 45 degrees. Direction matters as well as width. The maths is Frangi’s ridge filter, Zhang–Suen thinning, and a width read across the dark dip. Growth, at the bottom, is beta. It uses OpenCV and gives up after 10 seconds if the library does not start.

**2:32 — Close**

I would not vacate a building from this screen. I would use it to decide whether to watch the crack, or to call someone who can stand in the room.

---

## If something misbehaves

- The card says “No clear crack found”: open the plaster sample or the coin demo, or raise sensitivity.
- You want a rating: open **Demo: coin close-up** and press **Use the coin in this demo (27 mm)**. The 30 cm button will not rate the crack.
- Growth spins: it is beta. After 10 seconds it should stop with a message. Skip to the close.
