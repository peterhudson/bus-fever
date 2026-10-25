# Sarah's Bus Jam

A no-ads, no-purchases bus parking puzzle for the phone, inspired by the "bus jam" genre of mobile games. Made for Sarah.

**Play:** https://peterhudson.github.io/bus-fever/

## How to play

- Tap a bus to drive it the way its arrow points. If another bus is in the way, it bumps and stays put.
- Buses that get out park in a bay at the station.
- Two waiting lines, four abreast, feed a turning carousel: the left line empties first, then the right. You can only see the front few rows of each. People ride the carousel in rows of 4 and hop onto a parked bus of their own color, a whole row at a time, as they pass in front of its bay.
- Full buses drive away and free their bay. Board every passenger to win.
- If the carousel is full and nobody on it matches a bus in the bays, you're stuck.

Tap the crowd to make the carousel turn faster for a moment.

Special pieces show up as you go:

- **Mystery buses (level 8+)** are grey with a "?" until nothing blocks their way out (or you tap them).
- **Flip buses (every third level from 12)** carry a turn-around sign and turn around each time any bus leaves the lot.
- **Tunnels (level 15+)** release a new bus whenever the spot in front of them is clear. The badge shows how many are left inside.

- **Ice buses (from level 56)** are frozen. The number counts down each time a bus leaves the lot.
- **Bomb buses (from level 58)** count down each time another bus leaves. Get them out before they hit zero, or defuse one for 100 coins.
- **Locked buses (from level 60)** open when a bus the color of the padlock leaves the lot.
- **Traffic cones (from level 64)** never move.
- **HARD levels (every 10th level)** pack the buses into a shape (ring, plus, diamond or L), have a smaller carousel, and pay double coins.

Early levels scatter a few buses around the lot. From level 5 they're packed tightly on a grid, and the carousel gets smaller as the levels go up. Its shape changes from level to level, from round to long and flat. Past level 45 levels keep getting harder up to level 100: more buses, a smaller carousel, more special buses and a more mixed-up line. By level 100 one wrong move almost always loses.

## No ads, no pay-to-win

Everything the original style of game sells is earned by playing instead:

| Feature | How you get it |
| --- | --- |
| Extra bays (5th, 6th, 7th) | Bought with coins earned from levels (100 / 300 / 600) |
| Shuffle, Sort, VIP boosters | 2 of each to start, +1 of each every 5 levels, or 50 coins each |
| "Continue" when stuck | Open an extra bay for that level for 100 coins, use a booster, or retry for free |
| Lives / energy | None. Play as much as you like |

Boosters:

- **Shuffle** mixes up the colors of the buses still in the lot.
- **Sort** moves passengers who fit your parked buses to the front of the line.
- **VIP** flies any bus, even a blocked one, straight to the VIP bay.

## Install on an iPhone

1. Open the play link in **Safari**.
2. Tap the Share button, then **Add to Home Screen**.
3. Launch it from the new icon. It runs full screen and works offline once loaded.

Progress is saved on the phone (in the browser's local storage for the site).

## Development

It's plain HTML, CSS and JavaScript with no build step.

```sh
python3 -m http.server 8123
# open http://localhost:8123
```

- `index.html`: page, HUD and styles
- `game.js`: level generator, game logic and canvas rendering
- `sw.js`: offline cache. Bump `VERSION` when shipping changes so installed copies update
- `tools/autoplay.js`: Playwright bot that plays levels 1-50 to check difficulty

Levels are generated from the level number, so the same level is always the same layout. The generator only keeps a layout once it has found an order that clears the lot (following flip buses and tunnels), then builds the passenger line from that order, so every level is solvable with 4 bays and no boosters. Buses of the same color fill in the order they arrived, which is what keeps that true.

Deployed with GitHub Pages from the `main` branch.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

This is an independent fan project. It isn't affiliated with or endorsed by the makers of any commercial game and uses none of their art or code.
