# Forge — automated gym assistant (installable web app)

A phone-first web app (PWA) that builds a training plan, picks the weights for every session,
times the rests, spots personal records and tracks progress. No backend, no account, no cost:
everything runs and is stored on the phone, and it works offline.

## What's automatic
- **Plan**: generated from goal, experience, days per week and equipment (2–6 day splits). Workouts rotate in order, so a missed day never breaks it.
- **Weights**: starter loads from bodyweight, then double progression. Hit the top of the rep range on every set and the weight goes up; miss twice and it drops 10%; 3+ weeks away and it eases off.
- **Deload**: suggested after 6 straight training weeks or 3 stalled lifts; one tap lowers loads and sets for a week, then ends by itself.
- **During a workout**: warm-up sets, rest timer (beep and vibrate), screen stays awake, record detection (estimated 1-rep max).
- **Insights** on the home screen: weekly goal, streaks, stalled lifts, bodyweight trend against the goal, weigh-in reminders.
- **Daily activity**: steps (typed in from the phone's Health app, since web apps can't read the step counter), water glasses and cardio sessions (calories estimated from activity, time and bodyweight), each with goals set from the profile.
- **Exercise how-to**: three form cues for every exercise plus a link to demo videos; tap any exercise name.
- **Calendar reminders**: builds a repeating calendar file (.ics) for the chosen training days, with an alert, so reminders work without a server.
- **Share card**: a 1080×1350 image of any finished workout for messages or Instagram.

## GIM, the talking coach (`gim.js` + `gim-worker/`)
- Chat by voice or text with an animated avatar. GIM asks about goals, schedule, equipment and injuries, then designs a science-based plan that installs into Forge in one tap (Forge keeps choosing the weights).
- Voice uses the phone's own speech recognition and text-to-speech. Where dictation isn't available, the keyboard's mic works.
- The brain is Claude, reached through a small Cloudflare Worker in `gim-worker/` that holds the API key, checks an access code, and only answers this site. Model and effort are set in `gim-worker/wrangler.toml`.
- The same Worker stores step counts sent each evening by an iPhone Shortcut (Apple Health), and the app pulls them in automatically. Setup steps are in the app (GIM settings, Automatic steps).
- Local test with no cost: `cd gim-worker && npm install && npm test`, or `npm run dev` for a stand-in brain on http://localhost:8787 (access code `test-code`).

## Try it locally
```bash
node serve.mjs        # then open http://localhost:5173
node test-coach.mjs   # tests for the progression logic
```

## Put it on a phone
The files are static, so any HTTPS static host works (HTTPS is required for installing and offline mode).
Upload `index.html`, `styles.css`, `app.js`, `coach.js`, `exercises.js`, `store.js`, `sw.js`,
`manifest.webmanifest` and the `icons/` folder. Easiest options: Netlify (drag the folder onto app.netlify.com/drop),
Cloudflare Pages, or GitHub Pages. Then on the phone:

- **iPhone**: open the link in Safari, tap Share, then Add to Home Screen.
- **Android**: open in Chrome, menu, Install app.

## Updating after you change something
Bump `CACHE` in `sw.js` (for example `forge-1.0.1`) and upload again. Phones pick up the new version the next time they open the app.

## Customising
- Name and colours: `manifest.webmanifest`, `index.html` (title), `:root` in `styles.css`.
- Icon: edit `make-icons.mjs` and run `node make-icons.mjs`.
- Exercises and day templates: `exercises.js` and the `DAYS` / `PROGRAMS` tables in `coach.js`.

## Limits
- Data lives on the phone only. The Profile tab has Export/Import backup for changing phones.
- No scheduled push reminders (those need a server). The assistant nudges when the app is opened.
