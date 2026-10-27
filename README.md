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

The **Power-ups** button below the left chute opens a tray showing your VIP, Shuffle and Sort inventories. Tap a power-up to use it, or tap outside the tray to close it. **Shop** is below the right chute. Keeping these controls beside the carousel leaves more room for the parking lot.

Special pieces show up as you go:

- **Mystery buses (level 8+)** are grey with a "?" until nothing blocks their way out. Tapping or holding a blocked bus won't reveal its color.
- **Flip buses (every third level from 12)** carry a turn-around sign and turn around each time any bus leaves the lot.
- **Tunnels (level 15+)** release a new bus whenever the spot in front of them is clear. The badge shows how many are left inside.

- **Ice buses (from level 56)** are frozen. The number counts down each time a bus leaves the lot.
- **Bomb buses (from level 58)** count down each time another bus leaves. Get them out before they hit zero, or defuse one for 100 coins.
- **Locked buses (from level 60)** open when a bus the color of the padlock leaves the lot.
- **Traffic cones (from level 64)** never move.
- **Gates (from level 70)** sit in the lot like cones but open and close as buses leave. An N-gate is shut for N moves, then open for N moves. The badge counts the moves until it changes. Gates only go where the winning order finds them open.
- **HARD levels (every 10th level)** have a smaller carousel and pay double coins. Through level 100, they also pack buses into shapes such as a ring, plus, diamond or L.

After level 100, new chapters focus on the new rules, with mystery buses returning after each introduction. The first three levels of each chapter use fewer buses and colours; later lessons combine it with the previous chapter. From level 201, the rules appear in increasingly crowded combinations.

| Starts at | New challenge |
| --- | --- |
| 101 | **Road crews:** an entire left, right or bottom exit closes for a visible number of departures. Waiting and blocked taps do not advance the countdown. |
| 111 | **Mixed pairs:** rows contain pairs of colours. Passengers board individually, and empty places refill without replacing their neighbours. |
| 121 | **Elephant parade:** a partial roadblock travels down the right road, across the bottom and up the left, then back. The dotted marker previews its next position. |
| 131 | **Linked buses:** buses with the same chain number depart together, requiring two clear exit paths and two free bays. They count as two departures. |
| 141 | **Switch pads:** dispatching the bus on the striped pad opens barrier A and closes barrier B. |
| 151 | **Pairs and singles:** passenger rows can contain a pair and two singles. |
| 161 | **Two-stage routes:** fill the first roof colour, then the second. The bay counter shows the active stage and its remaining passengers. |
| 171 | **Alternating chutes:** the active feed changes every two departures; an empty chute yields to the other one. |
| 181 | **Transfer tunnels:** a T-marked bus uses its first departure to move to the outlined destination and turn. It takes no bay until dispatched again. |
| 191 | **Four-colour rows:** each person in a row can have a different colour. |

The carousel has a taller inner island, and the chutes join its upper curved corners, leaving more room for the miniature scenery. The island shows departure counts and chute changes. **Menu → This level’s rules** explains the current combination. Roadblocks restrict the exit from the lot; buses already on the perimeter road can continue to the bays.

Each level is set somewhere people line up for buses, from 12 miniature scenes that repeat: stadium, county fair, music festival, airport, factory, train station, ferry port, school, beach, ski resort, theme park and downtown. Each has its own scenery and gentle animation, including a turning Ferris wheel, stage lights, a passing train, surf and ski lifts. Scenery motion pauses with the game and respects your device's Reduce Motion setting.

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

- **Shuffle** mixes up the colors of the buses still in the lot, keeping complete two-stage routes together and preserving passenger totals.
- **Sort** moves passengers who fit your parked buses to the front of the line.
- **VIP** flies any bus, even a blocked one, straight to the VIP bay. Rescuing a linked bus separates it from its partner; a transfer bus skips its tunnel.

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
- `advanced.js`: chapter progression, road rules, bus routes and passenger planning after level 100
- `scenery.js`: the level themes and the parking lot background
- `sw.js`: offline cache. Bump `VERSION` when shipping changes so installed copies update
- `tools/autoplay.js`: Playwright bot that plays levels 1-50 to check difficulty
- `tools/ui-checks.js`: Playwright checks for the power-up tray, Shop, touch targets and all 12 animated scenes at three phone sizes (`node tools/ui-checks.js`, with the local server running and Playwright installed)
- `tools/mechanics-checks.js`: dependency-free rule checks and complete game simulations, including legacy levels, phone sizes and frame rates (`node tools/mechanics-checks.js`; defaults to levels 1–210 plus samples through 1000)
- `tools/headless.js`: minimal DOM adapter used by those simulations; executes the real `game.js` rules
- `tools/advanced-ui-checks.js`: browser checks for boosters with linked, staged and transfer buses, current-rule help and carousel geometry

Levels are seeded by their number. Through level 100, the generator finds a clearing order (following flip buses and tunnels) and builds the passenger line from it. Later chapters also simulate the complete solution through the real boarding and departure rules with four bays and no boosters before showing the level. Alternating feeds are planned by recording which chute supplies each passenger, then replaying both real queues. A candidate that fails this check is discarded. Verified advanced candidates are cached by level and screen size; different screen sizes may select a different candidate. Existing save data is retained.

Deployed with GitHub Pages from the `main` branch.

## License

GPL-3.0-or-later. See [LICENSE](LICENSE).

This is an independent fan project. It isn't affiliated with or endorsed by the makers of any commercial game and uses none of their art or code.
